import { prisma } from '@/lib/prisma';

export interface PlanLimits {
  name: string;
  maxUnits: number;
  maxUsers: number;
  hasAdvancedAccounting: boolean;
  hasAutomatedPortals: boolean;
  hasAlddeaDelegation: boolean;
}

export const SAAS_PLANS: Record<string, PlanLimits> = {
  FREE: {
    name: 'Casero Individual (Gratis)',
    maxUnits: 2,
    maxUsers: 1,
    hasAdvancedAccounting: false,
    hasAutomatedPortals: true,
    hasAlddeaDelegation: false,
  },
  LANDLORD_PRO: {
    name: 'Casero Profesional',
    maxUnits: 15,
    maxUsers: 3,
    hasAdvancedAccounting: true,
    hasAutomatedPortals: true,
    hasAlddeaDelegation: true,
  },
  PM_BUSINESS: {
    name: 'Property Manager Empresa',
    maxUnits: 100,
    maxUsers: 10,
    hasAdvancedAccounting: true,
    hasAutomatedPortals: true,
    hasAlddeaDelegation: true,
  },
  ENTERPRISE: {
    name: 'Corporativo Ilimitado',
    maxUnits: 9999,
    maxUsers: 999,
    hasAdvancedAccounting: true,
    hasAutomatedPortals: true,
    hasAlddeaDelegation: true,
  },
};

/**
 * Servicio de Empaquetado SaaS y Control de Entitlements en Servidor (CUS-08A)
 * - Restricciones enforced en servidor (no solo botones desactivados en UI).
 * - Facturación de plataforma separada de la cobranza fiduciaria de propiedades.
 * - Validación de cuotas de unidades y usuarios.
 */
export const entitlementService = {
  /**
   * Obtiene la configuración y límites del plan activo del tenant
   */
  async getTenantPlanLimits(tenantId: string): Promise<PlanLimits> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true },
    });

    const planKey = tenant?.subscriptionPlan || 'FREE';
    return SAAS_PLANS[planKey] || SAAS_PLANS.FREE;
  },

  /**
   * Valida si la organización puede dar de alta una unidad adicional según su plan
   */
  async assertCanAddProperty(tenantId: string): Promise<void> {
    const limits = await this.getTenantPlanLimits(tenantId);
    const currentCount = await prisma.property.count({
      where: { tenantId, archivedAt: null },
    });

    if (currentCount >= limits.maxUnits) {
      throw new Error(
        `LÍMITE DE PLAN EXCEDIDO: Tu suscripción actual (${limits.name}) permite hasta ${limits.maxUnits} unidades activas (actuales: ${currentCount}). Actualiza tu plan para agregar más.`
      );
    }
  },
};
