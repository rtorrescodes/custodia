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

// -------------------------------------------------------------
// Generar Expediente de Entrega de Administración (Handoff Dossier)
// -------------------------------------------------------------
const generateHandoffDossierSchema = z.object({
  propertyId: z.string().uuid(),
})

export async function generateHandoffDossierAction(input: z.infer<typeof generateHandoffDossierSchema>) {
  return safeAction(generateHandoffDossierSchema, input, async ({ propertyId }, tenantId, userId) => {
    const auth = await resolveMembershipContext(userId, tenantId);
    if (!auth.ok) throw new Error(auth.error);

    const access = await canAccessProperty(auth.context, propertyId, "VIEW_PROPERTIES");
    if (!access.allowed) throw new Error(access.reason || "Sin acceso a la propiedad.");

    return prisma.$transaction(async (tx) => {
      const property = await tx.property.findUnique({
        where: { id: propertyId, tenantId },
        include: {
          owners: { include: { user: true } },
          leases: { where: { status: "ACTIVE" }, include: { renter: true } },
          workOrders: { orderBy: { createdAt: "desc" }, take: 20 },
          inspections: { orderBy: { inspectionDate: "desc" }, take: 10 },
          vaults: true,
          supplies: true,
        }
      });

      if (!property) throw new Error("Property not found");

      const { accountingService } = await import("@/lib/services/accounting-service");
      const fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, propertyId, tx);

      // CERO SECRETOS EN CLARO: Los secretos de bóveda se listan por tipo y nombre, jamás su valor sensible
      const sanitizedVaultEntries = property.vaults.map(v => ({
        id: v.id,
        keyName: v.keyName,
        type: v.type,
        instructions: v.instructions,
        isMasked: true,
        secretNote: "Clave bajo custodia segura. Requiere transferencia de credenciales independiente.",
      }));

      return {
        expedienteId: `DOSSIER-${property.id.slice(0, 8).toUpperCase()}`,
        generadoEn: new Date().toISOString(),
        generadoPor: userId,
        inmueble: {
          id: property.id,
          nombre: property.name,
          direccion: property.address,
          fraccionamiento: property.fraccionamiento,
          estadoOcupacion: property.occupancyStatus,
          tipoGestion: property.managementType,
          custodioFondos: property.fundCustodian,
        },
        propietarios: property.owners.map(o => ({
          email: o.user.email,
          participacion: Number(o.ownershipShare),
        })),
        arrendamientoActivo: property.leases[0] ? {
          inquilino: property.leases[0].renter.email,
          rentaMensual: Number(property.leases[0].rentAmount),
          moneda: property.leases[0].currency,
          diaPago: property.leases[0].paymentDay,
          inicio: property.leases[0].startDate.toISOString(),
          fin: property.leases[0].endDate.toISOString(),
        } : null,
        resumenFiduciario: {
          saldoNetoCustodiaPM: fiduciary.fondosNetosDueño,
          depositoGarantiaRetenido: fiduciary.depositosGarantiaRetenidos,
          reservaMinima: fiduciary.reservaMinimaContractual,
          compromisosOperativos: fiduciary.compromisosVigentes,
          disponibleReal: fiduciary.disponibleNuevasObligaciones,
          esDeficitario: fiduciary.esDeficitario,
        },
        inventarioSuministros: property.supplies.map(s => ({
          item: s.item,
          categoria: s.category,
          stockActual: s.currentStock,
          unidad: s.unit,
        })),
        ultimasInspecciones: property.inspections.map(i => ({
          tipo: i.type,
          fecha: i.inspectionDate.toISOString(),
          inspector: i.inspectorName,
          estado: i.status,
        })),
        bovedaDispositivos: sanitizedVaultEntries,
      };
    });
  });
}
