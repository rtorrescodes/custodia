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

