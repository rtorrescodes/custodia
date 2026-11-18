"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma } from "@/lib/prisma"
import { resolveMembershipContext, canAccessProperty } from "@/lib/auth/membership-guard"
import { leaseService } from "@/lib/services/lease-service"

const draftLeaseSchema = z.object({
  propertyId: z.string().uuid(),
  renterEmail: z.string().email(),
  renterName: z.string(),
  startDate: z.string(), // ISO date string
  endDate: z.string(),
  rentAmount: z.number().min(1),
  depositAmount: z.number().optional(),
  paymentDay: z.number().min(1).max(31),
  gracePeriodDays: z.number().min(0).max(30).default(5),
  lateFeePercentage: z.number().min(0).max(100).optional(),
  lateFeeFixedAmount: z.number().min(0).optional(),
  requireDigitalSignature: z.boolean().optional(),
})

export async function draftLease(input: z.infer<typeof draftLeaseSchema>) {
  return safeAction(draftLeaseSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const access = await canAccessProperty(auth.context, data.propertyId, "MANAGE_LEASES");
    if (!access.allowed) {
      throw new Error(access.reason || "No tienes autorización para administrar contratos en este inmueble.");
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (endDate <= startDate) {
      throw new Error("La fecha de fin del contrato debe ser posterior a la fecha de inicio.");
    }

    // Validación atómica de traslape
    const { hasOverlap, conflictingLeaseId } = await leaseService.checkLeaseOverlap(
      data.propertyId,
      startDate,
      endDate
    );

    if (hasOverlap) {
      throw new Error(`TRASLAPE INCOMPATIBLE: La unidad ya cuenta con un contrato activo en ese rango de fechas (ID: ${conflictingLeaseId}).`);
    }

    // Upsert the renter user
    let renter = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: data.renterEmail } }
    });

    if (!renter) {
      renter = await prisma.user.create({
        data: {
          tenantId,
          email: data.renterEmail,
          passwordHash: "pending",
          role: "RENTER"
        }
      });

      // Crear membresía RENTER
      await prisma.tenantMember.create({
        data: {
          tenantId,
          userId: renter.id,
          role: "RENTER",
          status: "ACTIVE"
        }
      });
    }

    // Crear el contrato (PENDING_SIGNATURE si se requiere firma digital, o ACTIVE de inmediato)
    const initialStatus = data.requireDigitalSignature ? "PENDING_SIGNATURE" : "ACTIVE";
    const newLease = await prisma.lease.create({
      data: {
        tenantId,
        propertyId: data.propertyId,
        renterId: renter.id,
        startDate,
        endDate,
        rentAmount: data.rentAmount,
        depositAmount: data.depositAmount || null,
        paymentDay: data.paymentDay,
        gracePeriodDays: data.gracePeriodDays,
        lateFeePercentage: data.lateFeePercentage !== undefined ? data.lateFeePercentage : null,
        lateFeeFixedAmount: data.lateFeeFixedAmount !== undefined ? data.lateFeeFixedAmount : null,
        status: initialStatus
      }
    });

    revalidatePath("/rentas");
    revalidatePath(`/propiedades/${data.propertyId}`);
    return { lease: newLease };
  });
}

const terminateLeaseSchema = z.object({
  leaseId: z.string().uuid(),
})

export async function terminateLease(input: z.infer<typeof terminateLeaseSchema>) {
  return safeAction(terminateLeaseSchema, input, async ({ leaseId }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const ended = await leaseService.terminateLease(auth.context, leaseId);
    revalidatePath("/rentas");
    return { lease: ended };
  });
}

const authorizeLeaseSchema = z.object({
  leaseId: z.string().uuid()
});

export async function authorizeLease(input: z.infer<typeof authorizeLeaseSchema>) {
  return safeAction(authorizeLeaseSchema, input, async ({ leaseId }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const authorized = await leaseService.authorizeLease(auth.context, leaseId);
    revalidatePath("/rentas");
    return { lease: authorized };
  });
}

// 4. Ciclo de vida y versionado de contratos (CUS-04A)
const createContractDocumentSchema = z.object({
  leaseId: z.string().uuid(),
  title: z.string().min(3),
  content: z.string().min(10),
  fileUrl: z.string().optional(),
})

export async function createContractDocumentAction(input: z.infer<typeof createContractDocumentSchema>) {
  return safeAction(createContractDocumentSchema, input, async (data, tenantId) => {
    const { contractLifecycleService } = await import("@/lib/services/contract-lifecycle-service")
    const doc = await contractLifecycleService.createDocument({
      tenantId,
      leaseId: data.leaseId,
      title: data.title,
      content: data.content,
      fileUrl: data.fileUrl,
    })

    revalidatePath("/rentas")
    return { document: doc }
  })
}

// 5. Firma electrónica con trazabilidad (CUS-04B)
const completeSignatureSchema = z.object({
  token: z.string(),
  ipAddress: z.string().default("127.0.0.1"),
  userAgent: z.string().default("Custodia Portal"),
  handwrittenBase64: z.string().optional(),
})

export async function completeSignatureAction(input: z.infer<typeof completeSignatureSchema>) {
  return safeAction(completeSignatureSchema, input, async (data) => {
    const { contractLifecycleService } = await import("@/lib/services/contract-lifecycle-service")
    const result = await contractLifecycleService.completeSignature({
      token: data.token,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      handwrittenBase64: data.handwrittenBase64,
    })

    revalidatePath("/rentas")
    revalidatePath("/inquilino")
    return result
  })
}

// 6. Registro de inspección Move-in/Move-out (CUS-04C)
const createInspectionSchema = z.object({
  propertyId: z.string().uuid(),
  leaseId: z.string().uuid().optional(),
  type: z.enum(["MOVE_IN", "MOVE_OUT", "ROUTINE"]),
  inspectorName: z.string(),
  summaryNotes: z.string().optional(),
  zones: z.array(z.object({
    zoneName: z.string(),
    items: z.array(z.object({
      name: z.string(),
      condition: z.enum(["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "MISSING"]),
      notes: z.string().optional(),
      photoUrl: z.string().optional(),
    }))
  })).min(1),
})

export async function createInspectionAction(input: z.infer<typeof createInspectionSchema>) {
  return safeAction(createInspectionSchema, input, async (data, tenantId) => {
    const { inspectionService } = await import("@/lib/services/inspection-service")
    const inspection = await inspectionService.createInspection({
      tenantId,
      propertyId: data.propertyId,
      leaseId: data.leaseId,
      type: data.type,
      inspectorName: data.inspectorName,
      summaryNotes: data.summaryNotes,
      zones: data.zones as any,
    })

    revalidatePath(`/propiedades/${data.propertyId}`)
    return { inspection }
  })
}

// -------------------------------------------------------------
// 7. CUS-09C: Renovación Versionada de Contrato de Arrendamiento
// -------------------------------------------------------------
const renewLeaseSchema = z.object({
  previousLeaseId: z.string().uuid(),
  newStartDate: z.string(),
  newEndDate: z.string(),
  newRentAmount: z.number().min(1),
  termsNotes: z.string().optional(),
})

export async function renewLeaseAction(input: z.infer<typeof renewLeaseSchema>) {
  return safeAction(renewLeaseSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const prevLease = await prisma.lease.findUnique({
      where: { id: data.previousLeaseId, tenantId },
    });

    if (!prevLease) throw new Error("Previous lease not found");

    const startDate = new Date(data.newStartDate);
    const endDate = new Date(data.newEndDate);
    if (endDate <= startDate) {
      throw new Error("La fecha de fin debe ser posterior a la fecha de inicio.");
    }

    // Marcar contrato anterior como ENDED
    await prisma.lease.update({
      where: { id: prevLease.id },
      data: { status: "ENDED" }
    });

    // Crear nuevo contrato de renovación
    const renewedLease = await prisma.lease.create({
      data: {
        tenantId,
        propertyId: prevLease.propertyId,
        renterId: prevLease.renterId,
        startDate,
        endDate,
        rentAmount: data.newRentAmount,
        depositAmount: prevLease.depositAmount, // Preserva depósito existente
        paymentDay: prevLease.paymentDay,
        status: "ACTIVE",
      }
    });

    // Registrar documento adendum de renovación
    await prisma.contractDocument.create({
      data: {
        tenantId,
        leaseId: renewedLease.id,
        type: "ADDENDUM",
        title: `Renovación de Contrato (Contrato Anterior ${prevLease.id.slice(0, 8)})`,
        metadata: {
          previousLeaseId: prevLease.id,
          renewedRentAmount: data.newRentAmount,
          notes: data.termsNotes || "Renovación acordada entre las partes",
        }
      }
    });

    revalidatePath("/rentas");
    revalidatePath(`/propiedades/${prevLease.propertyId}`);
    return { renewedLeaseId: renewedLease.id, status: "ACTIVE" };
  });
}

// -------------------------------------------------------------
// 8. CUS-09C: Salida (Move-out) con Revisión Humana de Depósito en Garantía
// -------------------------------------------------------------
const processMoveOutDepositSchema = z.object({
  leaseId: z.string().uuid(),
  moveOutInspectionId: z.string().uuid().optional(),
  totalDeductions: z.number().min(0).default(0),
  deductionsReason: z.string().optional(),
  approvedRefundAmount: z.number().min(0),
  managerReviewNotes: z.string().min(5),
})

export async function processMoveOutWithDepositReviewAction(input: z.infer<typeof processMoveOutDepositSchema>) {
  return safeAction(processMoveOutDepositSchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId, tenantId },
      include: { property: true }
    });

    if (!lease) throw new Error("Lease not found");

    const originalDeposit = Number(lease.depositAmount || 0);
    const calculatedRefund = originalDeposit - data.totalDeductions;

    if (data.approvedRefundAmount > calculatedRefund) {
      throw new Error(`El reembolso aprobado ($${data.approvedRefundAmount}) excede el neto disponible tras deducciones ($${calculatedRefund}).`);
    }

    // Finalizar contrato
    await prisma.lease.update({
      where: { id: lease.id },
      data: { status: "ENDED" }
    });

    // Actualizar propiedad a VACANT
    await prisma.property.update({
      where: { id: lease.propertyId },
      data: { occupancyStatus: "VACANT" }
    });

    // Registrar acta de liquidación de depósito en documento formal
    const doc = await prisma.contractDocument.create({
      data: {
        tenantId,
        leaseId: lease.id,
        type: "TERMINATION",
        title: `Acta de Liquidación y Devolución de Depósito en Garantía`,
        metadata: {
          depositOriginal: originalDeposit,
          deducciones: data.totalDeductions,
          motivoDeducciones: data.deductionsReason || "Sin deducciones",
          montoReembolsoAprobado: data.approvedRefundAmount,
          revisadoPor: userId,
          notasRevision: data.managerReviewNotes,
          fechaRevision: new Date().toISOString(),
        }
      }
    });

    revalidatePath("/rentas");
    revalidatePath(`/propiedades/${lease.propertyId}`);
    return {
      leaseId: lease.id,
      documentId: doc.id,
      occupancyStatus: "VACANT",
      originalDeposit,
      approvedRefund: data.approvedRefundAmount,
      totalDeductions: data.totalDeductions,
      status: "TERMINATED_SETTLED"
    };
  });
}

// -------------------------------------------------------------
// 9. CUS-09C: Ejecución Idempotente de Obligaciones Recurrentes (Servicios, Seguros, Predial)
// -------------------------------------------------------------
const executeRecurringObligationSchema = z.object({
  propertyId: z.string().uuid(),
  obligationType: z.enum(["INSURANCE", "PREDIAL", "FUMIGATION", "MAINTENANCE_FEE", "HOA_DUES"]),
  title: z.string().min(3),
  amount: z.number().positive(),
  periodKey: z.string(), // ej. "2026-Q3", "2026-10" para idempotencia
  notes: z.string().optional(),
})

export async function executeRecurringObligationAction(input: z.infer<typeof executeRecurringObligationSchema>) {
  return safeAction(executeRecurringObligationSchema, input, async (data, tenantId, userId) => {
    // Clave de idempotencia única para este periodo y obligación
    const idempotencySourceId = `RECURRING_${data.obligationType}_${data.periodKey}`;

    const existingTask = await prisma.operationalTask.findFirst({
      where: {
        tenantId,
        propertyId: data.propertyId,
        sourceType: "RECURRENT",
        sourceId: idempotencySourceId,
      }
    });

    if (existingTask) {
      return {
        taskId: existingTask.id,
        title: existingTask.title,
        status: existingTask.status,
        alreadyGenerated: true,
      };
    }

    // Generar tarea operativa para dar seguimiento o pagar la obligación
    const task = await prisma.operationalTask.create({
      data: {
        tenantId,
        propertyId: data.propertyId,
        title: `[Recurrente ${data.periodKey}] ${data.title} ($${data.amount} MXN)`,
        description: `Obligación periódica programada (${data.obligationType}). ${data.notes || ""}`,
        priority: "HIGH",
        status: "PENDING",
        sourceType: "RECURRENT",
        sourceId: idempotencySourceId,
        checklistJson: [
          { id: "1", text: "Verificar recibo/póliza vigente", completed: false, required: true },
          { id: "2", text: "Efectuar o validar pago", completed: false, required: true },
          { id: "3", text: "Archivar comprobante digital", completed: false, required: true },
        ]
      }
    });

    revalidatePath(`/propiedades/${data.propertyId}`);
    return {
      taskId: task.id,
      title: task.title,
      status: task.status,
      alreadyGenerated: false,
    };
  });
}

// -------------------------------------------------------------
// 10. CUS-10: Firma Digital del Contrato de Arrendamiento por Inquilino
// -------------------------------------------------------------
const signLeaseSchema = z.object({
  leaseId: z.string().uuid(),
  signerFullName: z.string().min(3),
  consentAccepted: z.literal(true),
  notes: z.string().optional(),
});

export async function signLeaseAgreementAction(input: z.infer<typeof signLeaseSchema>) {
  return safeAction(signLeaseSchema, input, async (data, tenantId, userId) => {
    const res = await leaseService.signLease({
      tenantId,
      userId,
      leaseId: data.leaseId,
      signerFullName: data.signerFullName,
      consentAccepted: data.consentAccepted,
      notes: data.notes,
    });

    const lease = await prisma.lease.findUnique({
      where: { id: data.leaseId },
      select: { propertyId: true }
    });

    revalidatePath("/inquilino");
    revalidatePath("/rentas");
    if (lease?.propertyId) {
      revalidatePath(`/propiedades/${lease.propertyId}`);
    }

    return res;
  });
}



