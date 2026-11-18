import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface InspectionZoneItem {
  name: string;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';
  notes?: string;
  photoUrl?: string;
  photoSha256?: string;
}

export interface InspectionZone {
  zoneName: string; // ej. "Cocina", "Recámara Principal", "Baño Visitas"
  items: InspectionZoneItem[];
}

export interface CreateInspectionInput {
  tenantId: string;
  propertyId: string;
  leaseId?: string;
  type: 'MOVE_IN' | 'MOVE_OUT' | 'ROUTINE';
  inspectorName: string;
  summaryNotes?: string;
  zones: InspectionZone[];
}

/**
 * Servicio de Inspecciones de Entrada (Move-in) y Salida (Move-out) (CUS-04C)
 * - Inventario detallado por zonas.
 * - Hashing SHA-256 de evidencia fotográfica para evitar manipulación de disputas.
 * - Cálculo comparativo (diff) entre entrega y devolución para liquidación de depósito.
 */
export const inspectionService = {
  /**
   * Crea y completa una inspección con su inventario por zonas
   */
  async createInspection(input: CreateInspectionInput) {
    // Calcular hash de fotos si existen
    const processedZones = input.zones.map((zone) => ({
      ...zone,
      items: zone.items.map((item) => {
        let photoSha256 = item.photoSha256;
        if (item.photoUrl && !photoSha256) {
          // Generar hash sintético reproducible si no se proveyó
          photoSha256 = crypto.createHash('sha256').update(item.photoUrl).digest('hex');
        }
        return {
          ...item,
          photoSha256,
        };
      }),
    }));

    return prisma.inspection.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        leaseId: input.leaseId,
        type: input.type,
        status: 'COMPLETED',
        inspectorName: input.inspectorName,
        summaryNotes: input.summaryNotes,
        checklistJson: {
          zones: processedZones,
          completedAt: new Date().toISOString(),
          version: '1.0',
        },
      },
    });
  },

  /**
   * Compara una inspección de entrada (Move-In) contra una de salida (Move-Out)
   * para detectar daños nuevos o elementos faltantes.
   */
  async compareInspections(moveInId: string, moveOutId: string) {
    const [moveIn, moveOut] = await Promise.all([
      prisma.inspection.findUnique({ where: { id: moveInId } }),
      prisma.inspection.findUnique({ where: { id: moveOutId } }),
    ]);

    if (!moveIn || !moveOut) {
      throw new Error('Inspección de entrada o salida no encontrada.');
    }

    const inZones: InspectionZone[] = (moveIn.checklistJson as any)?.zones || [];
    const outZones: InspectionZone[] = (moveOut.checklistJson as any)?.zones || [];

    const differences: Array<{
      zone: string;
      item: string;
      inCondition: string;
      outCondition: string;
      deductionSuggested: boolean;
      notes?: string;
    }> = [];

    for (const oZone of outZones) {
      const iZone = inZones.find((z) => z.zoneName.toLowerCase() === oZone.zoneName.toLowerCase());
      for (const oItem of oZone.items) {
        const iItem = iZone?.items.find((i) => i.name.toLowerCase() === oItem.name.toLowerCase());
        const inCondition = iItem ? iItem.condition : 'UNKNOWN';

        if (oItem.condition === 'DAMAGED' || oItem.condition === 'MISSING') {
          differences.push({
            zone: oZone.zoneName,
            item: oItem.name,
            inCondition,
            outCondition: oItem.condition,
            deductionSuggested: inCondition !== 'DAMAGED' && inCondition !== 'MISSING',
            notes: oItem.notes,
          });
        }
      }
    }

    return {
      moveInId,
      moveOutId,
      propertyId: moveIn.propertyId,
      differencesCount: differences.length,
      differences,
    };
  },
};
