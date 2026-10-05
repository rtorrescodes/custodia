import { prisma } from "@/lib/prisma";
import { MembershipContext } from "@/lib/auth/membership-guard";

export interface NavigationItem {
  name: string;
  href: string;
  icon: string;
  badge?: number;
}

export interface TodayActionItem {
  id: string;
  type: "RENT_OVERDUE" | "LEASE_EXPIRING" | "MAINTENANCE_PENDING" | "EMPTY_UNIT";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  propertyAddress: string;
  propertyName: string;
  responsibleParty: string;
  actionLabel: string;
  actionHref: string;
}

export interface TodayDashboardView {
  operatingMode: "LANDLORD" | "PROPERTY_MANAGER";
  navItems: NavigationItem[];
  actionItems: TodayActionItem[];
  kpis: {
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: number;
    pendingWorkOrders: number;
    // Advertencia explícita sobre saldos fiduciarios pendientes de CUS-02
    financialAccountingStatus: "RECORD_ONLY_PENDING_CUS02";
  };
}

export const experienceAdapter = {
  /**
   * Genera la navegación contextual según el modo operativo y rol del usuario
   */
  getNavigation(mode: "LANDLORD" | "PROPERTY_MANAGER", role: string): NavigationItem[] {
    const common: NavigationItem[] = [
      { name: "Hoy", href: "/", icon: "Home" },
      { name: "Propiedades", href: "/propiedades", icon: "Building" },
      { name: "Rentas y Contratos", href: "/rentas", icon: "Key" },
      { name: "Mantenimiento", href: "/mantenimiento", icon: "Wrench" }
    ];

    if (mode === "PROPERTY_MANAGER" || role === "PM_ADMIN" || role === "PM_STAFF") {
      return [
        ...common,
        { name: "Propietarios", href: "/portal", icon: "Users" },
        { name: "Proveedores", href: "/proveedores", icon: "Truck" }
      ];
    }

    return common;
  },

  /**
   * Genera los datos fidedignos de la pantalla "Hoy"
   */
  async getTodayDashboard(context: MembershipContext): Promise<TodayDashboardView> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: context.tenantId }
    });

    const operatingMode = tenant?.operatingMode || (context.role === "LANDLORD" ? "LANDLORD" : "PROPERTY_MANAGER");

    // 1. Obtener inmuebles activos
    const properties = await prisma.property.findMany({
      where: { tenantId: context.tenantId, archivedAt: null },
      include: {
        leases: {
          where: { status: "ACTIVE" },
          include: { renter: true }
        },
        workOrders: {
          where: { status: { in: ["PENDING", "IN_PROGRESS", "AWAITING_APPROVAL"] } },
          include: { assignedTo: true }
        }
      }
    });

    const totalUnits = properties.length;
    let occupiedUnits = 0;
    let pendingWorkOrdersCount = 0;
    const actionItems: TodayActionItem[] = [];

    const now = new Date();
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    for (const prop of properties) {
      const activeLease = prop.leases[0];
      if (activeLease) {
        occupiedUnits++;

        // Contratos por expirar en los próximos 30 días
        if (activeLease.endDate <= in30Days && activeLease.endDate >= now) {
          actionItems.push({
            id: `lease-exp-${activeLease.id}`,
            type: "LEASE_EXPIRING",
            priority: "HIGH",
            title: `Contrato por expirar el ${activeLease.endDate.toLocaleDateString()}`,
            propertyAddress: prop.address,
            propertyName: prop.name,
            responsibleParty: activeLease.renter.email,
            actionLabel: "Iniciar Renovación",
            actionHref: `/rentas`
          });
        }
      } else {
        // Unidad vacía desocupada
        actionItems.push({
          id: `empty-unit-${prop.id}`,
          type: "EMPTY_UNIT",
          priority: "MEDIUM",
          title: "Unidad desocupada sin contrato activo",
          propertyAddress: prop.address,
          propertyName: prop.name,
          responsibleParty: operatingMode === "LANDLORD" ? "Casero" : "Property Manager",
          actionLabel: "Registrar Inquilino",
          actionHref: `/rentas`
        });
      }

      // Órdenes de trabajo abiertas
      for (const wo of prop.workOrders) {
        pendingWorkOrdersCount++;
        actionItems.push({
          id: `wo-${wo.id}`,
          type: "MAINTENANCE_PENDING",
          priority: wo.status === "AWAITING_APPROVAL" ? "CRITICAL" : "MEDIUM",
          title: `Mantenimiento: ${wo.title} (${wo.status})`,
          propertyAddress: prop.address,
          propertyName: prop.name,
          responsibleParty: wo.assignedTo?.email || "Sin asignar",
          actionLabel: "Revisar Ticket",
          actionHref: `/mantenimiento`
        });
      }
    }

    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    return {
      operatingMode,
      navItems: this.getNavigation(operatingMode, context.role),
      actionItems,
      kpis: {
        totalUnits,
        occupiedUnits,
        occupancyRate,
        pendingWorkOrders: pendingWorkOrdersCount,
        financialAccountingStatus: "RECORD_ONLY_PENDING_CUS02"
      }
    };
  }
};
