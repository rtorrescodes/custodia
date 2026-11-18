import { prisma } from "@/lib/prisma";
import { MembershipContext, canAccessProperty } from "@/lib/auth/membership-guard";

export interface CreatePropertyInput {
  name: string;
  address: string;
  fraccionamiento?: string;
  alddeaId?: string;
  portfolioId?: string;
  parentId?: string; // Si es unidad hija de un edificio
  isUnit?: boolean;
  unitNumber?: string;
  managementType?: "OWNED" | "THIRD_PARTY" | "PENDING_REVIEW";
  fundCustodian?: "LANDLORD" | "PM_ESCROW" | "DIRECT_OWNER" | "UNDETERMINED";
  ownerUserIds?: { userId: string; ownershipShare?: number }[];
}

export interface PropertyHierarchyCounts {
  totalBuildings: number;
  totalRentableUnits: number;
  ownedUnits: number;
  thirdPartyUnits: number;
  archivedUnits: number;
}

/**
 * Servicio de Inmuebles, Unidades y Carteras (CUS-01)
 */
export const propertyService = {
  /**
   * Conteo fidedigno de la jerarquía de propiedades y unidades
   */
  async getHierarchyCounts(tenantId: string): Promise<PropertyHierarchyCounts> {
    const all = await prisma.property.findMany({
      where: { tenantId }
    });

    const active = all.filter(p => !p.archivedAt);
    const archived = all.filter(p => !!p.archivedAt);

    // Inmuebles matrices o independientes (sin padre)
    const buildings = active.filter(p => !p.parentId);

    // Unidades rentables: aquellas marcadas como isUnit O que no tienen hijos (casas individuales rentables)
    // Para exactitud: si una propiedad tiene hijas, las hijas son las unidades; si no tiene hijas, la propiedad misma es 1 unidad rentable.
    const parentIdsWithChildren = new Set(active.filter(p => p.parentId).map(p => p.parentId!));
    
    let rentableUnitsCount = 0;
    let ownedCount = 0;
    let thirdPartyCount = 0;

    for (const prop of active) {
      const isParentBuilding = parentIdsWithChildren.has(prop.id);
      if (!isParentBuilding) {
        // Es una unidad rentable (departamento hijo o casa independiente)
        rentableUnitsCount++;
        if (prop.managementType === "OWNED") {
          ownedCount++;
        } else {
          thirdPartyCount++;
        }
      }
    }

    return {
      totalBuildings: buildings.length,
      totalRentableUnits: rentableUnitsCount,
      ownedUnits: ownedCount,
      thirdPartyUnits: thirdPartyCount,
      archivedUnits: archived.length
    };
  },

  /**
   * Crear inmueble o unidad rentable con validación de facultades
   */
  async createProperty(context: MembershipContext, input: CreatePropertyInput) {
    if (context.role !== "PM_ADMIN" && context.role !== "LANDLORD") {
      throw new Error("No tienes facultad para registrar inmuebles en esta organización.");
    }

    // Si se especifica portfolioId, verificar que pertenezca al tenant
    if (input.portfolioId) {
      const portfolio = await prisma.portfolio.findFirst({
        where: { id: input.portfolioId, tenantId: context.tenantId }
      });
      if (!portfolio) {
        throw new Error("La cartera especificada no pertenece a esta organización.");
      }
    }

    // Si se especifica parentId (edificio padre), verificar que pertenezca al tenant
    if (input.parentId) {
      const parent = await prisma.property.findFirst({
        where: { id: input.parentId, tenantId: context.tenantId }
      });
      if (!parent) {
        throw new Error("El inmueble principal (edificio) no pertenece a esta organización.");
      }
    }

    const managementType = input.managementType || (context.role === "LANDLORD" ? "OWNED" : "THIRD_PARTY");
    const fundCustodian = input.fundCustodian || (managementType === "OWNED" ? "LANDLORD" : "PM_ESCROW");

    const newProperty = await prisma.property.create({
      data: {
        tenantId: context.tenantId,
        name: input.name,
        address: input.address,
        fraccionamiento: input.fraccionamiento || null,
        alddeaId: input.alddeaId || null,
        portfolioId: input.portfolioId || null,
        parentId: input.parentId || null,
        isUnit: input.isUnit || !!input.parentId,
        unitNumber: input.unitNumber || null,
        managementType,
        fundCustodian,
        owners: input.ownerUserIds && input.ownerUserIds.length > 0 ? {
          create: input.ownerUserIds.map(o => ({
            userId: o.userId,
            ownershipShare: o.ownershipShare ?? 100.00
          }))
        } : undefined
      },
      include: {
        owners: true,
        portfolio: true
      }
    });

    return newProperty;
  },

  /**
   * Archivación segura (Soft Delete)
   * Preserva contratos, transacciones, órdenes de trabajo e historial fiduciario.
   */
  async archiveProperty(context: MembershipContext, propertyId: string) {
    const access = await canAccessProperty(context, propertyId, "ARCHIVE_PROPERTY");
    if (!access.allowed) {
      throw new Error(access.reason || "Acceso denegado para archivar este inmueble.");
    }

    return prisma.property.update({
      where: { id: propertyId },
      data: { archivedAt: new Date() }
    });
  },

  /**
   * Intento de borrado destructivo
   * Bloquea terminantemente si existen contratos, transacciones o tickets vinculados.
   */
  async deletePropertyHard(context: MembershipContext, propertyId: string) {
    const access = await canAccessProperty(context, propertyId, "ARCHIVE_PROPERTY");
    if (!access.allowed) {
      throw new Error(access.reason || "Acceso denegado.");
    }

    // Comprobar dependencias financieras y operativas
    const [leasesCount, transactionsCount, workOrdersCount] = await Promise.all([
      prisma.lease.count({ where: { propertyId } }),
      prisma.transaction.count({ where: { propertyId } }),
      prisma.workOrder.count({ where: { propertyId } })
    ]);

    if (leasesCount > 0 || transactionsCount > 0 || workOrdersCount > 0) {
      throw new Error(
        `BLOQUEO DE INTEGRIDAD: No se puede eliminar el inmueble de forma destructiva porque contiene dependencias activas (${leasesCount} contratos, ${transactionsCount} transacciones, ${workOrdersCount} órdenes). Debe archivarse en su lugar.`
      );
    }

    return prisma.property.delete({
      where: { id: propertyId }
    });
  }
};
