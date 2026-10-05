"use server"

import { safeAction } from "@/lib/auth/action-wrapper"
import { withTenantRLS } from "@/lib/prisma"
import { z } from "zod"

// -------------------------------------------------------------
// 1. Crear Tarea Operativa
// -------------------------------------------------------------
const createTaskSchema = z.object({
  propertyId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  dueDate: z.string().optional(),
  checklist: z.array(z.object({
    id: z.string(),
    text: z.string(),
    completed: z.boolean(),
    required: z.boolean().default(false)
  })).default([]),
  sourceType: z.enum(["MANUAL", "CHAT", "INSPECTION", "STAY", "RECURRENT"]).default("MANUAL"),
  sourceId: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
})

export async function createOperationalTaskAction(data: z.infer<typeof createTaskSchema>) {
  return safeAction(createTaskSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Evitar duplicados por doble click o reintento si viene de STAY o INSPECTION con la misma fuente y título
      if (input.sourceId && (input.sourceType === "STAY" || input.sourceType === "INSPECTION")) {
        const existing = await tx.operationalTask.findFirst({
          where: {
            tenantId,
            propertyId: input.propertyId,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            title: input.title,
            status: { notIn: ["CANCELLED"] }
          }
        });
        if (existing) {
          // Si ya existe pero se proporcionó un nuevo assigneeId, actualizarlo
          if (input.assigneeId && existing.assigneeId !== input.assigneeId) {
            const updated = await tx.operationalTask.update({
              where: { id: existing.id },
              data: {
                assigneeId: input.assigneeId,
                status: existing.status === "PENDING" ? "ASSIGNED" : existing.status,
              }
            });
            return {
              taskId: updated.id,
              title: updated.title,
              status: updated.status,
              alreadyExisted: true,
            };
          }
          return {
            taskId: existing.id,
            title: existing.title,
            status: existing.status,
            alreadyExisted: true,
          };
        }
      }

      const task = await tx.operationalTask.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: input.assigneeId ? "ASSIGNED" : "PENDING",
          assigneeId: input.assigneeId || null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          checklistJson: input.checklist,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        }
      });

      return {
        taskId: task.id,
        title: task.title,
        status: task.status,
        alreadyExisted: false,
      };
    });
  });
}

// -------------------------------------------------------------
// 2. Transición de Estado de Tarea (Máquina de Estados)
// -------------------------------------------------------------
const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum([
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "BLOCKED",
    "VERIFICATION_PENDING",
    "COMPLETED",
    "CANCELLED"
  ]),
  blockedReason: z.string().optional(),
})

export async function updateOperationalTaskStatusAction(data: z.infer<typeof updateTaskStatusSchema>) {
  return safeAction(updateTaskStatusSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Regla C: Una tarea bloqueada requiere obligatoriamente motivo
      if (input.status === "BLOCKED" && (!input.blockedReason || input.blockedReason.trim().length < 3)) {
        throw new Error("A task cannot be marked as BLOCKED without a clear blockedReason.");
      }

      const updateData: any = {
        status: input.status,
        blockedReason: input.status === "BLOCKED" ? input.blockedReason : null,
      };

      if (input.status === "COMPLETED") {
        updateData.completedAt = new Date();
        updateData.verifiedAt = new Date();
        updateData.verifiedById = userId;
      }

      const task = await tx.operationalTask.update({
        where: { id: input.taskId, tenantId },
        data: updateData,
      });

      return {
        taskId: task.id,
        status: task.status,
        blockedReason: task.blockedReason,
      };
    });
  });
}

// -------------------------------------------------------------
// 3. Convertir Mensaje de Chat a Tarea Operativa (Acción Humana Criterio 8)
// -------------------------------------------------------------
const convertChatToTaskSchema = z.object({
  propertyId: z.string().uuid(),
  messageId: z.string().uuid(),
  messageContent: z.string().min(1),
  title: z.string().min(3),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
})

export async function convertChatMessageToTaskAction(data: z.infer<typeof convertChatToTaskSchema>) {
  return safeAction(convertChatToTaskSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      // Evitar tareas duplicadas desde el mismo mensaje (idempotencia)
      const existing = await tx.operationalTask.findFirst({
        where: {
          tenantId,
          sourceType: "CHAT",
          sourceId: input.messageId,
        }
      });

      if (existing) {
        return {
          taskId: existing.id,
          title: existing.title,
          alreadyExisted: true,
        };
      }

      const task = await tx.operationalTask.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          title: input.title,
          description: `Originado de mensaje en chat: "${input.messageContent}"`,
          priority: input.priority,
          status: "PENDING",
          sourceType: "CHAT",
          sourceId: input.messageId,
        }
      });

      return {
        taskId: task.id,
        title: task.title,
        alreadyExisted: false,
      };
    });
  });
}

// -------------------------------------------------------------
// 4. Convertir Hallazgo de Visita de Cuidado a Orden de Mantenimiento (Criterio 7)
// -------------------------------------------------------------
const convertFindingToWorkOrderSchema = z.object({
  propertyId: z.string().uuid(),
  findingText: z.string().min(3),
  area: z.string().default("General"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
  estimatedCost: z.number().default(500),
})

export async function convertFindingToWorkOrderAction(data: z.infer<typeof convertFindingToWorkOrderSchema>) {
  return safeAction(convertFindingToWorkOrderSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          tenantId,
          propertyId: input.propertyId,
          reporterId: userId,
          title: `Hallazgo [${input.area}]: ${input.findingText.slice(0, 50)}`,
          description: `Detectado durante inspección preventiva de cuidado: ${input.findingText}`,
          priority: input.priority,
          status: "PENDING",
          estimatedCost: input.estimatedCost,
        }
      });

      // Crear cotización borrador
      await tx.workOrderQuote.create({
        data: {
          tenantId,
          workOrderId: wo.id,
          version: 1,
          totalCost: input.estimatedCost,
          status: "DRAFT",
          itemsJson: [{ description: input.findingText, amount: input.estimatedCost }]
        }
      });

      return {
        workOrderId: wo.id,
        title: wo.title,
        status: wo.status,
      };
    });
  });
}

// -------------------------------------------------------------
// 5. CUS-09C: Asignar Tarea Operativa a Personal/Staff con Aislamiento Zero-Trust
// -------------------------------------------------------------
const assignOperationalTaskSchema = z.object({
  taskId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  dueDate: z.string().optional(),
})

export async function assignOperationalTaskAction(data: z.infer<typeof assignOperationalTaskSchema>) {
  return safeAction(assignOperationalTaskSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const task = await tx.operationalTask.update({
        where: { id: input.taskId, tenantId },
        data: {
          assigneeId: input.assigneeId,
          status: "ASSIGNED",
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        }
      });

      return {
        taskId: task.id,
        assigneeId: task.assigneeId,
        status: task.status,
      };
    });
  });
}

// -------------------------------------------------------------
// 6. CUS-09C: Solicitar Verificación de Tarea (Operario reporta término con evidencia)
// -------------------------------------------------------------
const requestTaskVerificationSchema = z.object({
  taskId: z.string().uuid(),
  evidenceNotes: z.string().min(5),
  evidenceUrls: z.array(z.string()).default([]),
})

export async function requestTaskVerificationAction(data: z.infer<typeof requestTaskVerificationSchema>) {
  return safeAction(requestTaskVerificationSchema, data, async (input, tenantId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const task = await tx.operationalTask.findUnique({
        where: { id: input.taskId, tenantId }
      });

      if (!task) throw new Error("Task not found");

      // Actualizar a VERIFICATION_PENDING con descripción/evidencia agregada
      const updated = await tx.operationalTask.update({
        where: { id: task.id },
        data: {
          status: "VERIFICATION_PENDING",
          description: task.description 
            ? `${task.description}\n[EVIDENCIA DE ENTREGA]: ${input.evidenceNotes}`
            : `[EVIDENCIA DE ENTREGA]: ${input.evidenceNotes}`,
        }
      });

      return {
        taskId: updated.id,
        status: updated.status,
        readyForReview: true,
      };
    });
  });
}

// -------------------------------------------------------------
// 7. CUS-09C: Resolver Verificación por PM (Aprobar a COMPLETED o Devolver para Corrección)
// -------------------------------------------------------------
const resolveTaskVerificationSchema = z.object({
  taskId: z.string().uuid(),
  approved: z.boolean(),
  notes: z.string().min(3),
})

export async function resolveTaskVerificationAction(data: z.infer<typeof resolveTaskVerificationSchema>) {
  return safeAction(resolveTaskVerificationSchema, data, async (input, tenantId, userId) => {
    return withTenantRLS(tenantId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      const isManager = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
      if (!isManager) {
        throw new Error("Solo los administradores o coordinadores pueden verificar la finalización de tareas.");
      }

      const task = await tx.operationalTask.findUnique({
        where: { id: input.taskId, tenantId }
      });

      if (!task) throw new Error("Task not found");

      if (input.approved) {
        const completed = await tx.operationalTask.update({
          where: { id: task.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            verifiedAt: new Date(),
            verifiedById: userId,
            description: `${task.description || ""}\n[VERIFICACIÓN APROBADA]: ${input.notes}`,
          }
        });

        return {
          taskId: completed.id,
          status: completed.status,
          verified: true,
          verifiedAt: completed.verifiedAt?.toISOString(),
        };
      } else {
        // Devolver para corrección: vuelve a IN_PROGRESS con observaciones obligatorias
        const returned = await tx.operationalTask.update({
          where: { id: task.id },
          data: {
            status: "IN_PROGRESS",
            description: `${task.description || ""}\n[OBSERVACIONES DE RECHAZO]: ${input.notes}`,
          }
        });

        return {
          taskId: returned.id,
          status: returned.status,
          verified: false,
          notes: input.notes,
        };
      }
    });
  });
}
