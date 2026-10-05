import { prisma } from "@/lib/prisma";
import { MembershipContext, canAccessProperty } from "@/lib/auth/membership-guard";

export interface CreateLeaseInput {
  propertyId: string;
  renterId: string;
  startDate: Date;
  endDate: Date;
  rentAmount: number;
  currency?: string;
  depositAmount?: number;
  paymentDay: number;
}

export const leaseService = {
  /**
   * Valida si existe traslape incompatible de fechas para contratos activos en una unidad
   */
  async checkLeaseOverlap(propertyId: string, startDate: Date, endDate: Date, excludeLeaseId?: string): Promise<{ hasOverlap: boolean; conflictingLeaseId?: string }> {
    const activeLeases = await prisma.lease.findMany({
      where: {
        propertyId,
        status: { in: ["ACTIVE", "PENDING_SIGNATURE"] },
        id: excludeLeaseId ? { not: excludeLeaseId } : undefined
      }
    });

    for (const lease of activeLeases) {
      // Verificación de traslape: (StartA <= EndB) and (EndA >= StartB)
      const overlaps = (startDate <= lease.endDate) && (endDate >= lease.startDate);
      if (overlaps) {
        return { hasOverlap: true, conflictingLeaseId: lease.id };
      }
    }

    return { hasOverlap: false };
  },

  /**
   * Crear o registrar contrato existente asegurando la exclusión de traslapes
   */
  async createLease(context: MembershipContext, input: CreateLeaseInput) {
    const access = await canAccessProperty(context, input.propertyId, "MANAGE_LEASES");
    if (!access.allowed) {
      throw new Error(access.reason || "Acceso denegado para administrar contratos en este inmueble.");
    }

    if (input.endDate <= input.startDate) {
      throw new Error("La fecha de fin de contrato debe ser posterior a la fecha de inicio.");
    }

    // Validación atómica de traslape
    const { hasOverlap, conflictingLeaseId } = await this.checkLeaseOverlap(
      input.propertyId,
      input.startDate,
      input.endDate
    );

    if (hasOverlap) {
      throw new Error(
        `TRASLAPE INCOMPATIBLE: La unidad ya cuenta con un contrato activo/pendiente en ese rango de fechas (ID: ${conflictingLeaseId}).`
      );
    }

    // Verificar que el inquilino pertenezca al sistema
    const renter = await prisma.user.findUnique({
      where: { id: input.renterId }
    });
    if (!renter) {
      throw new Error("Inquilino no encontrado.");
    }

    const newLease = await prisma.lease.create({
      data: {
        tenantId: context.tenantId,
        propertyId: input.propertyId,
        renterId: input.renterId,
        startDate: input.startDate,
        endDate: input.endDate,
        rentAmount: input.rentAmount,
        currency: input.currency || "MXN",
        depositAmount: input.depositAmount || null,
        paymentDay: input.paymentDay,
        status: "ACTIVE"
      },
      include: {
        property: true,
        renter: true
      }
    });

    return newLease;
  },

  /**
   * Finalizar contrato de arrendamiento
   * El inquilino pierde acceso a nuevos eventos de la unidad pero preserva sus recibos históricos
   */
  async terminateLease(context: MembershipContext, leaseId: string) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenantId: context.tenantId }
    });

    if (!lease) {
      throw new Error("Contrato no encontrado en esta organización.");
    }

    const access = await canAccessProperty(context, lease.propertyId, "MANAGE_LEASES");
    if (!access.allowed) {
      throw new Error(access.reason || "Acceso denegado para modificar contratos.");
    }

    return prisma.lease.update({
      where: { id: leaseId },
      data: { status: "ENDED" }
    });
  },

  /**
   * Autorizar contrato de arrendamiento (pasa de DRAFT a PENDING_SIGNATURE o ACTIVE)
   */
  async authorizeLease(context: MembershipContext, leaseId: string) {
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, tenantId: context.tenantId }
    });

    if (!lease) {
      throw new Error("Contrato no encontrado en esta organización.");
    }

    const access = await canAccessProperty(context, lease.propertyId, "MANAGE_LEASES");
    if (!access.allowed) {
      throw new Error(access.reason || "Acceso denegado para autorizar contratos.");
    }

    return prisma.lease.update({
      where: { id: leaseId },
      data: { status: "PENDING_SIGNATURE" }
    });
  }
};
