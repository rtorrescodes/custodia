"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/auth/action-wrapper"
import { prisma } from "@/lib/prisma"
import { resolveMembershipContext, canAccessProperty } from "@/lib/auth/membership-guard"
import { propertyService } from "@/lib/services/property-service"

const propertySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  address: z.string().min(5, "La dirección debe ser más descriptiva"),
  fraccionamiento: z.string().optional(),
  alddeaId: z.string().optional(),
  portfolioId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  isUnit: z.boolean().optional(),
  unitNumber: z.string().optional(),
  managementType: z.enum(["OWNED", "THIRD_PARTY", "PENDING_REVIEW"]).optional(),
  fundCustodian: z.enum(["LANDLORD", "PM_ESCROW", "DIRECT_OWNER", "UNDETERMINED"]).optional(),
})

export async function createProperty(input: z.infer<typeof propertySchema>) {
  return safeAction(propertySchema, input, async (data, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const newProperty = await propertyService.createProperty(auth.context, {
      name: data.name,
      address: data.address,
      fraccionamiento: data.fraccionamiento,
      alddeaId: data.alddeaId,
      portfolioId: data.portfolioId,
      parentId: data.parentId,
      isUnit: data.isUnit,
      unitNumber: data.unitNumber,
      managementType: data.managementType,
      fundCustodian: data.fundCustodian,
    });

    revalidatePath("/propiedades");
    return { property: newProperty };
  });
}

const updatePropertySchema = z.object({
  id: z.string().uuid(),
  data: propertySchema,
})

export async function updateProperty(input: z.infer<typeof updatePropertySchema>) {
  return safeAction(updatePropertySchema, input, async ({ id, data }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const access = await canAccessProperty(auth.context, id, "EDIT_PROPERTY");
    if (!access.allowed) {
      throw new Error(access.reason || "No tienes permiso para editar este inmueble.");
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address,
        fraccionamiento: data.fraccionamiento || null,
        alddeaId: data.alddeaId || null,
        portfolioId: data.portfolioId || null,
        parentId: data.parentId || null,
        isUnit: data.isUnit ?? false,
        unitNumber: data.unitNumber || null,
        managementType: data.managementType || "PENDING_REVIEW",
        fundCustodian: data.fundCustodian || "UNDETERMINED",
      }
    });

    revalidatePath("/propiedades");
    revalidatePath(`/propiedades/${id}`);
    return { property: updated };
  });
}

const archivePropertySchema = z.object({ id: z.string().uuid() })

export async function archiveProperty(input: z.infer<typeof archivePropertySchema>) {
  return safeAction(archivePropertySchema, input, async ({ id }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    const archived = await propertyService.archiveProperty(auth.context, id);
    revalidatePath("/propiedades");
    revalidatePath(`/propiedades/${id}`);
    return { property: archived };
  });
}

const deletePropertySchema = z.object({ id: z.string().uuid() })

export async function deleteProperty(input: z.infer<typeof deletePropertySchema>) {
  return safeAction(deletePropertySchema, input, async ({ id }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) {
      throw new Error(auth.error);
    }

    // El servicio bloquea terminantemente si existen dependencias financieras u operativas
    await propertyService.deletePropertyHard(auth.context, id);

    revalidatePath("/propiedades");
    return { success: true };
  });
}
