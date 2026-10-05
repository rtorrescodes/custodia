"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { resolveMembershipContext, canAccessProperty } from "@/lib/auth/membership-guard"
import { chargeService } from "@/lib/services/charge-service"
import { paymentService } from "@/lib/services/payment-service"
import { settlementService } from "@/lib/services/settlement-service"

// 1. Generación de rentas periódicas
const generateRentChargesSchema = z.object({
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2050),
})

export async function generateMonthlyRentChargesAction(input: z.infer<typeof generateRentChargesSchema>) {
  return safeAction(generateRentChargesSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    if (auth.context.role !== "PM_ADMIN" && auth.context.role !== "LANDLORD") {
      throw new Error("Solo administradores pueden disparar la generación mensual de rentas.")
    }

    const charges = await chargeService.generateMonthlyRentCharges({
      tenantId,
      month: data.month,
      year: data.year,
      createdById: userId,
    })

    revalidatePath("/rentas")
    return { count: charges.length, charges }
  })
}

// 2. Registro de pago recibido
const recordPaymentSchema = z.object({
  leaseId: z.string().uuid().optional(),
  payerName: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().default("MXN"),
  method: z.enum(["TRANSFER", "CASH", "CARD", "STRIPE", "OTHER"]),
  reference: z.string().optional(),
  autoConfirm: z.boolean().default(false),
})

export async function recordPaymentAction(input: z.infer<typeof recordPaymentSchema>) {
  return safeAction(recordPaymentSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    const payment = await paymentService.recordPayment({
      tenantId,
      leaseId: data.leaseId,
      payerName: data.payerName,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      reference: data.reference,
      autoConfirm: data.autoConfirm,
      confirmedById: data.autoConfirm ? userId : undefined,
    })

    revalidatePath("/rentas")
    return { payment }
  })
}

// 3. Confirmación de pago reportado
const confirmPaymentSchema = z.object({
  paymentId: z.string().uuid(),
})

export async function confirmPaymentAction(input: z.infer<typeof confirmPaymentSchema>) {
  return safeAction(confirmPaymentSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    if (auth.context.role !== "PM_ADMIN" && auth.context.role !== "LANDLORD" && auth.context.role !== "PM_STAFF") {
      throw new Error("No tienes autorización para confirmar cobros.")
    }

    const confirmed = await paymentService.confirmPayment(tenantId, data.paymentId, userId)
    revalidatePath("/rentas")
    return { payment: confirmed }
  })
}

// 4. Aplicación de pago a cargos
const applyPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  applications: z.array(z.object({
    chargeId: z.string().uuid(),
    amount: z.number().positive(),
  })).min(1),
})

export async function applyPaymentAction(input: z.infer<typeof applyPaymentSchema>) {
  return safeAction(applyPaymentSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    const result = await paymentService.applyPayment(tenantId, data.paymentId, data.applications)
    revalidatePath("/rentas")
    return result
  })
}

// 5. Cálculo y propuesta de liquidación al propietario
const createSettlementProposalSchema = z.object({
  ownerId: z.string().uuid(),
  propertyId: z.string().uuid().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
})

export async function createSettlementProposalAction(input: z.infer<typeof createSettlementProposalSchema>) {
  return safeAction(createSettlementProposalSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    if (auth.context.role !== "PM_ADMIN" && auth.context.role !== "LANDLORD") {
      throw new Error("Solo administradores pueden emitir propuestas de liquidación.")
    }

    const proposal = await settlementService.createSettlementProposal({
      tenantId,
      ownerId: data.ownerId,
      propertyId: data.propertyId,
      periodStart: new Date(data.periodStart),
      periodEnd: new Date(data.periodEnd),
      createdById: userId,
    })

    revalidatePath("/portal")
    return { proposal }
  })
}

// 6. Generación y emisión de Recibo inmutable (CUS-03D)
const generateReceiptSchema = z.object({
  paymentId: z.string().uuid(),
  payerTaxId: z.string().optional(),
})

export async function generateReceiptAction(input: z.infer<typeof generateReceiptSchema>) {
  return safeAction(generateReceiptSchema, input, async (data, tenantId) => {
    const { receiptService } = await import("@/lib/services/receipt-service")
    const receipt = await receiptService.generateReceipt({
      tenantId,
      paymentId: data.paymentId,
      payerTaxId: data.payerTaxId,
    })

    revalidatePath("/rentas")
    revalidatePath("/inquilino")
    return { receipt }
  })
}

// 7. Conciliación bancaria manual (CUS-03C)
const confirmBankMatchSchema = z.object({
  lineId: z.string().uuid(),
  paymentId: z.string().uuid(),
})

export async function confirmBankMatchAction(input: z.infer<typeof confirmBankMatchSchema>) {
  return safeAction(confirmBankMatchSchema, input, async (data, tenantId, userId) => {
    const { bankReconciliationService } = await import("@/lib/services/bank-reconciliation-service")
    const result = await bankReconciliationService.confirmMatch(
      tenantId,
      data.lineId,
      data.paymentId,
      userId
    )

    revalidatePath("/rentas")
    return result
  })
}
