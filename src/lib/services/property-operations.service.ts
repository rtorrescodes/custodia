import { prisma, withTenantRLS } from "@/lib/prisma";
import { accountingService } from "@/lib/services/accounting-service";
import { Prisma } from "@/generated/prisma/client";

/**
 * SERVICIO CENTRALIZADO DE OPERACIONES Y GESTIÓN FIDUCIARIA (CUS-09C)
 * 
 * Este servicio contiene la lógica de negocio y transaccionalidad compartida
 * entre Server Actions (interfaz web/móvil) y suites de integración / concurrencia.
 * 
 * Reglas de Protección Fiduciaria y Concurrencia PostgreSQL:
 * 1. Bloqueo pesimista a nivel de fila (`SELECT id FROM "Property" WHERE id = $1 FOR UPDATE`)
 *    para serializar asignaciones de compromisos y evitar carreras o sobregiros.
 * 2. Idempotencia estricta en acreditación de aportaciones y pagos a proveedores (anti-duplicación).
 * 3. Trazabilidad completa de doble partida en JournalEntry y JournalLine.
 */

export interface ApproveQuoteInput {
  quoteId: string;
  expectedVersion?: number;
  reason?: string;
}

export interface VerifyContributionInput {
  contributionId: string;
  verifiedAmount?: number;
  notes?: string;
}

export interface RecordVendorPaymentInput {
  workOrderId: string;
  amount: number;
  isFinalPayment?: boolean;
  paymentMethod?: "TRANSFER" | "CASH" | "CARD";
  reference: string;
  notes?: string;
}

export const propertyOperationsService = {
  /**
   * Aprueba una cotización formal y evalúa transaccionalmente con bloqueo FOR UPDATE
   * si hay fondos disponibles para iniciar (IN_PROGRESS) o si requiere aportación (AWAITING_APPROVAL).
   */
  async approveQuote(
    tenantId: string,
    userId: string,
    input: ApproveQuoteInput,
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      const quote = await tx.workOrderQuote.findUnique({
        where: { id: input.quoteId },
        include: { workOrder: true }
      });

      if (!quote) throw new Error("Cotización no encontrada.");

      const expectedVersion = input.expectedVersion ?? 1;
      if (quote.version !== expectedVersion) {
        throw new Error(
          `Material change detected: Quote version has changed from ${expectedVersion} to ${quote.version}. Must review updated version.`
        );
      }

      // 1. Bloqueo pesimista en PostgreSQL para evitar carreras concurrentes en la propiedad
      await tx.$executeRaw`
        SELECT id FROM "Property" 
        WHERE id = ${quote.workOrder.propertyId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;

      // Re-leer la orden de trabajo tras adquirir el bloqueo
      const currentWo = await tx.workOrder.findUnique({
        where: { id: quote.workOrderId, tenantId }
      });
      // 1.5. Idempotencia de aprobación: Si esta versión ya fue aprobada previamente
      if (quote.status === "APPROVED") {
        const existingContrib = await tx.ownerContribution.findFirst({
          where: {
            tenantId,
            propertyId: quote.workOrder.propertyId,
            workOrderId: quote.workOrderId,
            status: { in: ["REQUESTED", "REPORTED", "VERIFIED"] },
          }
        });

        const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(
          tenantId,
          quote.workOrder.propertyId,
          tx
        );
        const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;
        const totalCost = Number(quote.totalCost);
        const hasSufficientFunds = currentWo.status === "IN_PROGRESS" || currentWo.status === "COMPLETED" || availableFunds >= totalCost;
        const deficitAmount = hasSufficientFunds ? 0 : (totalCost - Math.max(0, availableFunds));

        return {
          approved: true,
          quoteId: quote.id,
          version: quote.version,
          hasSufficientFunds,
          availableFunds,
          requiredFunds: totalCost,
          deficitAmount,
          statusLabel: currentWo.status === "COMPLETED" ? "Aprobada y completada" : (currentWo.status === "IN_PROGRESS" ? "Aprobada y en ejecución" : (hasSufficientFunds ? "Aprobada y autorizada para iniciar" : "Aprobada, pendiente de fondos")),
          linkedContributionId: existingContrib?.id || null,
          readyToStart: hasSufficientFunds,
          idempotentSkip: true,
        };
      }

      if (currentWo.status === "COMPLETED") {
        throw new Error("No se puede aprobar una cotización en una orden ya completada.");
      }
      if (currentWo.status === "CANCELLED") {
        throw new Error("No se puede aprobar una cotización en una orden cancelada.");
      }

      const totalCost = Number(quote.totalCost);

      // 2. Comprobación fiduciaria en la transacción bloqueada
      const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(
        tenantId,
        quote.workOrder.propertyId,
        tx
      );
      const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;
      const hasSufficientFunds = availableFunds >= totalCost;

      // 3. Registrar decisión formal del propietario
      const updatedQuote = await tx.workOrderQuote.update({
        where: { id: input.quoteId },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
          approvalReason: input.reason || "Aprobado formalmente por el propietario",
        }
      });

      const deficitAmount = hasSufficientFunds ? 0 : (totalCost - Math.max(0, availableFunds));
      // Si la orden ya estaba en IN_PROGRESS (ej. reintento o aprobación complementaria), no degradar a AWAITING_APPROVAL
      const newWOStatus = currentWo.status === "IN_PROGRESS" 
        ? "IN_PROGRESS" 
        : (hasSufficientFunds ? "IN_PROGRESS" : "AWAITING_APPROVAL");

      // 4. Actualizar orden de trabajo con el presupuesto aprobado (estimatedCost) sin resetear pagos acumulados previos
      const preservedActualCost = currentWo.actualCost !== null ? currentWo.actualCost : 0;
      await tx.workOrder.update({
        where: { id: quote.workOrderId },
        data: {
          status: newWOStatus,
          estimatedCost: quote.totalCost,
          actualCost: preservedActualCost,
        }
      });

      // 5. Si faltan fondos, generar o reutilizar solicitud de aportación ligada por FK
      let linkedContributionId: string | null = null;
      if (!hasSufficientFunds && deficitAmount > 0) {
        const existingContrib = await tx.ownerContribution.findFirst({
          where: {
            tenantId,
            propertyId: quote.workOrder.propertyId,
            workOrderId: quote.workOrderId,
            status: { in: ["REQUESTED", "REPORTED"] },
          }
        });

        if (!existingContrib) {
          const newContrib = await tx.ownerContribution.create({
            data: {
              tenantId,
              propertyId: quote.workOrder.propertyId,
              ownerId: userId,
              workOrderId: quote.workOrderId,
              amount: deficitAmount,
              currency: quote.currency || "MXN",
              destinationAccount: "PM_ESCROW",
              reason: `Fondeo para reparación aprobada: ${quote.workOrder.title} (Cotización v${quote.version})`,
              status: "REQUESTED",
            }
          });
          linkedContributionId = newContrib.id;
        } else {
          linkedContributionId = existingContrib.id;
        }
      }

      return {
        approved: true,
        quoteId: updatedQuote.id,
        version: updatedQuote.version,
        hasSufficientFunds,
        availableFunds,
        requiredFunds: totalCost,
        deficitAmount,
        statusLabel: hasSufficientFunds ? "Aprobada y autorizada para iniciar" : "Aprobada, pendiente de fondos",
        linkedContributionId,
        readyToStart: hasSufficientFunds,
      };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  },

  /**
   * Verifica la recepción de una aportación de fondos y acredita en el ledger con protección de idempotencia.
   */
  async verifyOwnerContribution(
    tenantId: string,
    userId: string,
    input: VerifyContributionInput,
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      // Bloqueo pesimista sobre la aportación para evitar doble acreditación concurrente
      // 1. Bloqueo pesimista exclusivo sobre la fila de OwnerContribution en PostgreSQL
      await tx.$executeRaw`
        SELECT id FROM "OwnerContribution" 
        WHERE id = ${input.contributionId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;

      const contribution = await tx.ownerContribution.findUnique({
        where: { id: input.contributionId, tenantId },
      });

      if (!contribution) throw new Error("Aportación no encontrada.");

      // Idempotencia: si ya está verificada, retornar el estado previo sin duplicar
      if (contribution.status === "VERIFIED") {
        return {
          contributionId: contribution.id,
          status: "VERIFIED",
          releasedAmount: Number(contribution.verifiedAmount || contribution.amount),
          verifiedAt: contribution.verifiedAt,
          idempotentSkip: true
        };
      }

      // 2. Bloquear fila de la propiedad para sincronizar balances
      await tx.$executeRaw`
        SELECT id FROM "Property" 
        WHERE id = ${contribution.propertyId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;

      // Importe formalmente confirmado por el PM
      const confirmedAmount = input.verifiedAmount !== undefined
        ? input.verifiedAmount
        : (contribution.reportedAmount !== null ? Number(contribution.reportedAmount) : Number(contribution.amount));

      const now = new Date();
      const updatedContribution = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "VERIFIED",
          verifiedAmount: confirmedAmount,
          verifiedAt: now,
          verifiedById: userId,
          availableAt: now,
          notes: input.notes,
        }
      });

      // Acreditar en partida doble
      const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId, tx);
      const amountNum = confirmedAmount;

      await accountingService.postEntry({
        tenantId,
        idempotencyKey: `owner-contrib-${updatedContribution.id}`,
        effectiveDate: now,
        description: `Aportación verificada de fondos de propietario: ${updatedContribution.reason}`,
        createdById: userId,
        lines: [
          {
            accountId: accounts.cashPmEscrow,
            debit: amountNum,
            credit: 0,
            currency: updatedContribution.currency,
            propertyId: updatedContribution.propertyId,
            ownerId: updatedContribution.ownerId,
          },
          {
            accountId: accounts.ownerFundsPayable,
            debit: 0,
            credit: amountNum,
            currency: updatedContribution.currency,
            propertyId: updatedContribution.propertyId,
            ownerId: updatedContribution.ownerId,
          }
        ]
      }, tx);

      // Registrar en Transaction si no existe previamente por idempotencia
      const txDescription = `Aportación recibida y verificada: ${updatedContribution.reason} [${updatedContribution.id}]`;
      const existingTx = await tx.transaction.findFirst({
        where: {
          tenantId,
          propertyId: updatedContribution.propertyId,
          description: txDescription
        }
      });

      if (!existingTx) {
        await tx.transaction.create({
          data: {
            tenantId,
            propertyId: updatedContribution.propertyId,
            type: "INCOME",
            category: "APORTACION_PROPIETARIO",
            amount: amountNum,
            currency: updatedContribution.currency,
            description: txDescription,
            createdAt: now,
          }
        });
      }

      return {
        contributionId: updatedContribution.id,
        status: "VERIFIED",
        releasedAmount: amountNum,
        verifiedAt: updatedContribution.verifiedAt,
        availableAt: updatedContribution.availableAt,
      };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  },

  /**
   * Registra el reporte de una transferencia bancaria por el propietario con comprobante privado opcional
   * y registro explícito de discrepancia sin modificar la solicitud original ni liberar fondos prematuramente.
   */
  async reportOwnerContribution(
    tenantId: string,
    userId: string,
    input: {
      contributionId: string;
      reference: string;
      transferDate: string;
      reportedAmount: number;
      reportedCurrency?: string;
      notes?: string;
      storagePath?: string | null;
      fileBuffer?: Buffer | null;
      fileName?: string | null;
      fileMimeType?: string | null;
    },
    externalTx?: any
  ) {
    if (externalTx && (input.fileBuffer || input.storagePath)) {
      throw new Error(
        "Las operaciones de aportación con gestión de archivos físicos en Storage no admiten transacción externa (externalTx) no confinada. Deben gestionar su propia frontera de transacción para garantizar compensación y limpieza tras el COMMIT."
      );
    }

    // Subida previa y segura fuera de la transacción para poder compensar si falla la DB
    let newStoragePath: string | null = input.storagePath || null;
    let uploadedHere = false;

    if (input.fileBuffer && input.fileName && input.fileMimeType) {
      const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
      const targetContribution = await prisma.ownerContribution.findUnique({
        where: { id: input.contributionId, tenantId },
        select: { propertyId: true }
      });
      if (!targetContribution) {
        throw new Error("Solicitud de aportación no encontrada");
      }
      const uploadResult = await evidenceStorageService.uploadFile({
        tenantId,
        propertyId: targetContribution.propertyId,
        filename: input.fileName,
        buffer: input.fileBuffer,
        mimeType: input.fileMimeType,
      });
      newStoragePath = uploadResult.path;
      uploadedHere = true;
    }

    let previousEvidenceToDelete: string | null = null;

    const runInTx = async (tx: any) => {
      const contribution = await tx.ownerContribution.findUnique({
        where: { id: input.contributionId, tenantId },
      });

      if (!contribution) {
        throw new Error("Solicitud de aportación no encontrada");
      }

      if (contribution.status === "VERIFIED") {
        throw new Error("Esta aportación ya fue verificada y liberada.");
      }

      const previousEvidence = contribution.evidenceUrl;

      const requestedAmt = Number(contribution.amount);
      const diff = input.reportedAmount - requestedAmt;
      const currency = input.reportedCurrency || contribution.currency;
      const discrepancyNote = diff !== 0
        ? `[REVISIÓN DE IMPORTE]: Solicitado: $${requestedAmt.toLocaleString()} ${contribution.currency} | Reportado: $${input.reportedAmount.toLocaleString()} ${currency} (Diferencia: ${diff > 0 ? "+" : ""}$${diff.toLocaleString()})`
        : "";

      const combinedNotes = [
        `Ref: ${input.reference} · Fecha transf: ${input.transferDate}`,
        input.notes ? `Nota: ${input.notes}` : "",
        discrepancyNote
      ].filter(Boolean).join(" | ");

      const updated = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "REPORTED",
          reportedAt: new Date(),
          reportedAmount: new Prisma.Decimal(input.reportedAmount),
          reference: input.reference,
          evidenceUrl: newStoragePath || previousEvidence,
          notes: combinedNotes,
        }
      });

      if (newStoragePath && previousEvidence && previousEvidence !== newStoragePath) {
        previousEvidenceToDelete = previousEvidence;
      }

      return {
        contributionId: updated.id,
        status: updated.status,
        requestedAmount: requestedAmt,
        reportedAmount: input.reportedAmount,
        currency,
        discrepancy: diff !== 0,
        evidenceUrl: updated.evidenceUrl,
        notes: updated.notes,
        verified: false,
        message: "Transferencia reportada. Pendiente de verificar recepción."
      };
    };

    try {
      const result = externalTx
        ? await runInTx(externalTx)
        : await withTenantRLS(tenantId, runInTx);

      // Si la transacción tuvo éxito y había un archivo anterior reemplazado, eliminar el viejo
      if (previousEvidenceToDelete) {
        const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
        await evidenceStorageService.deleteFile(previousEvidenceToDelete).catch(() => {});
      }

      return result;
    } catch (err) {
      // Compensación: Si falló la transacción en BD y habíamos subido un archivo nuevo en esta llamada, limpiarlo
      if (uploadedHere && newStoragePath) {
        const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
        await evidenceStorageService.deleteFile(newStoragePath).catch(() => {});
      }
      throw err;
    }
  },

  /**
   * Inicia formalmente una orden de trabajo (pasa a IN_PROGRESS),
   * validando transaccionalmente con SELECT FOR UPDATE la solvencia de fondos fiduciarios
   * para impedir arranques en sobregiro.
   */
  async startWorkOrder(
    tenantId: string,
    userId: string,
    input: { workOrderId: string; notes?: string },
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId, tenantId },
        include: { quotes: true }
      });

      if (!wo) throw new Error("Orden de trabajo no encontrada.");

      // Bloqueo pesimista de la propiedad
      await tx.$executeRaw`
        SELECT id FROM "Property" 
        WHERE id = ${wo.propertyId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;

      const acceptedQuote = wo.quotes.find((q: any) => q.status === "ACCEPTED");
      const requiredCost = acceptedQuote ? Number(acceptedQuote.totalCost) : Number(wo.estimatedCost);

      const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(tenantId, wo.propertyId, tx);
      const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;

      // Fondos etiquetados específicamente para ESTA orden
      const earmarkedForThisOrder = await tx.ownerContribution.findMany({
        where: {
          propertyId: wo.propertyId,
          tenantId,
          status: "VERIFIED",
          workOrderId: wo.id
        },
        select: { verifiedAmount: true, amount: true }
      });
      const orderEarmarked = earmarkedForThisOrder.reduce((sum: number, c: any) => {
        return sum + Number(c.verifiedAmount || c.amount || 0);
      }, 0);

      // Fondos totales utilizables para ESTA orden = disponibles generales + etiquetados a esta orden
      const totalUsableForThisOrder = availableFunds + orderEarmarked;

      // Si la orden ya estaba en IN_PROGRESS o si hay fondos suficientes
      if (wo.status !== "IN_PROGRESS" && totalUsableForThisOrder < requiredCost) {
        throw new Error(
          `Fondos insuficientes para iniciar orden. Requerido: $${requiredCost}, Disponible total (incluye etiquetados): $${totalUsableForThisOrder}. Se requiere completar aportación.`
        );
      }

      const updated = await tx.workOrder.update({
        where: { id: input.workOrderId, tenantId },
        data: {
          status: "IN_PROGRESS",
        }
      });

      return {
        workOrderId: updated.id,
        status: updated.status,
        startedAt: new Date(),
        requiredCost,
        availableFunds
      };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  },

  /**
   * Registra el pago a un proveedor con partida doble, validando liquidez con bloqueo pesimista
   * e impidiendo duplicación o pagos sobregirados.
   */
  async recordVendorPayment(
    tenantId: string,
    userId: string,
    input: RecordVendorPaymentInput,
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId, tenantId },
        include: { property: true }
      });

      if (!wo) throw new Error("Orden de trabajo no encontrada.");

      if (wo.property.fundCustodian === "DIRECT_OWNER") {
        throw new Error("Modalidad DIRECT_OWNER: Los pagos son realizados directamente por el propietario.");
      }

      // Bloqueo pesimista sobre la propiedad en PostgreSQL
      await tx.$executeRaw`
        SELECT id FROM "Property" 
        WHERE id = ${wo.propertyId} AND "tenantId" = ${tenantId} 
        FOR UPDATE
      `;

      // Re-leer la orden de trabajo tras adquirir el bloqueo
      const currentWo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId, tenantId }
      });
      if (!currentWo) throw new Error("Orden de trabajo no encontrada tras bloqueo.");

      // Clave estable de operación: workOrderId + reference
      const paymentKey = `PAY_WO_${currentWo.id}_${input.reference}`;

      // Idempotencia conjunta por relación persistente de clave estable y workOrderId
      const existingTx = await tx.transaction.findFirst({
        where: {
          tenantId,
          workOrderId: currentWo.id,
          paymentKey: paymentKey,
        }
      });

      if (existingTx) {
        const existingAmount = Number(existingTx.amount);
        if (Math.abs(existingAmount - input.amount) > 0.01) {
          throw new Error(
            `Conflicto de idempotencia: La clave de pago '${input.reference}' para la orden ${currentWo.id} ya fue registrada previamente con un importe diferente ($${existingAmount} vs $${input.amount}).`
          );
        }
        // Buscar el asiento contable original si existe
        const existingJournalEntry = await tx.journalEntry.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId,
              idempotencyKey: `vendor-pay-wo-${currentWo.id}-${input.reference}`
            }
          }
        });

        // Retornar resultado idempotente con identificador real original sin volver a duplicar
        return {
          workOrderId: currentWo.id,
          paidAmount: existingAmount,
          totalPaidSoFar: Number(currentWo.actualCost || 0),
          isCompleted: currentWo.status === "COMPLETED",
          status: currentWo.status,
          transactionId: existingTx.id,
          journalEntryId: existingJournalEntry?.id || existingTx.id,
          reference: input.reference,
          paidToVendor: true,
          idempotentSkip: true,
        };
      }

      const fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, currentWo.propertyId, tx);
      if (fiduciary.custodiaPmEfectiva < input.amount) {
        throw new Error(
          `Fondos insuficientes en custodia PM para emitir pago (${fiduciary.custodiaPmEfectiva} < ${input.amount}). Requiere aportación previa.`
        );
      }

      const previousPaid = Number(currentWo.actualCost || 0);
      const estimated = Number(currentWo.estimatedCost || 0);
      const remainingCommitmentForThisOrder = Math.max(0, estimated - previousPaid);
      const effectiveAvailableForThisWO = fiduciary.disponibleNuevasObligaciones + remainingCommitmentForThisOrder;

      if (effectiveAvailableForThisWO < input.amount) {
        throw new Error(
          `Fondos insuficientes netos para liquidar la orden de trabajo (Disponible neto considerando compromiso: $${effectiveAvailableForThisWO.toFixed(2)} MXN, Requerido: $${input.amount.toFixed(2)} MXN).`
        );
      }

      const now = new Date();
      const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId, tx);

      // Partida doble con idempotencia
      const idempotencyKey = `vendor-pay-wo-${currentWo.id}-${input.reference}`;
      const entry = await accountingService.postEntry({
        tenantId,
        idempotencyKey,
        effectiveDate: now,
        description: `Pago a proveedor por orden de trabajo ${currentWo.title}: Ref ${input.reference}${input.isFinalPayment ? " (Finiquito)" : " (Anticipo/Parcial)"}`,
        createdById: userId,
        lines: [
          {
            accountId: accounts.maintenanceExpense,
            debit: input.amount,
            credit: 0,
            currency: "MXN",
            propertyId: currentWo.propertyId,
          },
          {
            accountId: accounts.cashPmEscrow,
            debit: 0,
            credit: input.amount,
            currency: "MXN",
            propertyId: currentWo.propertyId,
          }
        ]
      }, tx);

      // Registrar transacción vinculada con clave estable y workOrderId
      const createdTx = await tx.transaction.create({
        data: {
          tenantId,
          propertyId: currentWo.propertyId,
          workOrderId: currentWo.id,
          paymentKey: paymentKey,
          type: "EXPENSE",
          category: "MANTENIMIENTO",
          amount: input.amount,
          currency: "MXN",
          description: `Pago a proveedor: ${currentWo.title} (Ref: ${input.reference})`,
          createdAt: now,
        }
      });

      const newAccumulatedCost = previousPaid + input.amount;
      const isCompleted = input.isFinalPayment || newAccumulatedCost >= estimated;
      const newStatus = isCompleted ? "COMPLETED" : "IN_PROGRESS";

      await tx.workOrder.update({
        where: { id: currentWo.id },
        data: {
          actualCost: newAccumulatedCost,
          status: newStatus,
        }
      });

      return {
        workOrderId: currentWo.id,
        paidAmount: input.amount,
        totalPaidSoFar: newAccumulatedCost,
        isCompleted,
        status: newStatus,
        transactionId: createdTx.id,
        journalEntryId: entry.id,
        reference: input.reference,
        paidToVendor: true,
      };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  },

  /**
   * Cancela una orden de trabajo y desafecta de forma trazable las aportaciones vinculadas.
   */
  async cancelWorkOrder(
    tenantId: string,
    userId: string,
    input: { workOrderId: string; cancellationReason: string },
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId, tenantId },
        include: { contributions: true }
      });

      if (!wo) throw new Error("Orden de trabajo no encontrada.");
      if (wo.status === "COMPLETED") throw new Error("No se puede cancelar una orden ya completada.");

      // 1. Cancelar la orden
      const updatedWo = await tx.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          status: "CANCELLED",
          cancellationReason: input.cancellationReason,
        }
      });

      // 2. Si tenía aportaciones vinculadas, desafectarlas para que retornen al disponible general
      if (wo.contributions && wo.contributions.length > 0) {
        for (const c of wo.contributions) {
          if (c.status === "REQUESTED") {
            await tx.ownerContribution.update({
              where: { id: c.id },
              data: {
                status: "CANCELLED",
                notes: `${c.notes || ""}\n[ORDEN CANCELADA]: Solicitud cancelada por cancelación de orden ${wo.title}`.trim()
              }
            });
          } else if (c.status === "VERIFIED") {
            await tx.ownerContribution.update({
              where: { id: c.id },
              data: {
                workOrderId: null,
                notes: `${c.notes || ""}\n[ORDEN CANCELADA]: Fondos liberados al saldo disponible general por cancelación de orden ${wo.title}`.trim()
              }
            });
          }
        }
      }

      return {
        workOrderId: updatedWo.id,
        status: "CANCELLED",
        releasedFunds: true,
        cancellationReason: input.cancellationReason,
      };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  },

  /**
   * Obtiene la URL firmada de un comprobante validando membresía activa y titularidad.
   */
  async getEvidenceSignedUrl(
    tenantId: string,
    userId: string,
    input: { contributionId?: string; storagePath?: string },
    externalTx?: any
  ) {
    const runInTx = async (tx: any) => {
      let resolvedPath: string | null = null;

      if (input.contributionId) {
        const contribution = await tx.ownerContribution.findUnique({
          where: { id: input.contributionId, tenantId },
          include: {
            property: {
              include: {
                owners: true
              }
            }
          }
        });

        if (!contribution || !contribution.evidenceUrl) {
          throw new Error("Evidencia no encontrada o sin archivo adjunto.");
        }

        const user = await tx.user.findUnique({ where: { id: userId } });
        const member = await tx.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId, userId } }
        });

        if (member && member.status !== "ACTIVE") {
          throw new Error("Acceso denegado: Membresía no activa o revocada.");
        }

        const isManager = (member?.status === "ACTIVE" && (member.role === "PM_ADMIN" || member.role === "PM_STAFF")) ||
          (user?.tenantId === tenantId && (user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "SUPER_ADMIN"));
        const isOwnerOfProperty = contribution.property.owners.some((o: any) => o.userId === userId) || contribution.ownerId === userId;

        if (!isManager && !isOwnerOfProperty) {
          throw new Error("Acceso denegado: No cuenta con permisos para consultar la evidencia de esta propiedad.");
        }

        resolvedPath = contribution.evidenceUrl;
      } else if (input.storagePath) {
        const parts = input.storagePath.split("/");
        if (parts.length < 3 || parts[0] !== tenantId) {
          throw new Error("Acceso denegado: Ruta de almacenamiento no válida para este tenant.");
        }

        const propId = parts[1];
        const prop = await tx.property.findUnique({
          where: { id: propId, tenantId },
          include: { owners: true }
        });

        if (!prop) {
          throw new Error("Inmueble no encontrado en esta organización.");
        }

        const user = await tx.user.findUnique({ where: { id: userId } });
        const member = await tx.tenantMember.findUnique({
          where: { tenantId_userId: { tenantId, userId } }
        });

        if (member && member.status !== "ACTIVE") {
          throw new Error("Acceso denegado: Membresía no activa o revocada.");
        }

        const isManager = (member?.status === "ACTIVE" && (member.role === "PM_ADMIN" || member.role === "PM_STAFF")) ||
          (user?.tenantId === tenantId && (user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "SUPER_ADMIN"));
        const isOwnerOfProperty = prop.owners.some((o: any) => o.userId === userId);

        if (!isManager && !isOwnerOfProperty) {
          throw new Error("Acceso denegado: No cuenta con titularidad sobre este inmueble.");
        }

        resolvedPath = input.storagePath;
      }

      if (!resolvedPath || resolvedPath.startsWith("http://") || resolvedPath.startsWith("https://")) {
        throw new Error("Ruta de archivo no permitida o insegura. Solo se autorizan archivos privados del almacén fiduciario.");
      }

      const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
      const signedUrl = await evidenceStorageService.getSignedViewUrl(resolvedPath, 900);
      return { signedUrl };
    };

    if (externalTx) {
      return runInTx(externalTx);
    }
    return withTenantRLS(tenantId, runInTx);
  }
};
