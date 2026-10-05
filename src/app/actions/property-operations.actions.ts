"use server"

import { safeAction } from "@/lib/auth/action-wrapper"
import { withTenantRLS } from "@/lib/prisma"
import { z } from "zod"
import { translateText } from "@/lib/services/translation.service"

// -------------------------------------------------------------
// 1. Reportar Gasto / Reparación con Cotización
// -------------------------------------------------------------
const createExpenseSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().min(5),
  estimatedCost: z.number().positive(),
  laborCost: z.number().min(0).default(0),
  materialCost: z.number().min(0).default(0),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
})

export async function createExpenseAction(data: z.infer<typeof createExpenseSchema>) {
  return safeAction(createExpenseSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Crear orden de trabajo
      const wo = await tx.workOrder.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          reporterId: userId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: "PENDING",
          estimatedCost: input.estimatedCost,
        }
      });

      // Crear cotización detallada asociada
      const total = input.laborCost + input.materialCost > 0 
        ? input.laborCost + input.materialCost 
        : input.estimatedCost;

      const quote = await tx.workOrderQuote.create({
        data: {
          tenantId,
          workOrderId: wo.id,
          laborCost: input.laborCost,
          materialCost: input.materialCost,
          totalCost: total,
          status: "SUBMITTED",
          itemsJson: [
            { description: "Mano de obra especializada", amount: input.laborCost },
            { description: "Materiales y refacciones", amount: input.materialCost },
          ]
        }
      });

      return { workOrderId: wo.id, quoteId: quote.id };
    });
  });
}

// -------------------------------------------------------------
// 2. Aprobar Gasto / Cotización (Por el Dueño o PM)
// -------------------------------------------------------------
const approveQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  reason: z.string().optional(),
})

export async function approveQuoteAction(data: z.infer<typeof approveQuoteSchema>) {
  return safeAction(approveQuoteSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const quote = await tx.workOrderQuote.update({
        where: { id: input.quoteId },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
          approvalReason: input.reason || "Aprobado por el propietario vía portal",
        },
        include: { workOrder: true }
      });

      // Actualizar estado de orden
      await tx.workOrder.update({
        where: { id: quote.workOrderId },
        data: {
          status: "IN_PROGRESS",
          actualCost: quote.totalCost,
        }
      });

      return { approved: true, quoteId: quote.id };
    });
  });
}

// -------------------------------------------------------------
// 3. Registrar Llegada / Estadía (Owner Stay o Visita)
// -------------------------------------------------------------
const scheduleStaySchema = z.object({
  propertyId: z.string().uuid(),
  inspectorName: z.string().min(2),
  stayType: z.enum(["MOVE_IN", "ROUTINE", "MOVE_OUT"]).default("MOVE_IN"),
  arrivalDate: z.string(),
  notes: z.string().optional(),
  checklist: z.record(z.string(), z.boolean()).default({}),
})

export async function scheduleStayAction(data: z.infer<typeof scheduleStaySchema>) {
  return safeAction(scheduleStaySchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const inspection = await tx.inspection.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          type: input.stayType,
          status: "SCHEDULED",
          inspectorName: input.inspectorName,
          inspectionDate: new Date(input.arrivalDate),
          summaryNotes: input.notes,
          checklistJson: input.checklist,
        }
      });

      return { inspectionId: inspection.id };
    });
  });
}

// -------------------------------------------------------------
// 4. Agregar Clave a Bóveda Digital (Vault)
// -------------------------------------------------------------
const addVaultKeySchema = z.object({
  propertyId: z.string().uuid(),
  keyName: z.string().min(2),
  type: z.enum(["WIFI", "SMART_LOCK", "ALARM", "LOCKBOX"]),
  keyValue: z.string().min(1),
  instructions: z.string().optional(),
})

export async function addVaultKeyAction(data: z.infer<typeof addVaultKeySchema>) {
  return safeAction(addVaultKeySchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const vault = await tx.propertyVault.create({
        data: {
          propertyId: input.propertyId,
          keyName: input.keyName,
          type: input.type,
          keyValue: input.keyValue,
          instructions: input.instructions,
        }
      });

      return { vaultId: vault.id };
    });
  });
}

// -------------------------------------------------------------
// 5. Enviar Mensaje en Chat PM-Dueño con Traducción IA
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
      // 1. Traducir contenido mediante servicio de IA (DeepSeek / fallback)
      const translation = await translateText(input.content, input.targetLang);

      // 2. Guardar mensaje
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
            isAiGenerated: translation.isAiGenerated,
          }
        }
      });

      return {
        messageId: msg.id,
        content: msg.content,
        translated: translation.translated,
      };
    });
  });
}
