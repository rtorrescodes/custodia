"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma } from "@/lib/prisma"

const approveSchema = z.object({
  transactionId: z.string().uuid(),
  propertyId: z.string().uuid()
})

export async function approveTransaction(input: z.infer<typeof approveSchema>) {
  return safeAction(approveSchema, input, async ({ transactionId, propertyId }, tenantId, userId) => {
    
    // Verify the user owns the property
    const ownership = await prisma.propertyOwner.findUnique({
      where: { propertyId_userId: { propertyId, userId } }
    });

    if (!ownership) {
      throw new Error("No tienes permisos para autorizar gastos en esta propiedad");
    }

    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } })
    if (!tx || tx.tenantId !== tenantId) {
      throw new Error("Transacción no encontrada");
    }

    if (!tx.requiresApproval) {
      throw new Error("Esta transacción no requiere aprobación");
    }

    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: { isApproved: true }
    })

    revalidatePath("/portal")
    return { success: true, transaction: updated }
  })
}
