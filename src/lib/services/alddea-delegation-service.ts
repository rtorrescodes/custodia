import { prisma } from '@/lib/prisma';

export interface PrepareAlddeaPassInput {
  tenantId: string;
  workOrderId: string;
  visitorName: string;
  visitorCompany?: string;
  purpose: string;
  validFrom: Date;
  validTo: Date;
  delegatedById: string;
}

/**
 * Adaptador de Integración y Delegación de Accesos a Alddea (CUS-05D)
 * - alddeaId no acredita mandato ciego; se exige vinculación delegada formal.
 * - En esta fase opera en modo MOCK explícito hasta autorización bilateral con Alddea.
 * - La bóveda de seguridad NUNCA se expone en pases ni mensajes.
 */
export const alddeaDelegationService = {
  /**
   * Prepara y registra un pase delegado para proveedores de mantenimiento
   */
  async preparePass(input: PrepareAlddeaPassInput) {
    const wo = await prisma.workOrder.findUnique({
      where: { id: input.workOrderId },
      include: { property: true },
    });

    if (!wo || wo.tenantId !== input.tenantId) {
      throw new Error('Orden de trabajo no encontrada.');
    }

    if (wo.status === 'CANCELLED' || wo.status === 'COMPLETED') {
      throw new Error('No se pueden generar pases para órdenes canceladas o concluidas.');
    }

    // Comprobar si la propiedad tiene vínculo con Alddea
    const alddeaId = wo.property.alddeaId;

    return prisma.alddeaPassDelegation.upsert({
      where: { workOrderId: input.workOrderId },
      update: {
        visitorName: input.visitorName,
        visitorCompany: input.visitorCompany,
        purpose: input.purpose,
        validFrom: input.validFrom,
        validTo: input.validTo,
        delegatedById: input.delegatedById,
        status: 'PREPARED',
        isMock: true,
      },
      create: {
        tenantId: input.tenantId,
        workOrderId: input.workOrderId,
        propertyId: wo.propertyId,
        visitorName: input.visitorName,
        visitorCompany: input.visitorCompany,
        purpose: input.purpose,
        validFrom: input.validFrom,
        validTo: input.validTo,
        delegatedById: input.delegatedById,
        status: 'PREPARED',
        isMock: true,
        alddeaBridgeUrl: alddeaId ? `https://alddea.app/pases/delegado/${wo.property.id}` : null,
        externalPassId: `mock_pass_${Date.now()}`,
      },
    });
  },

  /**
   * Revoca un pase de acceso previamente emitido
   */
  async revokePass(tenantId: string, workOrderId: string) {
    const delegation = await prisma.alddeaPassDelegation.findUnique({
      where: { workOrderId },
    });

    if (!delegation || delegation.tenantId !== tenantId) {
      throw new Error('Delegación de pase no encontrada.');
    }

    return prisma.alddeaPassDelegation.update({
      where: { workOrderId },
      data: { status: 'REVOKED' },
    });
  },
};
