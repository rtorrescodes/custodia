"use server"

import { safeAction } from "@/lib/auth/action-wrapper"
import { withTenantRLS } from "@/lib/prisma"
import { z } from "zod"
import { translateText } from "@/lib/services/translation.service"
import { accountingService } from "@/lib/services/accounting-service"
import { propertyOperationsService } from "@/lib/services/property-operations.service"

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
    return propertyOperationsService.approveQuote(tenantId, userId, input);
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
    let fileBuffer: Buffer | null = null;
    if (input.fileBase64 && input.fileName && input.fileMimeType) {
      fileBuffer = Buffer.from(input.fileBase64, "base64");
    }

    return propertyOperationsService.reportOwnerContribution(tenantId, userId, {
      contributionId: input.contributionId,
      reference: input.reference,
      transferDate: input.transferDate,
      reportedAmount: input.reportedAmount,
      reportedCurrency: input.reportedCurrency,
      notes: input.notes,
      fileBuffer,
      fileName: input.fileName,
      fileMimeType: input.fileMimeType,
    });
  });
}

// -------------------------------------------------------------
// 6. Verificar y Liberar Fondos de la Aportación (Acción Administrativa PM)
// -------------------------------------------------------------
const verifyContributionSchema = z.object({
  contributionId: z.string().uuid(),
  verifiedAmount: z.number().positive().optional(),
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

      return propertyOperationsService.verifyOwnerContribution(tenantId, userId, input, tx);
    });
  });
}

// -------------------------------------------------------------
// 6B. Obtener URL temporal firmada para consultar evidencia privada
// -------------------------------------------------------------
const getSignedEvidenceSchema = z.object({
  contributionId: z.string().uuid().optional(),
  storagePath: z.string().min(3).optional(),
})

export async function getEvidenceSignedUrlAction(data: z.infer<typeof getSignedEvidenceSchema>) {
  return safeAction(getSignedEvidenceSchema, data, async (input, tenantId, userId) => {
    return propertyOperationsService.getEvidenceSignedUrl(tenantId, userId, input);
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
// 7B. Cancelar Orden de Trabajo y Liberar Compromisos / Desafectar Fondos
// -------------------------------------------------------------
const cancelWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  cancellationReason: z.string().min(3),
})

export async function cancelWorkOrderAction(data: z.infer<typeof cancelWorkOrderSchema>) {
  return safeAction(cancelWorkOrderSchema, data, async (input, tenantId, userId) => {
    return propertyOperationsService.cancelWorkOrder(tenantId, userId, input);
  });
}
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
    return propertyOperationsService.recordVendorPayment(tenantId, userId, input);
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
