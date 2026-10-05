import { prisma } from '@/lib/prisma';

export interface CreateUnitAssetInput {
  tenantId: string;
  propertyId: string;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  installedAt?: Date;
  warrantyExpiresAt?: Date;
  maintenanceIntervalMonths?: number;
  notes?: string;
}

/**
 * Servicio de Inventario de Activos y Mantenimiento Preventivo (CUS-05C)
 * - Registro y ciclo de vida de equipamiento clave (A/C, boiler, bombas).
 * - Detección de activos con mantenimiento preventivo vencido.
 * - Cálculo acumulado de costo histórico por activo.
 */
export const assetManagementService = {
  /**
   * Da de alta un activo dentro de una unidad o inmueble
   */
  async createAsset(input: CreateUnitAssetInput) {
    return prisma.unitAsset.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        name: input.name,
        category: input.category,
        brand: input.brand,
        model: input.model,
        serialNumber: input.serialNumber,
        installedAt: input.installedAt,
        warrantyExpiresAt: input.warrantyExpiresAt,
        maintenanceIntervalMonths: input.maintenanceIntervalMonths || 6,
        notes: input.notes,
      },
    });
  },

  /**
   * Obtiene los activos que requieren servicio preventivo
   */
  async getAssetsDueForMaintenance(tenantId: string) {
    const assets = await prisma.unitAsset.findMany({
      where: { tenantId },
      include: { property: true },
    });

    const now = new Date();
    return assets.filter((asset) => {
      if (!asset.lastServicedAt) return true; // Nunca revisado
      const nextDue = new Date(asset.lastServicedAt);
      nextDue.setMonth(nextDue.getMonth() + asset.maintenanceIntervalMonths);
      return nextDue <= now;
    });
  },
};
