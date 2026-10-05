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
  paymentDay: z.number().min(1).max(31)
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

    // Crear el contrato
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
        status: "ACTIVE"
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

