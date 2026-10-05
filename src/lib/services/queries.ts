import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { withTenantRLS } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { resolveMembershipContext, MembershipContext } from '@/lib/auth/membership-guard';
import { propertyService } from '@/lib/services/property-service';

export async function getSessionAndTenant(requestedTenantId?: string): Promise<{
  session: any;
  tenantId: string;
  membership: MembershipContext;
}> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect('/login');
  }

  // Resolver tenant objetivo: solicitud del cliente -> cookie de org activa -> metadata legacy
  const cookieTenant = cookieStore.get('custodia_active_tenant')?.value;
  const targetTenantId = requestedTenantId || cookieTenant || (session.user.app_metadata?.tenantId as string);

  if (!targetTenantId) {
    throw new Error("No tenant associated with this user.");
  }

  // Validación de autorización en servidor (Zero Trust)
  const auth = await resolveMembershipContext(session.user.id, targetTenantId);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  return { session, tenantId: targetTenantId, membership: auth.context };
}

export async function getDashboardData(requestedTenantId?: string) {
  const { session, tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    // 1. Fetch User Data
    const user = await tx.user.findUnique({
      where: { id: session.user.id },
      include: { tenant: true },
    });

    // Filtros de acceso según rol de membresía
    const isVendor = membership.role === "VENDOR";
    const isOwner = membership.role === "OWNER";

    // 2. Fetch Work Orders con delimitación estricta por rol
    const woWhere: any = {};
    if (isVendor) {
      woWhere.assignedToId = session.user.id; // VENDOR solo ve órdenes asignadas
    } else if (isOwner) {
      woWhere.property = { owners: { some: { userId: session.user.id } } }; // OWNER solo de sus inmuebles
    } else if (membership.allowedPortfolioIds && membership.allowedPortfolioIds.length > 0) {
      woWhere.property = { portfolioId: { in: membership.allowedPortfolioIds } }; // PM_STAFF restringido
    }

    const workOrders = await tx.workOrder.findMany({
      where: woWhere,
      include: { property: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // 3. Conteo Fidedigno de Jerarquía (Inmuebles vs Unidades)
    const hierarchy = await propertyService.getHierarchyCounts(tenantId);

    const activeWorkOrdersCount = await tx.workOrder.count({
      where: { ...woWhere, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    });

    const currentMonth = new Date().getMonth();
    const transactions = await tx.transaction.findMany({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), currentMonth, 1),
        },
      },
    });

    const ingresos = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    return {
      usuario: {
        nombre: user?.email || 'Admin',
        rol: membership.role,
        status: membership.status,
      },
      kpis: {
        totalPropiedades: hierarchy.totalBuildings,
        totalUnidadesRentables: hierarchy.totalRentableUnits,
        unidadesPropias: hierarchy.ownedUnits,
        unidadesTerceros: hierarchy.thirdPartyUnits,
        ordenesPendientes: activeWorkOrdersCount,
        ingresosMesUSD: ingresos,
        ingresosMesMXN: ingresos * 20,
        alertasCriticas: activeWorkOrdersCount,
      },
      ordenesRecientes: workOrders.map((wo) => ({
        id: wo.id,
        titulo: wo.title,
        propiedad: wo.property.name,
        estado: (wo.status === 'PENDING' ? 'pendiente' : 
                 wo.status === 'IN_PROGRESS' ? 'en-progreso' : 
                 wo.status === 'COMPLETED' ? 'completada' : 'cancelada') as any,
        fecha: wo.createdAt.toISOString(),
        asignadoA: "Sin asignar",
        costo: {
          amount: Number(wo.actualCost || wo.estimatedCost || 0),
          currency: "MXN" as any
        },
      })),
    };
  });
}

export async function getPropertyData(propertyId: string, requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const property = await tx.property.findUnique({
      where: { id: propertyId },
      include: {
        owners: { include: { user: true } },
        tenant: { include: { integrations: true } },
        portfolio: true,
        parent: true,
      },
    });

    if (!property) {
      throw new Error("Property not found");
    }

    // Aislamiento: Propietario solo ve sus inmuebles
    if (membership.role === "OWNER") {
      const isOwner = property.owners.some(o => o.userId === membership.userId);
      if (!isOwner) {
        throw new Error("No tienes autorización para consultar este inmueble.");
      }
    }

    // Aislamiento: PM_STAFF con carteras delimitadas
    if (membership.allowedPortfolioIds && membership.allowedPortfolioIds.length > 0 && property.portfolioId) {
      if (!membership.allowedPortfolioIds.includes(property.portfolioId)) {
        throw new Error("No tienes autorización para acceder a la cartera de este inmueble.");
      }
    }

    const workOrders = await tx.workOrder.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });

    const transactions = await tx.transaction.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      id: property.id,
      alddeaId: property.alddeaId,
      nombre: property.name,
      direccion: property.address,
      descripcion: "Propiedad administrada por " + property.tenant.name,
      fraccionamiento: property.fraccionamiento || "Independiente",
      managementType: property.managementType,
      fundCustodian: property.fundCustodian,
      cartera: property.portfolio?.name || "Sin cartera asignada",
      esUnidadHija: property.isUnit,
      inmueblePadre: property.parent?.name || null,
      amenidades: ["Estacionamiento", "Seguridad 24/7"],
      fotos: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=60",
      ],
      copropietarios: property.owners.map(o => ({
        id: o.userId,
        nombre: o.user.email,
        participacion: Number(o.ownershipShare),
      })),
      integraciones: [
        ...property.tenant.integrations.map(i => ({
          nombre: (i.provider === 'ALDDEA' ? 'Alddea' : 'RAVSIS') as any,
          estado: (i.isActive ? "conectado" : "error") as any,
          descripcion: "Integración configurada a nivel Tenant",
        })),
        ...(property.alddeaId ? [{
          nombre: 'Alddea' as any,
          estado: "conectado" as any,
          descripcion: "Vinculada por alddeaId",
        }] : [])
      ],
      estadisticas: {
        ingresosTotales: transactions.filter(t => t.type === 'INCOME').reduce((a, b) => a + Number(b.amount), 0),
        gastosTotales: transactions.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + Number(b.amount), 0),
        ordenesPendientes: workOrders.filter(w => w.status === 'PENDING').length,
      },
      ordenes: workOrders.map(w => ({
        id: w.id,
        titulo: w.title,
        estado: w.status.toLowerCase().replace('_', '-'),
        fecha: w.createdAt.toISOString(),
        prioridad: "media",
      })),
      transacciones: transactions.map(t => ({
        id: t.id,
        fecha: t.createdAt.toISOString(),
        tipo: t.type === 'INCOME' ? 'ingreso' : 'egreso',
        monto: {
          amount: Number(t.amount),
          currency: t.currency as any
        },
        descripcion: t.description,
        categoria: t.category,
      })),
      historial: workOrders.map(w => ({
        id: w.id,
        titulo: w.title,
        detalle: w.description,
        fecha: w.createdAt.toISOString(),
        estado: (w.status === 'PENDING' ? 'pendiente' : 
                 w.status === 'IN_PROGRESS' ? 'en-progreso' : 
                 woStatusToText(w.status)) as any,
      })),
      ledger: transactions.map(t => ({
        id: t.id,
        fecha: t.createdAt.toISOString(),
        concepto: t.description,
        monto: {
          amount: Number(t.amount),
          currency: t.currency as any
        },
        tipo: (t.type === 'INCOME' ? 'ingreso' : 'egreso') as any,
        categoria: t.category,
        descripcion: t.description
      })),
    };
  });
}

function woStatusToText(status: string) {
  if (status === 'COMPLETED') return 'completada';
  if (status === 'CANCELLED') return 'cancelada';
  return 'pendiente';
}

export async function getProperties(search?: string, fraccionamiento?: string, requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const whereClause: any = {
      archivedAt: null // Solo propiedades activas no archivadas
    };

    if (search) {
      whereClause.name = { contains: search, mode: 'insensitive' };
    }
    if (fraccionamiento && fraccionamiento !== 'all') {
      if (fraccionamiento === 'Independiente') {
        whereClause.fraccionamiento = null;
      } else {
        whereClause.fraccionamiento = fraccionamiento;
      }
    }

    // Filtrar por carteras si es PM_STAFF con delimitación
    if (membership.allowedPortfolioIds && membership.allowedPortfolioIds.length > 0) {
      whereClause.portfolioId = { in: membership.allowedPortfolioIds };
    }

    // Filtrar si es OWNER
    if (membership.role === "OWNER") {
      whereClause.owners = { some: { userId: membership.userId } };
    }

    const properties = await tx.property.findMany({
      where: whereClause,
      include: {
        workOrders: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS'] } }
        },
        transactions: true,
        portfolio: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return properties.map(p => {
      const ingresos = p.transactions.filter(t => t.type === 'INCOME').reduce((acc, t) => acc + Number(t.amount), 0);
      return {
        id: p.id,
        nombre: p.name,
        direccion: p.address,
        fraccionamiento: p.fraccionamiento || "Independiente",
        alddeaId: p.alddeaId,
        managementType: p.managementType,
        cartera: p.portfolio?.name || "General",
        ordenesActivas: p.workOrders.length,
        ingresosMesUSD: ingresos,
        creadoEn: p.createdAt.toISOString(),
      };
    });
  });
}

export async function getLeases(requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const whereClause: any = {};
    if (membership.role === "OWNER") {
      whereClause.property = { owners: { some: { userId: membership.userId } } };
    } else if (membership.role === "RENTER") {
      whereClause.renterId = membership.userId;
    } else if (membership.allowedPortfolioIds && membership.allowedPortfolioIds.length > 0) {
      whereClause.property = { portfolioId: { in: membership.allowedPortfolioIds } };
    }

    return tx.lease.findMany({
      where: whereClause,
      include: {
        property: true,
        renter: true,
        charges: {
          orderBy: { dueDate: 'desc' }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  });
}

export async function getWorkOrders(requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const whereClause: any = {};
    if (membership.role === "VENDOR") {
      whereClause.assignedToId = membership.userId;
    } else if (membership.allowedPortfolioIds && membership.allowedPortfolioIds.length > 0) {
      whereClause.property = { portfolioId: { in: membership.allowedPortfolioIds } };
    } else if (membership.role === "OWNER") {
      whereClause.property = { owners: { some: { userId: membership.userId } } };
    }

    const wos = await tx.workOrder.findMany({
      where: whereClause,
      include: {
        property: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    return wos.map(w => ({
      id: w.id,
      titulo: w.title,
      descripcion: w.description || "",
      propiedad: w.property?.name || "Sin Asignar",
      propiedadId: w.propertyId,
      asignadoA: w.assignedToId ? "Proveedor Asignado" : "Sin Asignar",
      estado: (w.status === 'PENDING' ? 'pendiente' :
               w.status === 'IN_PROGRESS' ? 'en-progreso' :
               w.status === 'COMPLETED' ? 'completada' : 'cancelada') as any,
      costo: {
        amount: Number(w.actualCost || w.estimatedCost || 0),
        currency: "MXN" as any,
      },
      fecha: w.createdAt.toISOString(),
    }));
  });
}

export async function getOwnerProperties(requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const properties = await tx.property.findMany({
      where: {
        owners: { some: { userId: membership.userId } },
        archivedAt: null,
      },
      include: {
        portfolio: true,
      },
      orderBy: { name: 'asc' }
    });

    return properties.map(p => ({
      id: p.id,
      nombre: p.name,
      direccion: p.address,
      cartera: p.portfolio?.name || "General",
    }));
  });
}

export async function getOwnerLedger(propertyId?: string, requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const whereClause: any = {};
    if (propertyId) {
      whereClause.propertyId = propertyId;
    }
    // Verify owner has access to this property if OWNER role
    if (membership.role === "OWNER") {
      whereClause.property = { owners: { some: { userId: membership.userId } } };
    }

    const txs = await tx.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' }
    });

    const income = txs.filter(t => t.type === 'INCOME').reduce((a, b) => a + Number(b.amount), 0);
    const expense = txs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + Number(b.amount), 0);

    return {
      estado: txs.length > 0 ? "activo" : "vacio",
      transacciones: txs.map(t => ({
        id: t.id,
        fecha: t.createdAt.toISOString(),
        tipo: t.type === 'INCOME' ? 'ingreso' : 'egreso',
        monto: { amount: Number(t.amount), currency: t.currency },
        descripcion: t.description,
        categoria: t.category
      })),
      resumen: {
        saldoActual: { amount: income - expense, currency: "MXN" },
        ingresosMes: { amount: income, currency: "MXN" },
        egresosMes: { amount: expense, currency: "MXN" }
      }
    };
  });
}

export async function getRenterPortalData(requestedTenantId?: string) {
  const { tenantId, session } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const leases = await tx.lease.findMany({
      where: { renterId: session.user.id },
      include: {
        property: true,
        evidences: true,
      }
    });

    return leases;
  });
}

