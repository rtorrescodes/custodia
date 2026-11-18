"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma } from "@/lib/prisma"

const ticketSchema = z.object({
  title: z.string().min(3, "El título es muy corto"),
  description: z.string().min(5, "La descripción es requerida"),
  propertyId: z.string().uuid("Seleccione una propiedad válida"),
  estimatedCost: z.number().optional(),
})

export async function createTicket(input: z.infer<typeof ticketSchema>) {
  return safeAction(ticketSchema, input, async (data, tenantId) => {
    // Verify property belongs to tenant
    const prop = await prisma.property.findUnique({ where: { id: data.propertyId } })
    if (!prop || prop.tenantId !== tenantId) {
      throw new Error("Property not found or unauthorized")
    }

    const newTicket = await prisma.workOrder.create({
      data: {
        tenantId,
        propertyId: data.propertyId,
        title: data.title,
        description: data.description,
        estimatedCost: data.estimatedCost,
        status: "PENDING",
      }
    })

    revalidatePath("/mantenimiento")
    revalidatePath(`/propiedades/${data.propertyId}`)
    return { ticket: newTicket }
  })
}

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETED", "CANCELLED"]),
})

export async function updateTicketStatus(input: z.infer<typeof updateStatusSchema>) {
  return safeAction(updateStatusSchema, input, async ({ id, status }, tenantId) => {
    const existing = await prisma.workOrder.findUnique({ where: { id } })
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error("Ticket not found or unauthorized")
    }

    const updated = await prisma.workOrder.update({
      where: { id },
      data: { status }
    })

    revalidatePath("/mantenimiento")
    revalidatePath(`/propiedades/${existing.propertyId}`)
    return { ticket: updated }
  })
}

const deleteTicketSchema = z.object({ id: z.string().uuid() })

export async function deleteTicket(input: z.infer<typeof deleteTicketSchema>) {
  return safeAction(deleteTicketSchema, input, async ({ id }, tenantId) => {
    const existing = await prisma.workOrder.findUnique({ where: { id } })
    if (!existing || existing.tenantId !== tenantId) {
      throw new Error("Ticket not found or unauthorized")
    }

    await prisma.$transaction([
      prisma.fileEvidence.deleteMany({ where: { workOrderId: id } }),
      prisma.workOrder.delete({ where: { id } })
    ])

    revalidatePath("/mantenimiento")
    revalidatePath(`/propiedades/${existing.propertyId}`)
    return { success: true }
  })
}

// 4. CUS-10: Creación de ticket de mantenimiento reportado por el Inquilino desde su portal
const tenantTicketSchema = z.object({
  propertyId: z.string().uuid("Seleccione una propiedad válida"),
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  description: z.string().min(5, "Describa la falla con al menos 5 caracteres"),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
})

export async function createTenantMaintenanceRequestAction(input: z.infer<typeof tenantTicketSchema>) {
  return safeAction(tenantTicketSchema, input, async (data, tenantId, userId) => {
    // Verificar que la propiedad pertenezca al tenant
    const prop = await prisma.property.findUnique({
      where: { id: data.propertyId, tenantId },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          take: 1,
        }
      }
    })

    if (!prop) {
      throw new Error("Propiedad no encontrada o no autorizada.")
    }

    const priorityMap: Record<string, "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY"> = {
      LOW: "LOW",
      MEDIUM: "MEDIUM",
      HIGH: "HIGH",
      EMERGENCY: "EMERGENCY",
    }

    const newTicket = await prisma.workOrder.create({
      data: {
        tenantId,
        propertyId: data.propertyId,
        title: `[Reporte Inquilino] ${data.title}`,
        description: data.description,
        priority: priorityMap[data.urgency] || "MEDIUM",
        status: "PENDING",
        reporterId: userId,
      }
    })

    revalidatePath("/inquilino")
    revalidatePath("/mantenimiento")
    revalidatePath(`/propiedades/${data.propertyId}`)

    return {
      ticket: newTicket,
      message: "¡Incidencia reportada con éxito! La administración ha sido notificada.",
    }
  })
}

