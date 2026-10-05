"use server"

import { safeAction } from "@/lib/auth/action-wrapper"
import { withTenantRLS } from "@/lib/prisma"
import { z } from "zod"
import { translateText } from "@/lib/services/translation.service"
import { accountingService } from "@/lib/services/accounting-service"

// -------------------------------------------------------------
// 1. Reportar Gasto / Reparación con Validación Fiduciaria Real (A1)
// -------------------------------------------------------------
const createExpenseSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(5),
  estimatedCost: z.number().positive(),
  laborCost: z.number().min(0).default(0),
  materialCost: z.number().min(0).default(0),
  category: z.string().default("MAINTENANCE"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
})

export async function createExpenseAction(data: z.infer<typeof createExpenseSchema>) {
  return safeAction(createExpenseSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // 1. Obtener resumen fiduciario real y política del acuerdo de administración
      const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(tenantId, input.propertyId, tx);
      const policy = fiduciarySummary.politicaGastoPM;

      // CUS-09B Corrección 1: Si no está configurado (null), NO inventar $1,000 MXN. Requiere aprobación obligatoria.
      const isConfigured = policy.estaConfigurado;
      const pmExpenseLimit = policy.limiteAutorizado; // number | null
      const autoApproveCats = policy.categoriasAutoAprobadas || [];
      const isAutoCategory = autoApproveCats.includes(input.category);

      const total = input.laborCost + input.materialCost > 0 
        ? input.laborCost + input.materialCost 
        : input.estimatedCost;

      // Regla de autorización: Si no está configurado, o excede el límite y no es categoría exenta, requiere aprobación
      const requiresOwnerApproval = !isConfigured || (pmExpenseLimit !== null && total > pmExpenseLimit && !isAutoCategory);

      // Fondos disponibles reales desde el motor contable
      const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;

      // Si no requiere aprobación del dueño pero no hay fondos disponibles, se bloquea por liquidez
      const isBlockedFunds = total > availableFunds;

      const initialStatus = requiresOwnerApproval
        ? "AWAITING_APPROVAL"
        : (isBlockedFunds ? "AWAITING_APPROVAL" : "PENDING");

      // Crear WorkOrder
      const wo = await tx.workOrder.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          reporterId: userId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: initialStatus,
          estimatedCost: total,
        }
      });

      // Crear cotización formal versión 1
      const quote = await tx.workOrderQuote.create({
        data: {
          tenantId,
          workOrderId: wo.id,
          version: 1,
          laborCost: input.laborCost,
          materialCost: input.materialCost,
          totalCost: total,
          currency: "MXN",
          status: requiresOwnerApproval ? "SUBMITTED" : "APPROVED",
          itemsJson: [
            { description: "Mano de obra especializada", amount: input.laborCost },
            { description: "Materiales e insumos", amount: input.materialCost },
          ],
          notes: requiresOwnerApproval 
            ? `Excede facultad del PM ($${pmExpenseLimit} MXN). Requiere aprobación del propietario.`
            : (isBlockedFunds ? "Aprobado técnicamente pero bloqueado por fondos insuficientes en cuenta." : "Autorizado bajo facultad del PM.")
        }
      });

      return {
        workOrderId: wo.id,
        quoteId: quote.id,
        requiresOwnerApproval,
        isBlockedFunds,
        availableFunds,
        pmExpenseLimit,
        totalCost: total,
      };
    });
  });
}

// -------------------------------------------------------------
// 2. Aprobar Cotización con Versión Concreta y Comprobación de Fondos
// -------------------------------------------------------------
const approveQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  expectedVersion: z.number().int().default(1),
  reason: z.string().optional(),
})

export async function approveQuoteAction(data: z.infer<typeof approveQuoteSchema>) {
  return safeAction(approveQuoteSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const quote = await tx.workOrderQuote.findUnique({
        where: { id: input.quoteId },
        include: { workOrder: true }
      });

      if (!quote) throw new Error("Quote not found");

      // Comprobar que aprueba exactamente la versión esperada
      if (quote.version !== input.expectedVersion) {
        throw new Error(`Material change detected: Quote version has changed from ${input.expectedVersion} to ${quote.version}. Must review updated version.`);
      }

      const totalCost = Number(quote.totalCost);

      // CUS-09B: Comprobación unificada de fondos fiduciarios disponibles
      const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(tenantId, quote.workOrder.propertyId, tx);
      const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;
      const hasSufficientFunds = availableFunds >= totalCost;

      // 1. Decisión soberana del propietario: Aprobar formalmente la versión y el importe de la cotización
      const updatedQuote = await tx.workOrderQuote.update({
        where: { id: input.quoteId },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
          approvalReason: input.reason || "Aprobado formalmente por el propietario en portal",
        }
      });

      // 2. Comprobación fiduciaria separada de la decisión: ¿Hay fondos para autorizar inicio o requiere aportación?
      const deficitAmount = hasSufficientFunds ? 0 : (totalCost - Math.max(0, availableFunds));

      // 3. Estado de la orden de trabajo:
      // Si tiene fondos -> IN_PROGRESS (autorizada para iniciar ejecución)
      // Si no tiene fondos -> AWAITING_APPROVAL con descripción clara ("Aprobada por dueño; pendiente de fondos")
      const newWOStatus = hasSufficientFunds ? "IN_PROGRESS" : "AWAITING_APPROVAL";

      await tx.workOrder.update({
        where: { id: quote.workOrderId },
        data: {
          status: newWOStatus,
          actualCost: quote.totalCost,
        }
      });

      // 4. Si faltan fondos, generar automáticamente solicitud de aportación ligada si no existe una pendiente
      let linkedContributionId: string | null = null;
      if (!hasSufficientFunds && deficitAmount > 0) {
        const existingContrib = await tx.ownerContribution.findFirst({
          where: {
            tenantId,
            propertyId: quote.workOrder.propertyId,
            status: { in: ["REQUESTED", "REPORTED"] },
            reason: { contains: quote.workOrder.title },
          }
        });

        if (!existingContrib) {
          const newContrib = await tx.ownerContribution.create({
            data: {
              tenantId,
              propertyId: quote.workOrder.propertyId,
              ownerId: userId,
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
    });
  });
}

// -------------------------------------------------------------
// 3. Sustituir / Modificar Cotización (Invalida Aprobación Previa)
// -------------------------------------------------------------
const updateQuoteSchema = z.object({
  workOrderId: z.string().uuid(),
  newLaborCost: z.number().min(0),
  newMaterialCost: z.number().min(0),
  notes: z.string().min(3),
})

export async function updateQuoteAction(data: z.infer<typeof updateQuoteSchema>) {
  return safeAction(updateQuoteSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Buscar la última cotización existente
      const lastQuote = await tx.workOrderQuote.findFirst({
        where: { workOrderId: input.workOrderId, tenantId },
        orderBy: { version: "desc" }
      });

      const nextVersion = (lastQuote?.version || 1) + 1;
      const totalCost = input.newLaborCost + input.newMaterialCost;

      // Si la anterior estaba aprobada o enviada, marcarla como SUPERSEDED
      if (lastQuote) {
        await tx.workOrderQuote.update({
          where: { id: lastQuote.id },
          data: { status: "SUPERSEDED" }
        });
      }

      // Crear nueva versión que requiere nueva decisión obligatoria
      const newQuote = await tx.workOrderQuote.create({
        data: {
          tenantId,
          workOrderId: input.workOrderId,
          version: nextVersion,
          laborCost: input.newLaborCost,
          materialCost: input.newMaterialCost,
          totalCost,
          status: "SUBMITTED", // Vuelve a requerir aprobación
          notes: input.notes,
          itemsJson: [
            { description: "Mano de obra (actualizada)", amount: input.newLaborCost },
            { description: "Materiales y refacciones (actualizado)", amount: input.newMaterialCost }
          ]
        }
      });

      // La orden vuelve a AWAITING_APPROVAL
      await tx.workOrder.update({
        where: { id: input.workOrderId },
        data: {
          status: "AWAITING_APPROVAL",
          estimatedCost: totalCost
        }
      });

      return {
        newQuoteId: newQuote.id,
        version: newQuote.version,
        totalCost,
        previousSuperceded: lastQuote?.id
      };
    });
  });
}

// -------------------------------------------------------------
// 4. Solicitar Aportación de Fondos al Propietario (D)
// -------------------------------------------------------------
const requestContributionSchema = z.object({
  propertyId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default("MXN"),
  reason: z.string().min(5),
})

export async function requestOwnerContributionAction(data: z.infer<typeof requestContributionSchema>) {
  return safeAction(requestContributionSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: input.propertyId, tenantId },
        include: { owners: true }
      });

      if (!property || property.owners.length === 0) {
        throw new Error("Property or owner not found");
      }

      const primaryOwnerId = property.owners[0].userId;

      const contribution = await tx.ownerContribution.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          ownerId: primaryOwnerId,
          amount: input.amount,
          currency: input.currency,
          reason: input.reason,
          status: "REQUESTED",
        }
      });

      return {
        contributionId: contribution.id,
        status: contribution.status,
        amount: Number(contribution.amount)
      };
    });
  });
}

// -------------------------------------------------------------
// 5. Reportar Aportación por el Dueño (Formulario Accesible y Evidencia Privada)
// -------------------------------------------------------------
const reportContributionSchema = z.object({
  contributionId: z.string().uuid(),
  reference: z.string().min(3, "La referencia bancaria es requerida"),
  transferDate: z.string().min(8, "La fecha de transferencia es requerida"),
  reportedAmount: z.number().positive("El importe reportado debe ser mayor a 0"),
  reportedCurrency: z.string().default("MXN"),
  notes: z.string().optional(),
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
  fileMimeType: z.string().optional(),
})

export async function reportOwnerContributionAction(data: z.infer<typeof reportContributionSchema>) {
  return safeAction(reportContributionSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const contribution = await tx.ownerContribution.findUnique({
        where: { id: input.contributionId, tenantId },
      });

      if (!contribution) {
        throw new Error("Solicitud de aportación no encontrada");
      }

      // Si ya está verificada, no se puede sobrescribir
      if (contribution.status === "VERIFIED") {
        throw new Error("Esta aportación ya fue verificada y liberada.");
      }

      let storagePath = contribution.evidenceUrl;

      // Subida de comprobante al almacenamiento privado si se proporcionó archivo
      if (input.fileBase64 && input.fileName && input.fileMimeType) {
        const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
        const fileBuffer = Buffer.from(input.fileBase64, "base64");
        const uploadResult = await evidenceStorageService.uploadFile({
          tenantId,
          propertyId: contribution.propertyId,
          filename: input.fileName,
          buffer: fileBuffer,
          mimeType: input.fileMimeType,
        });
        storagePath = uploadResult.path;
      }

      // Si hay discrepancia de importe solicitado vs reportado, se registra explícitamente en notas
      const requestedAmt = Number(contribution.amount);
      const diff = input.reportedAmount - requestedAmt;
      const discrepancyNote = diff !== 0
        ? `[REVISIÓN DE IMPORTE]: Solicitado: $${requestedAmt.toLocaleString()} ${contribution.currency} | Reportado: $${input.reportedAmount.toLocaleString()} ${input.reportedCurrency} (Diferencia: ${diff > 0 ? "+" : ""}$${diff.toLocaleString()})`
        : "";

      const combinedNotes = [
        `Ref: ${input.reference} · Fecha transf: ${input.transferDate}`,
        input.notes ? `Nota: ${input.notes}` : "",
        discrepancyNote
      ].filter(Boolean).join(" | ");

      // Un comprobante reportado NO libera fondos automáticamente; pasa a REPORTED
      const updated = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "REPORTED",
          reportedAt: new Date(),
          reference: input.reference,
          evidenceUrl: storagePath,
          notes: combinedNotes,
        }
      });

      return {
        contributionId: updated.id,
        status: updated.status,
        requestedAmount: requestedAmt,
        reportedAmount: input.reportedAmount,
        currency: input.reportedCurrency,
        discrepancy: diff !== 0,
        verified: false, // Cero liberación prematura
        message: "Transferencia reportada. Pendiente de verificar recepción."
      };
    });
  });
}

// -------------------------------------------------------------
// 6. Verificar y Liberar Fondos de la Aportación (Acción Administrativa PM)
// -------------------------------------------------------------
const verifyContributionSchema = z.object({
  contributionId: z.string().uuid(),
  notes: z.string().optional(),
})

export async function verifyOwnerContributionAction(data: z.infer<typeof verifyContributionSchema>) {
  return safeAction(verifyContributionSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      if (!isManager) {
        throw new Error("Only property managers can verify and release contribution funds");
      }

      const contribution = await tx.ownerContribution.findUnique({
        where: { id: input.contributionId, tenantId },
      });

      if (!contribution) throw new Error("Contribution not found");
      if (contribution.status === "VERIFIED") {
        return {
          contributionId: contribution.id,
          status: "VERIFIED",
          releasedAmount: Number(contribution.amount),
          verifiedAt: contribution.verifiedAt,
        };
      }

      const now = new Date();
      const updatedContribution = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "VERIFIED",
          verifiedAt: now,
          verifiedById: userId,
          availableAt: now,
          notes: input.notes,
        }
      });

      // Acreditar contablemente en el ledger de partida doble
      const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId, tx);
      const amountNum = Number(updatedContribution.amount);

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

      // Registrar además en Transaction para visibilidad en extractos transaccionales del portal
      await tx.transaction.create({
        data: {
          tenantId,
          propertyId: updatedContribution.propertyId,
          type: "INCOME",
          category: "APORTACION_PROPIETARIO",
          amount: updatedContribution.amount,
          currency: updatedContribution.currency,
          description: `Aportación recibida y verificada: ${updatedContribution.reason}`,
          createdAt: now,
        }
      });

      return {
        contributionId: updatedContribution.id,
        status: "VERIFIED",
        releasedAmount: amountNum,
        verifiedAt: updatedContribution.verifiedAt,
        availableAt: updatedContribution.availableAt,
      };
    });
  });
}

// -------------------------------------------------------------
// 6B. Obtener URL temporal firmada para consultar evidencia privada
// -------------------------------------------------------------
const getSignedEvidenceSchema = z.object({
  storagePath: z.string().min(3),
})

export async function getEvidenceSignedUrlAction(data: z.infer<typeof getSignedEvidenceSchema>) {
  return safeAction(getSignedEvidenceSchema, data, async (input, tenantId) => {
    // Verificar que la ruta pertenece al tenant actual (Zero-Trust path traversal prevention)
    if (!input.storagePath.startsWith(`${tenantId}/`) && !input.storagePath.startsWith("http")) {
      throw new Error("Acceso no autorizado al archivo solicitado");
    }

    const { evidenceStorageService } = await import("@/lib/services/evidence-storage");
    const signedUrl = await evidenceStorageService.getSignedViewUrl(input.storagePath, 900); // 15 minutos
    return { signedUrl };
  });
}

// -------------------------------------------------------------
// 7. Verificación Técnica de Reparación vs. Registro de Pago Separado (Criterio 4)
// -------------------------------------------------------------
const verifyWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  verificationNotes: z.string().min(3),
})

export async function verifyWorkOrderCompletionAction(data: z.infer<typeof verifyWorkOrderSchema>) {
  return safeAction(verifyWorkOrderSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Finalizar la orden técnicamente NO registra salida de bancos
      const wo = await tx.workOrder.update({
        where: { id: input.workOrderId, tenantId },
        data: {
          status: "COMPLETED",
          description: tx.workOrder ? undefined : undefined,
        }
      });

      return {
        workOrderId: wo.id,
        status: "COMPLETED",
        technicallyVerified: true,
        paidToVendor: false, // Distinción estricta
      };
    });
  });
}

// -------------------------------------------------------------
// 7B. Registrar Pago a Proveedor (Liquidación en Ledger Contable)
// -------------------------------------------------------------
const recordVendorPaymentSchema = z.object({
  workOrderId: z.string().uuid(),
  quoteId: z.string().uuid().optional(),
  amount: z.number().positive(),
  isFinalPayment: z.boolean().default(false),
  paymentMethod: z.enum(["TRANSFER", "CASH", "CARD"]).default("TRANSFER"),
  reference: z.string().min(3),
  notes: z.string().optional(),
})

export async function recordVendorPaymentAction(data: z.infer<typeof recordVendorPaymentSchema>) {
  return safeAction(recordVendorPaymentSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id: input.workOrderId, tenantId },
        include: { property: true }
      });

      if (!wo) throw new Error("Work order not found");

      // Validar modalidad: Si la custodia es DIRECT_OWNER o LANDLORD, el PM no dispersa de su cuenta
      if (wo.property.fundCustodian === "DIRECT_OWNER") {
        throw new Error("Modalidad DIRECT_OWNER: Los pagos son realizados directamente por el propietario desde sus cuentas bancarias.");
      }

      // Comprobar disponibilidad de fondos en custodia PM para liquidar
      const fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, wo.propertyId, tx);
      if (fiduciary.custodiaPmEfectiva < input.amount) {
        throw new Error(`Fondos insuficientes en custodia PM para emitir pago (${fiduciary.custodiaPmEfectiva} < ${input.amount}). Requiere aportación previa.`);
      }

      // Regla CUS-09C: No rechazar por descontar primero el compromiso y luego exigir nuevamente el mismo disponible.
      // El pago consume el compromiso de la orden; el disponible de la propiedad después de considerar este compromiso
      // propio es: disponibleNuevasObligaciones + compromisoPropioDeEstaOrden.
      const previousPaid = Number(wo.actualCost || 0);
      const estimated = Number(wo.estimatedCost || 0);
      const remainingCommitmentForThisOrder = Math.max(0, estimated - previousPaid);
      const effectiveAvailableForThisWO = fiduciary.disponibleNuevasObligaciones + remainingCommitmentForThisOrder;

      if (effectiveAvailableForThisWO < input.amount) {
        throw new Error(`Fondos insuficientes netos para liquidar la orden de trabajo (Disponible neto considerando compromiso: $${effectiveAvailableForThisWO.toFixed(2)} MXN, Requerido: $${input.amount.toFixed(2)} MXN).`);
      }

      const now = new Date();
      const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId, tx);

      // 1. Asiento contable de doble partida: Débito Gasto Mantenimiento, Crédito Caja PM Escrow
      const entry = await accountingService.postEntry({
        tenantId,
        idempotencyKey: `vendor-pay-wo-${wo.id}-${input.reference}`,
        effectiveDate: now,
        description: `Pago a proveedor por orden de trabajo ${wo.title}: Ref ${input.reference}${input.isFinalPayment ? " (Finiquito)" : " (Anticipo/Parcial)"}`,
        createdById: userId,
        lines: [
          {
            accountId: accounts.maintenanceExpense,
            debit: input.amount,
            credit: 0,
            currency: "MXN",
            propertyId: wo.propertyId,
          },
          {
            accountId: accounts.cashPmEscrow,
            debit: 0,
            credit: input.amount,
            currency: "MXN",
            propertyId: wo.propertyId,
          }
        ]
      }, tx);

      // 2. Registrar egreso en Transaction para extractos del portal
      await tx.transaction.create({
        data: {
          tenantId,
          propertyId: wo.propertyId,
          type: "EXPENSE",
          category: "MANTENIMIENTO",
          amount: input.amount,
          currency: "MXN",
          description: `Pago a proveedor: ${wo.title} (Ref: ${input.reference})`,
          createdAt: now,
        }
      });

      // 3. Actualizar orden: Acumular costo pagado y determinar status (COMPLETED si es final o cubre total)
      const newAccumulatedCost = previousPaid + input.amount;
      const isCompleted = input.isFinalPayment || newAccumulatedCost >= estimated;
      const newStatus = isCompleted ? "COMPLETED" : "IN_PROGRESS";

      await tx.workOrder.update({
        where: { id: wo.id },
        data: {
          actualCost: newAccumulatedCost,
          status: newStatus,
        }
      });

      return {
        workOrderId: wo.id,
        paidAmount: input.amount,
        totalPaidSoFar: newAccumulatedCost,
        isCompleted,
        status: newStatus,
        journalEntryId: entry.id,
        reference: input.reference,
        paidToVendor: true,
      };
    });
  });
}

// -------------------------------------------------------------
// 8. Programar Llegada / Estadía con Detección de Conflictos de Contrato (E)
// -------------------------------------------------------------
const scheduleStayWithConflictCheckSchema = z.object({
  propertyId: z.string().uuid(),
  guestName: z.string().min(2),
  stayType: z.enum(["MOVE_IN", "ROUTINE", "MOVE_OUT"]).default("MOVE_IN"),
  arrivalDate: z.string(),
  departureDate: z.string().optional(),
  notes: z.string().optional(),
  checklist: z.record(z.string(), z.boolean()).default({}),
})

export async function scheduleStayAction(data: z.infer<typeof scheduleStayWithConflictCheckSchema>) {
  return safeAction(scheduleStayWithConflictCheckSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const arrival = new Date(input.arrivalDate);
      const departure = input.departureDate ? new Date(input.departureDate) : new Date(arrival.getTime() + 86400000 * 3);

      // Comprobar si existe arrendamiento vigente activo que entre en conflicto
      const activeLease = await tx.lease.findFirst({
        where: {
          propertyId: input.propertyId,
          tenantId,
          status: "ACTIVE",
          startDate: { lte: departure },
          endDate: { gte: arrival },
        }
      });

      if (activeLease) {
        // Conflicto: Hay inquilino residiendo. Rechazar o bloquear emisión de pase
        throw new Error("Conflict: Property is currently occupied by an active tenant lease. Owner stays require tenant consent and cannot displace active renters.");
      }

      // Evaluar si todos los ítems obligatorios del checklist están cumplidos
      const checklistEntries = Object.entries(input.checklist);
      const isReady = checklistEntries.length > 0 && checklistEntries.every(([_, checked]) => checked);

      const inspection = await tx.inspection.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          type: input.stayType,
          status: isReady ? "COMPLETED" : "SCHEDULED",
          inspectorName: input.guestName,
          inspectionDate: arrival,
          summaryNotes: input.notes,
          checklistJson: input.checklist,
        }
      });

      // Simulación de pase de acceso Alddea (sin pases reales en prod)
      let alddeaPassPrepared = false;
      if (input.stayType === "MOVE_IN") {
        alddeaPassPrepared = true;
      }

      return {
        inspectionId: inspection.id,
        isReady,
        conflictDetected: false,
        alddeaPassPrepared,
        statusLabel: isReady ? "Lista para llegada" : "En preparación (Checklist pendiente)",
      };
    });
  });
}

// -------------------------------------------------------------
// 8B. Cancelar Estadía Programada y Revocar Acceso
// -------------------------------------------------------------
const cancelStaySchema = z.object({
  inspectionId: z.string().uuid(),
  reason: z.string().min(3),
})

export async function cancelStayAction(data: z.infer<typeof cancelStaySchema>) {
  return safeAction(cancelStaySchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const inspection = await tx.inspection.findUnique({
        where: { id: input.inspectionId, tenantId }
      });

      if (!inspection) throw new Error("Stay inspection record not found");

      const updated = await tx.inspection.update({
        where: { id: input.inspectionId },
        data: {
          status: "DISPUTED", // Representa cancelado/anulado en el enum InspectionStatus
          summaryNotes: `${inspection.summaryNotes || ""}\n[CANCELADA]: ${input.reason}`,
        }
      });

      return {
        inspectionId: updated.id,
        cancelled: true,
        reason: input.reason,
      };
    });
  });
}

// -------------------------------------------------------------
// 8C. Completar y Verificar Visita de Cuidado Preventivo (Actualiza lastCareVisitAt ÚNICAMENTE aquí)
// -------------------------------------------------------------
const completeCareInspectionSchema = z.object({
  inspectionId: z.string().uuid(),
  findings: z.array(z.string()).default([]),
  notes: z.string().min(3),
})

export async function completeCareInspectionAction(data: z.infer<typeof completeCareInspectionSchema>) {
  return safeAction(completeCareInspectionSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const inspection = await tx.inspection.findUnique({
        where: { id: input.inspectionId, tenantId },
        include: { property: true }
      });

      if (!inspection) throw new Error("Care inspection not found");

      // Regla CUS-09C: Comprobar que no haya conflicto con contrato de arrendamiento residencial activo
      const activeLease = await tx.lease.findFirst({
        where: {
          propertyId: inspection.propertyId,
          tenantId,
          status: "ACTIVE",
        }
      });

      if (activeLease) {
        throw new Error("Conflicto de ocupación: El inmueble tiene un arrendamiento activo. Las visitas de cuidado en inmuebles desocupados están suspendidas.");
      }

      const now = new Date();

      // Actualizar la inspección a COMPLETED
      const updatedInspection = await tx.inspection.update({
        where: { id: inspection.id },
        data: {
          status: "COMPLETED",
          inspectionDate: now,
          summaryNotes: `${inspection.summaryNotes || ""}\n[COMPLETADA]: ${input.notes}\n[HALLAZGOS]: ${input.findings.join("; ")}`,
        }
      });

      // Regla CUS-09C: lastCareVisitAt se actualiza ÚNICAMENTE cuando la visita preventiva se completa de forma efectiva
      await tx.property.update({
        where: { id: inspection.propertyId },
        data: {
          lastCareVisitAt: now,
        }
      });

      return {
        inspectionId: updatedInspection.id,
        propertyId: inspection.propertyId,
        completedAt: now.toISOString(),
        lastCareVisitUpdated: true,
        findingsRecorded: input.findings.length,
      };
    });
  });
}

// -------------------------------------------------------------
// 9. Enviar Mensaje en Chat PM-Dueño (Traducción Honesta A2)
// -------------------------------------------------------------
const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  content: z.string().min(1),
  senderName: z.string().min(1),
  senderRole: z.string().min(1),
  targetLang: z.enum(["es", "en"]).default("en"),
})

export async function sendChatMessageAction(data: z.infer<typeof sendMessageSchema>) {
  return safeAction(sendMessageSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // 1. Traducir con servicio honesto (sin disfrazar fallos ni usar mocks de palabras)
      const translation = await translateText(input.content, input.targetLang);

      // 2. Guardar mensaje preservando metadata
      const msg = await tx.communicationMessage.create({
        data: {
          threadId: input.threadId,
          senderId: userId,
          senderName: input.senderName,
          senderRole: input.senderRole,
          content: input.content,
          isInternal: false,
          attachments: {
            translatedContent: translation.translated,
            targetLang: input.targetLang,
            sourceLang: translation.sourceLang,
            status: translation.status,
            isAiGenerated: translation.isAiGenerated,
            provider: translation.provider,
          }
        }
      });

      return {
        messageId: msg.id,
        content: msg.content,
        translated: translation.translated,
        status: translation.status,
        isAiGenerated: translation.isAiGenerated,
      };
    });
  });
}

// -------------------------------------------------------------
// 10. Configurar Política de Gasto del PM (CUS-09B Corrección 1)
// -------------------------------------------------------------
const configurePolicySchema = z.object({
  propertyId: z.string().uuid(),
  limit: z.number().min(0).nullable(),
  currency: z.string().default("MXN"),
  autoApproveCategories: z.array(z.string()).default([]),
  emergencyRule: z.string().nullable().optional(),
})

export async function configurePmExpensePolicyAction(data: z.infer<typeof configurePolicySchema>) {
  return safeAction(configurePolicySchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      if (!isManager) {
        throw new Error("Solo los administradores autorizados pueden configurar la política de gasto del PM.");
      }

      // Buscar o crear acuerdo de administración activo
      let agreement = await tx.managementAgreement.findFirst({
        where: { tenantId, propertyId: input.propertyId },
        orderBy: { effectiveFrom: "desc" }
      });

      const now = new Date();

      if (!agreement) {
        agreement = await tx.managementAgreement.create({
          data: {
            tenantId,
            propertyId: input.propertyId,
            commissionType: "PERCENTAGE_RENT",
            commissionRate: 0.10,
            effectiveFrom: now,
            reserveMinimum: 2000,
            pmExpenseLimit: input.limit !== null ? input.limit : null,
            pmExpenseCurrency: input.currency,
            autoApproveCategories: input.autoApproveCategories,
            emergencyRule: input.emergencyRule || null,
            configuredById: userId,
            configuredAt: now,
          }
        });
      } else {
        agreement = await tx.managementAgreement.update({
          where: { id: agreement.id },
          data: {
            pmExpenseLimit: input.limit !== null ? input.limit : null,
            pmExpenseCurrency: input.currency,
            autoApproveCategories: input.autoApproveCategories,
            emergencyRule: input.emergencyRule || null,
            configuredById: userId,
            configuredAt: now,
          }
        });
      }

      return {
        agreementId: agreement.id,
        configured: input.limit !== null,
        pmExpenseLimit: input.limit,
        currency: input.currency,
        autoApproveCategories: input.autoApproveCategories,
        emergencyRule: input.emergencyRule,
        configuredAt: now.toISOString(),
      };
    });
  });
}

// -------------------------------------------------------------
// 11. Movimientos de Insumos y Suministros (CUS-09B Cuidado & Mantenimiento)
// -------------------------------------------------------------
const recordSupplyMovementSchema = z.object({
  propertyId: z.string().uuid(),
  supplyId: z.string().uuid(),
  type: z.enum(["INFLOW", "OUTFLOW", "ADJUSTMENT"]),
  quantity: z.number().positive(),
  reason: z.string().min(3),
  workOrderId: z.string().uuid().optional(),
})

export async function recordSupplyMovementAction(data: z.infer<typeof recordSupplyMovementSchema>) {
  return safeAction(recordSupplyMovementSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const supply = await tx.supplyInventory.findUnique({
        where: { id: input.supplyId, tenantId }
      });

      if (!supply) throw new Error("Supply item not found");

      let newBalance = supply.currentStock;
      if (input.type === "INFLOW") {
        newBalance += Math.round(input.quantity);
      } else if (input.type === "OUTFLOW") {
        if (newBalance < input.quantity) {
          throw new Error(`Stock insuficiente: disponible ${newBalance}, requerido ${input.quantity}`);
        }
        newBalance -= Math.round(input.quantity);
      } else {
        // ADJUSTMENT establece el balance de acuerdo con el ajuste
        newBalance = Math.round(input.quantity);
      }

      // Actualizar inventario
      await tx.supplyInventory.update({
        where: { id: supply.id },
        data: { currentStock: newBalance }
      });

      // Crear movimiento auditable
      const movement = await tx.supplyMovement.create({
        data: {
          tenantId,
          supplyId: supply.id,
          type: input.type,
          quantity: Math.round(input.quantity),
          balance: newBalance,
          reason: input.reason,
          workOrderId: input.workOrderId || null,
          createdById: userId,
        }
      });

      return {
        movementId: movement.id,
        supplyId: supply.id,
        type: movement.type,
        quantity: movement.quantity,
        newBalance,
        reason: movement.reason,
      };
    });
  });
}
