import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { withTenantRLS } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { resolveMembershipContext, MembershipContext } from '@/lib/auth/membership-guard';
import { propertyService } from '@/lib/services/property-service';
import { accountingService } from '@/lib/services/accounting-service';

import { getVerifiedIdentity, VerifiedIdentity } from '@/lib/auth/identity';

export async function getSessionAndTenant(requestedTenantId?: string): Promise<{
  session: { user: VerifiedIdentity['user'] };
  tenantId: string;
  membership: MembershipContext;
}> {
  const cookieStore = await cookies();
  const identity = await getVerifiedIdentity();

  if (!identity) {
    redirect('/login');
  }

  // Resolver tenant objetivo: solicitud del cliente -> cookie de org activa -> metadata verificada
  const cookieTenant = cookieStore.get('custodia_active_tenant')?.value;
  const targetTenantId = requestedTenantId || cookieTenant || 
    (identity.user.app_metadata?.tenantId as string) ||
    (identity.user.user_metadata?.tenantId as string);

  if (!targetTenantId) {
    throw new Error("No tenant associated with this user.");
  }

  // Validación de autorización en servidor (Zero Trust)
  const auth = await resolveMembershipContext(identity.userId, targetTenantId);
  if (!auth.ok) {
    throw new Error(auth.error);
  }

  return { session: { user: identity.user }, tenantId: targetTenantId, membership: auth.context };
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
        vaults: true,
        agreements: true,
        leases: {
          include: { renter: true }
        },
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

    // Cargar en paralelo las colecciones operativas independientes de la propiedad
    const [
      workOrders,
      transactions,
      inspections,
      operationalTasks,
      ownerContributions,
      supplies,
      commThreadRaw,
    ] = await Promise.all([
      tx.workOrder.findMany({
        where: { propertyId },
        include: { quotes: true },
        orderBy: { createdAt: 'desc' },
      }),
      tx.transaction.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
      }),
      tx.inspection.findMany({
        where: { propertyId },
        orderBy: { inspectionDate: 'desc' },
      }),
      tx.operationalTask.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
      }),
      tx.ownerContribution.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
      }),
      tx.supplyInventory.findMany({
        where: { propertyId },
        orderBy: { item: 'asc' },
      }),
      tx.communicationThread.findFirst({
        where: { propertyId, audience: "PM_OWNER" },
        include: {
          messages: { orderBy: { createdAt: 'asc' } }
        }
      }),
    ]);

    let commThread = commThreadRaw;
    if (!commThread) {
      commThread = await tx.communicationThread.create({
        data: {
          tenantId,
          propertyId,
          audience: "PM_OWNER",
          title: `Canal de Comunicación - ${property.name}`,
        },
        include: {
          messages: true
        }
      });
    }

    // CÁLCULO FIDUCIARIO REAL Y UNIFICADO CON EL MOTOR CONTABLE (CUS-09B)
    const fiduciarySummary = await accountingService.getPropertyFiduciarySummary(tenantId, propertyId, tx);

    const activeAgreement = property.agreements[0] || null;
    const reserveMin = fiduciarySummary.reservaMinimaContractual;
    const pmExpenseLimit = fiduciarySummary.politicaGastoPM.limiteAutorizado;
    const availableFunds = fiduciarySummary.disponibleNuevasObligaciones;

    return {
      id: property.id,
      alddeaId: property.alddeaId,
      nombre: property.name,
      direccion: property.address,
      descripcion: "Propiedad administrada por " + property.tenant.name,
      fraccionamiento: property.fraccionamiento || "Independiente",
      managementType: property.managementType,
      fundCustodian: property.fundCustodian,
      occupancyStatus: property.occupancyStatus || "VACANT",
      primaryManagerId: property.primaryManagerId,
      careVisitIntervalDays: property.careVisitIntervalDays || 15,
      lastCareVisitAt: property.lastCareVisitAt?.toISOString() || null,
      cartera: property.portfolio?.name || "Sin cartera asignada",
      esUnidadHija: property.isUnit,
      inmueblePadre: property.parent?.name || null,
      amenidades: ["Estacionamiento", "Seguridad 24/7", "Alberca", "Wi-Fi de Alta Velocidad"],
      fotos: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=60",
      ],
      copropietarios: property.owners.map(o => ({
        id: o.userId,
        nombre: o.user.email,
        participacion: Number(o.ownershipShare),
      })),
      acuerdo: activeAgreement ? {
        id: activeAgreement.id,
        tipoComision: activeAgreement.commissionType,
        tasaComision: Number(activeAgreement.commissionRate),
        reservaMinima: reserveMin,
        pmExpenseLimit: pmExpenseLimit,
        autoApproveCategories: activeAgreement.autoApproveCategories || [],
        reglaEmergencia: activeAgreement.emergencyRule || null,
        estaConfigurado: pmExpenseLimit !== null,
      } : {
        id: null,
        tipoComision: "PERCENTAGE_RENT",
        tasaComision: 0.10,
        reservaMinima: 2000,
        pmExpenseLimit: null,
        autoApproveCategories: [],
        reglaEmergencia: null,
        estaConfigurado: false,
      },
      fondosFiduciarios: {
        custodiaPmEfectiva: fiduciarySummary.custodiaPmEfectiva,
        cobranzaDirectaDueño: fiduciarySummary.cobranzaDirectaDueño,
        depositosGarantiaRetenidos: fiduciarySummary.depositosGarantiaRetenidos,
        fondosNetosDueño: fiduciarySummary.fondosNetosDueño,
        reservaMinima: reserveMin,
        reservaConstituida: fiduciarySummary.reservaConstituida,
        reservaFaltante: fiduciarySummary.reservaFaltante,
        fondosComprometidos: fiduciarySummary.compromisosVigentes,
        disponibleNuevasObligaciones: availableFunds,
        deficitReal: fiduciarySummary.deficitReal,
        esDeficitario: fiduciarySummary.esDeficitario,
        facultadPM: pmExpenseLimit,
        estaConfigurado: fiduciarySummary.politicaGastoPM.estaConfigurado,
      },
      // CERO SECRETOS EN CLARO: Enmascaramiento estricto por defecto
      boveda: property.vaults.map(v => ({
        id: v.id,
        keyName: v.keyName,
        type: v.type,
        keyValue: "••••••••", // Enmascarado en la consulta normal
        isMasked: true,
        isRotated: v.isRotated,
        lastRotatedAt: v.lastRotatedAt?.toISOString() || null,
        instructions: v.instructions || "",
      })),
      ordenesConCotizacion: workOrders.map(w => {
        const estCost = Number(w.estimatedCost || 0);
        // Si pmExpenseLimit es null (no configurado), requiere obligatoriamente aprobación del dueño
        const requiresApproval = pmExpenseLimit === null || estCost > pmExpenseLimit;
        const isBlockedFunds = !requiresApproval && estCost > availableFunds;
        return {
          id: w.id,
          titulo: w.title,
          descripcion: w.description,
          estado: w.status,
          prioridad: w.priority,
          costoEstimado: estCost,
          costoReal: Number(w.actualCost || 0),
          requiereAprobacionOwner: requiresApproval,
          bloqueadoPorFondos: isBlockedFunds,
          cotizaciones: w.quotes.map(q => ({
            id: q.id,
            version: q.version || 1,
            costoTotal: Number(q.totalCost),
            costoManoObra: Number(q.laborCost),
            costoMateriales: Number(q.materialCost),
            estado: q.status,
            partidas: q.itemsJson,
            aprobadoPor: q.approvedById,
            aprobadoEn: q.approvedAt?.toISOString() || null,
          })),
        };
      }),
      tareasOperativas: operationalTasks.map(t => ({
        id: t.id,
        titulo: t.title,
        descripcion: t.description || "",
        prioridad: t.priority,
        estado: t.status,
        fechaLimite: t.dueDate?.toISOString() || null,
        motivoBloqueo: t.blockedReason || null,
        checklist: t.checklistJson || [],
        origen: t.sourceType,
        completadoEn: t.completedAt?.toISOString() || null,
      })),
      aportacionesDueño: ownerContributions.map(c => ({
        id: c.id,
        monto: Number(c.amount),
        moneda: c.currency,
        motivo: c.reason,
        estado: c.status,
        solicitadoEn: c.requestedAt.toISOString(),
        reportadoEn: c.reportedAt?.toISOString() || null,
        verificadoEn: c.verifiedAt?.toISOString() || null,
        comprobanteUrl: c.evidenceUrl || null,
      })),
      suministros: supplies.map(s => ({
        id: s.id,
        item: s.item,
        categoria: s.category,
        stockActual: s.currentStock,
        stockMinimo: s.minimumStock,
        unidad: s.unit,
      })),
      estadias: inspections.map(i => ({
        id: i.id,
        tipo: i.type,
        estado: i.status,
        responsable: i.inspectorName,
        fecha: i.inspectionDate.toISOString(),
        notas: i.summaryNotes || "",
        checklist: i.checklistJson || {},
      })),
      chat: {
        threadId: commThread.id,
        mensajes: commThread.messages.map(m => ({
          id: m.id,
          remitente: m.senderName,
          rol: m.senderRole,
          contenido: m.content,
          traduccion: (m.attachments as any)?.translatedContent || null,
          estadoTraduccion: (m.attachments as any)?.status || "NOT_AVAILABLE",
          fecha: m.createdAt.toISOString(),
          esMio: m.senderId === membership.userId,
        }))
      },
      contratos: property.leases.map(l => ({
        id: l.id,
        inquilino: l.renter.email,
        montoRenta: Number(l.rentAmount),
        moneda: l.currency,
        diaPago: l.paymentDay,
        inicio: l.startDate.toISOString(),
        fin: l.endDate.toISOString(),
        estado: l.status,
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

    // CUS-09B: Unificación con el motor contable fiduciario si hay propertyId específico
    let fiduciary: any = null;
    let pendingQuotes: any[] = [];
    let ownerContributions: any[] = [];

    if (propertyId) {
      fiduciary = await accountingService.getPropertyFiduciarySummary(tenantId, propertyId, tx);

      // Cotizaciones pendientes de decisión del propietario
      const quotes = await tx.workOrderQuote.findMany({
        where: {
          tenantId,
          status: "SUBMITTED",
          workOrder: { propertyId }
        },
        include: { workOrder: true },
        orderBy: { createdAt: "desc" }
      });

      pendingQuotes = quotes.map(q => ({
        id: q.id,
        version: q.version,
        workOrderId: q.workOrderId,
        titulo: q.workOrder.title,
        descripcion: q.workOrder.description,
        costoTotal: Number(q.totalCost),
        costoManoObra: Number(q.laborCost),
        costoMateriales: Number(q.materialCost),
        partidas: q.itemsJson,
        notas: q.notes,
        fecha: q.createdAt.toISOString(),
      }));

      // Aportaciones de fondos de este propietario para esta propiedad
      const contribs = await tx.ownerContribution.findMany({
        where: {
          tenantId,
          propertyId,
        },
        orderBy: { requestedAt: "desc" }
      });

      ownerContributions = contribs.map(c => ({
        id: c.id,
        monto: Number(c.amount),
        moneda: c.currency,
        motivo: c.reason,
        estado: c.status,
        solicitadoEn: c.requestedAt.toISOString(),
        reportadoEn: c.reportedAt?.toISOString() || null,
        verificadoEn: c.verifiedAt?.toISOString() || null,
        disponibleEn: c.availableAt?.toISOString() || null,
        comprobanteUrl: c.evidenceUrl || null,
        notas: c.notes,
      }));
    }

    // El saldo actual refleja la custodia efectiva neta (o el neto transaccional si es global)
    const saldoActual = fiduciary ? fiduciary.fondosNetosDueño : (income - expense);

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
      cotizacionesPendientes: pendingQuotes,
      aportacionesFondos: ownerContributions,
      resumen: {
        saldoActual: { amount: saldoActual, currency: "MXN" },
        ingresosMes: { amount: income, currency: "MXN" },
        egresosMes: { amount: expense, currency: "MXN" },
        fiduciario: fiduciary ? {
          custodiaPmEfectiva: fiduciary.custodiaPmEfectiva,
          depositosGarantiaRetenidos: fiduciary.depositosGarantiaRetenidos,
          fondosNetosDueño: fiduciary.fondosNetosDueño,
          reservaMinima: fiduciary.reservaMinimaContractual,
          reservaConstituida: fiduciary.reservaConstituida,
          reservaFaltante: fiduciary.reservaFaltante,
          compromisosVigentes: fiduciary.compromisosVigentes,
          disponibleNuevasObligaciones: fiduciary.disponibleNuevasObligaciones,
          deficitReal: fiduciary.deficitReal,
          esDeficitario: fiduciary.esDeficitario,
        } : null,
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

export async function getTenantSettings(requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      include: {
        members: {
          include: { user: true }
        },
        addons: true,
      }
    });

    if (!tenant) throw new Error("Organización no encontrada");

    return {
      id: tenant.id,
      name: tenant.name,
      countryCode: tenant.countryCode,
      currency: tenant.currency,
      timezone: tenant.timezone,
      operatingMode: tenant.operatingMode,
      subscriptionPlan: tenant.subscriptionPlan,
      subscriptionStatus: tenant.subscriptionStatus,
      addons: tenant.addons,
      members: tenant.members.map(m => ({
        id: m.id,
        email: m.user.email,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
      })),
      userRole: membership.role,
    };
  });
}

export async function getTenantIntegrations(requestedTenantId?: string) {
  const { tenantId } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const integrations = await tx.tenantIntegration.findMany({
      where: { tenantId }
    });

    return integrations.map(i => ({
      id: i.id,
      provider: i.provider,
      isActive: i.isActive,
      config: i.config,
      updatedAt: i.updatedAt.toISOString(),
    }));
  });
}

/**
 * CUS-09: Bandeja de Atención de Cartera (Portfolio Inbox)
 * Consolida todas las alertas y pendientes accionables sin recorrer propiedad por propiedad:
 * 1. Tareas vencidas o bloqueadas
 * 2. Cotizaciones pendientes de decisión del propietario
 * 3. Órdenes bloqueadas por falta de fondos
 * 4. Aportaciones pendientes de verificación
 * 5. Propiedades sin visita de cuidado reciente (> careVisitIntervalDays)
 */
export async function getPortfolioInboxData(requestedTenantId?: string) {
  const { tenantId, membership } = await getSessionAndTenant(requestedTenantId);

  return withTenantRLS(tenantId, async (tx) => {
    const now = new Date();

    // 1. Tareas vencidas o bloqueadas
    const problematicTasks = await tx.operationalTask.findMany({
      where: {
        tenantId,
        OR: [
          { status: "BLOCKED" },
          { dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } }
        ]
      },
      include: { property: true },
      orderBy: { dueDate: "asc" }
    });

    // 2. Cotizaciones pendientes de aprobación del dueño
    const pendingQuotes = await tx.workOrderQuote.findMany({
      where: {
        tenantId,
        status: "SUBMITTED"
      },
      include: {
        workOrder: {
          include: { property: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    // 3. Aportaciones reportadas pendientes de verificación
    const pendingContributions = await tx.ownerContribution.findMany({
      where: {
        tenantId,
        status: { in: ["REQUESTED", "REPORTED"] }
      },
      include: { property: true },
      orderBy: { requestedAt: "desc" }
    });

    // 4. Propiedades desocupadas o bajo cuidado
    const properties = await tx.property.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        portfolio: true,
        inspections: {
          orderBy: { inspectionDate: "desc" },
          take: 1
        }
      }
    });

    const careOverdueProperties = properties.filter(p => {
      const lastInspection = p.inspections[0]?.inspectionDate || p.lastCareVisitAt;
      if (!lastInspection) return true;
      const daysSince = (now.getTime() - new Date(lastInspection).getTime()) / (1000 * 3600 * 24);
      return daysSince > (p.careVisitIntervalDays || 15);
    });

    return {
      tareasProblema: problematicTasks.map(t => ({
        id: t.id,
        titulo: t.title,
        propiedadId: t.propertyId,
        propiedadNombre: t.property.name,
        estado: t.status,
        prioridad: t.priority,
        fechaLimite: t.dueDate?.toISOString() || null,
        motivoBloqueo: t.blockedReason || null,
        esVencida: t.dueDate ? t.dueDate < now : false,
      })),
      cotizacionesPendientes: pendingQuotes.map(q => ({
        id: q.id,
        version: q.version,
        ordenTitulo: q.workOrder.title,
        propiedadId: q.workOrder.propertyId,
        propiedadNombre: q.workOrder.property.name,
        montoTotal: Number(q.totalCost),
        moneda: q.currency,
        fecha: q.createdAt.toISOString(),
      })),
      aportacionesPendientes: pendingContributions.map(c => ({
        id: c.id,
        propiedadId: c.propertyId,
        propiedadNombre: c.property.name,
        monto: Number(c.amount),
        moneda: c.currency,
        motivo: c.reason,
        estado: c.status,
        solicitadoEn: c.requestedAt.toISOString(),
        comprobanteUrl: c.evidenceUrl || null,
      })),
      propiedadesSinVisitaReciente: careOverdueProperties.map(p => ({
        id: p.id,
        nombre: p.name,
        direccion: p.address,
        cartera: p.portfolio?.name || "General",
        ocupacion: p.occupancyStatus,
        frecuenciaDias: p.careVisitIntervalDays || 15,
        ultimaVisita: p.inspections[0]?.inspectionDate?.toISOString() || null,
      })),
      totalAlertas: problematicTasks.length + pendingQuotes.length + pendingContributions.length + careOverdueProperties.length
    };
  });
}



