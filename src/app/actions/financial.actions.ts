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

// 8. CUS-10: Reporte de pago de renta por el inquilino (SPEI / Transferencia / Depósito)
const reportTenantPaymentSchema = z.object({
  leaseId: z.string().uuid(),
  amount: z.number().positive(),
  reference: z.string().min(3),
  method: z.enum(["TRANSFER", "CASH", "CARD", "OTHER"]).default("TRANSFER"),
  notes: z.string().optional(),
  receiptUrl: z.string().optional(),
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
  fileMimeType: z.string().optional(),
})

export async function reportTenantPaymentAction(input: z.infer<typeof reportTenantPaymentSchema>) {
  return safeAction(reportTenantPaymentSchema, input, async (data, tenantId, userId) => {
    const { prisma } = await import("@/lib/prisma")
    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId, tenantId },
      include: { renter: true, property: true }
    })

    if (!lease) {
      throw new Error("Contrato de arrendamiento no encontrado.")
    }

    // Permitir si es el inquilino o un administrador
    const user = await prisma.user.findUnique({ where: { id: userId } })
    const isRenter = lease.renterId === userId || user?.email === lease.renter?.email
    const isManager = user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "SUPER_ADMIN"

    if (!isRenter && !isManager) {
      throw new Error("No tienes autorización para reportar pagos en este contrato.")
    }

    let finalReceiptUrl = data.receiptUrl || null

    // Si se adjunta archivo en base64, subirlo a almacenamiento privado
    if (data.fileBase64 && data.fileName && data.fileMimeType) {
      const { evidenceStorageService } = await import("@/lib/services/evidence-storage")
      const buffer = Buffer.from(data.fileBase64, "base64")
      const uploadRes = await evidenceStorageService.uploadFile({
        tenantId,
        propertyId: lease.propertyId,
        filename: data.fileName,
        buffer,
        mimeType: data.fileMimeType,
      })
      finalReceiptUrl = uploadRes.path
    }

    const payerName = user?.email || lease.renter?.email || "Inquilino"

    const payment = await paymentService.recordPayment({
      tenantId,
      leaseId: lease.id,
      payerName,
      amount: data.amount,
      currency: lease.currency,
      method: data.method,
      reference: data.reference,
      receiptUrl: finalReceiptUrl || undefined,
      autoConfirm: false, // Queda en REPORTED para revisión del casero/PM
    })

    // Actualizar campos adicionales en el Payment
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        notes: data.notes || null,
        reportedById: userId,
      }
    })

    revalidatePath("/inquilino")
    revalidatePath("/rentas")
    revalidatePath(`/propiedades/${lease.propertyId}`)

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      reference: payment.reference,
      message: "¡Comprobante de pago enviado! Pendiente de confirmación por administración.",
    }
  })
}

// 9. CUS-10: Evaluación y aplicación periódica de mora / recargos
const applyLateFeesSchema = z.object({
  referenceDate: z.string().optional(),
})

export async function evaluateAndApplyLateFeesAction(input: z.infer<typeof applyLateFeesSchema> = {}) {
  return safeAction(applyLateFeesSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId)
    if (!auth.ok) throw new Error(auth.error)

    if (auth.context.role !== "PM_ADMIN" && auth.context.role !== "LANDLORD") {
      throw new Error("Solo administradores pueden evaluar y aplicar recargos por mora.")
    }

    const refDate = data.referenceDate ? new Date(data.referenceDate) : new Date()
    const appliedFees = await chargeService.evaluateAndApplyLateFees({
      tenantId,
      referenceDate: refDate,
      createdById: userId,
    })

    revalidatePath("/rentas")
    revalidatePath("/inquilino")

    return {
      count: appliedFees.length,
      appliedFees,
      message: `Se aplicaron ${appliedFees.length} recargos por mora en contratos con fecha vencida.`,
    }
  })
}
