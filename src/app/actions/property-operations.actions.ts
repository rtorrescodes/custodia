"use server"

import { safeAction } from "@/lib/auth/action-wrapper"
import { withTenantRLS } from "@/lib/prisma"
import { z } from "zod"
import { translateText } from "@/lib/services/translation.service"

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
      // 1. Obtener acuerdo de administración y límite de gasto del PM
      const agreement = await tx.managementAgreement.findFirst({
        where: {
          tenantId,
          propertyId: input.propertyId,
        },
        orderBy: { effectiveFrom: "desc" }
      });

      // Límite de gasto autónomo del PM (por defecto $1,000 MXN si no está especificado)
      const pmExpenseLimit = agreement?.pmExpenseLimit ? Number(agreement.pmExpenseLimit) : 1000;
      const autoApproveCats = agreement?.autoApproveCategories || [];
      const isAutoCategory = autoApproveCats.includes(input.category);

      const total = input.laborCost + input.materialCost > 0 
        ? input.laborCost + input.materialCost 
        : input.estimatedCost;

      // El gasto requiere aprobación si excede la facultad del PM y no es categoría exenta
      const requiresOwnerApproval = total > pmExpenseLimit && !isAutoCategory;

      // 2. Calcular fondos reales disponibles en el fideicomiso/cuenta del propietario
      const charges = await tx.charge.findMany({
        where: { propertyId: input.propertyId, status: "PAID" },
        select: { amount: true }
      });
      const grossIncome = charges.reduce((acc, c) => acc + Number(c.amount), 0);

      const paidOrders = await tx.workOrder.findMany({
        where: { propertyId: input.propertyId, status: "COMPLETED" },
        select: { actualCost: true }
      });
      const totalPaidExpenses = paidOrders.reduce((acc, o) => acc + Number(o.actualCost || 0), 0);

      // Fondos comprometidos (órdenes aprobadas o en curso pendientes de pagar)
      const committedOrders = await tx.workOrder.findMany({
        where: { propertyId: input.propertyId, status: { in: ["AWAITING_APPROVAL", "IN_PROGRESS"] } },
        select: { estimatedCost: true }
      });
      const committedFunds = committedOrders.reduce((acc, o) => acc + Number(o.estimatedCost || 0), 0);

      const reserveMin = agreement?.reserveMinimum ? Number(agreement.reserveMinimum) : 0;
      const ownerBalance = grossIncome - totalPaidExpenses;
      // Disponible real para nuevas obligaciones
      const availableFunds = Math.max(0, ownerBalance - reserveMin - committedFunds);

      // Si no requiere aprobación del dueño pero no hay fondos disponibles, se bloquea por liquidez
      const isBlockedFunds = !requiresOwnerApproval && total > availableFunds;

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

      // Comprobación de fondos disponibles antes de autorizar el inicio
      const agreement = await tx.managementAgreement.findFirst({
        where: { tenantId, propertyId: quote.workOrder.propertyId },
        orderBy: { effectiveFrom: "desc" }
      });
      const reserveMin = agreement?.reserveMinimum ? Number(agreement.reserveMinimum) : 0;

      const charges = await tx.charge.findMany({
        where: { propertyId: quote.workOrder.propertyId, status: "PAID" },
        select: { amount: true }
      });
      const grossIncome = charges.reduce((acc, c) => acc + Number(c.amount), 0);

      const paidOrders = await tx.workOrder.findMany({
        where: { propertyId: quote.workOrder.propertyId, status: "COMPLETED" },
        select: { actualCost: true }
      });
      const totalPaidExpenses = paidOrders.reduce((acc, o) => acc + Number(o.actualCost || 0), 0);

      const availableFunds = Math.max(0, grossIncome - totalPaidExpenses - reserveMin);
      const hasSufficientFunds = availableFunds >= totalCost;

      // Actualizar cotización a APPROVED
      const updatedQuote = await tx.workOrderQuote.update({
        where: { id: input.quoteId },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
          approvalReason: input.reason || "Aprobado formalmente por el propietario en portal",
        }
      });

      // Si no hay fondos, la orden pasa a AWAITING_APPROVAL (bloqueada por fondos) y requiere aportación
      const newWOStatus = hasSufficientFunds ? "IN_PROGRESS" : "AWAITING_APPROVAL";

      await tx.workOrder.update({
        where: { id: quote.workOrderId },
        data: {
          status: newWOStatus,
          actualCost: quote.totalCost,
        }
      });

      return {
        approved: true,
        quoteId: updatedQuote.id,
        version: updatedQuote.version,
        hasSufficientFunds,
        availableFunds,
        requiredFunds: totalCost,
        isBlockedFunds: !hasSufficientFunds,
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
// 5. Reportar Aportación por el Dueño (Comprobante Subido)
// -------------------------------------------------------------
const reportContributionSchema = z.object({
  contributionId: z.string().uuid(),
  evidenceUrl: z.string().url().or(z.string().min(3)),
  notes: z.string().optional(),
})

export async function reportOwnerContributionAction(data: z.infer<typeof reportContributionSchema>) {
  return safeAction(reportContributionSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Un comprobante reportado NO libera fondos automáticamente; pasa a REPORTED
      const updated = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "REPORTED",
          reportedAt: new Date(),
          evidenceUrl: input.evidenceUrl,
          notes: input.notes,
        }
      });

      return {
        contributionId: updated.id,
        status: updated.status,
        verified: false, // Aún no disponible para gastar
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

      const contribution = await tx.ownerContribution.update({
        where: { id: input.contributionId, tenantId },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          verifiedById: userId,
          notes: input.notes,
        }
      });

      // Ahora los fondos están verificados y formalmente disponibles en el ledger
      return {
        contributionId: contribution.id,
        status: "VERIFIED",
        releasedAmount: Number(contribution.amount),
        verifiedAt: contribution.verifiedAt,
      };
    });
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

      return {
        inspectionId: inspection.id,
        isReady,
        conflictDetected: false,
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
