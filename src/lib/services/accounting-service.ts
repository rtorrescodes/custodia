import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';

export interface CreateJournalLineInput {
  accountId: string;
  debit: number | Prisma.Decimal;
  credit: number | Prisma.Decimal;
  currency?: string;
  propertyId?: string;
  leaseId?: string;
  ownerId?: string;
}

export interface CreateJournalEntryInput {
  tenantId: string;
  idempotencyKey: string;
  effectiveDate: Date;
  description: string;
  createdById?: string;
  lines: CreateJournalLineInput[];
}

export interface StandardAccounts {
  cashPmEscrow: string;
  cashDirectOwner: string;
  accountsReceivableRenter: string;
  securityDepositsLiability: string;
  ownerFundsPayable: string;
  pmCommissionRevenue: string;
  maintenanceExpense: string;
}

/**
 * Servicio de Contabilidad de Partida Doble (Double-Entry Bookkeeping)
 * Garantiza la invariante Σ Debits = Σ Credits y la inmutabilidad de asientos.
 */
export const accountingService = {
  /**
   * Obtiene o inicializa el plan de cuentas estándar para el tenant
   */
  async ensureStandardChartOfAccounts(tenantId: string, client?: any): Promise<StandardAccounts> {
    const db = client || prisma;
    const defaultAccounts = [
      { code: '1000_CASH_PM_ESCROW', name: 'Caja y Bancos (Custodia PM)', type: 'ASSET' as const },
      { code: '1010_CASH_DIRECT_OWNER', name: 'Cobranza Directa Propietario (Informativa)', type: 'ASSET' as const },
      { code: '1100_AR_RENTER', name: 'Cuentas por Cobrar Inquilinos', type: 'ASSET' as const },
      { code: '2000_SECURITY_DEPOSITS', name: 'Depósitos en Garantía (Custodia)', type: 'LIABILITY' as const },
      { code: '2100_OWNER_FUNDS_PAYABLE', name: 'Fondos por Liquidar a Propietarios', type: 'LIABILITY' as const },
      { code: '4000_COMMISSION_REVENUE', name: 'Ingresos por Honorarios PM', type: 'REVENUE' as const },
      { code: '5000_MAINTENANCE_EXPENSE', name: 'Gastos de Mantenimiento', type: 'EXPENSE' as const },
    ];

    const defaultCodes = defaultAccounts.map(a => a.code);
    const existing = await db.ledgerAccount.findMany({
      where: { tenantId, code: { in: defaultCodes } }
    });

    const accountsMap: Record<string, string> = {};
    for (const acc of existing) {
      accountsMap[acc.code] = acc.id;
    }

    // Only create accounts that are missing
    for (const acc of defaultAccounts) {
      if (!accountsMap[acc.code]) {
        const record = await db.ledgerAccount.create({
          data: {
            tenantId,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            currency: 'MXN'
          }
        });
        accountsMap[acc.code] = record.id;
      }
    }

    return {
      cashPmEscrow: accountsMap['1000_CASH_PM_ESCROW'],
      cashDirectOwner: accountsMap['1010_CASH_DIRECT_OWNER'],
      accountsReceivableRenter: accountsMap['1100_AR_RENTER'],
      securityDepositsLiability: accountsMap['2000_SECURITY_DEPOSITS'],
      ownerFundsPayable: accountsMap['2100_OWNER_FUNDS_PAYABLE'],
      pmCommissionRevenue: accountsMap['4000_COMMISSION_REVENUE'],
      maintenanceExpense: accountsMap['5000_MAINTENANCE_EXPENSE'],
    };
  },

  /**
   * Registra un asiento contable de forma atómica.
   * Valida estrictamente que la suma de débitos sea idéntica a la suma de créditos.
   */
  async postEntry(input: CreateJournalEntryInput, client?: any) {
    if (!input.lines || input.lines.length < 2) {
      throw new Error("Un asiento contable requiere al menos 2 líneas de movimiento.");
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const line of input.lines) {
      const d = new Prisma.Decimal(line.debit || 0);
      const c = new Prisma.Decimal(line.credit || 0);
      if (d.lessThan(0) || c.lessThan(0)) {
        throw new Error("Los importes de débito y crédito deben ser positivos.");
      }
      totalDebit = totalDebit.plus(d);
      totalCredit = totalCredit.plus(c);
    }

    // Comprobación de balance estricto
    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `ASIENTO DESBALANCEADO: Total Débito (${totalDebit}) no coincide con Total Crédito (${totalCredit}).`
      );
    }

    // Ejecución atómica en base de datos
    const run = async (tx: any) => {
      // Verificar si ya existe por idempotencia
      const existing = await tx.journalEntry.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey
          }
        },
        include: { lines: true }
      });

      if (existing) {
        return existing;
      }

      const entry = await tx.journalEntry.create({
        data: {
          tenantId: input.tenantId,
          idempotencyKey: input.idempotencyKey,
          effectiveDate: input.effectiveDate,
          description: input.description,
          createdById: input.createdById,
          status: 'POSTED',
          lines: {
            create: input.lines.map(line => ({
              accountId: line.accountId,
              debit: new Prisma.Decimal(line.debit || 0),
              credit: new Prisma.Decimal(line.credit || 0),
              currency: line.currency || 'MXN',
              propertyId: line.propertyId,
              leaseId: line.leaseId,
              ownerId: line.ownerId,
            }))
          }
        },
        include: { lines: true }
      });

      return entry;
    };

    if (client) {
      return run(client);
    }
    return prisma.$transaction(run);
  },

  /**
   * Revierte un asiento existente mediante un contra-asiento trazable (Inmutabilidad)
   */
  async reverseEntry(tenantId: string, entryId: string, reason: string, createdById?: string) {
    return prisma.$transaction(async (tx) => {
      const original = await tx.journalEntry.findFirst({
        where: { id: entryId, tenantId },
        include: { lines: true }
      });

      if (!original) {
        throw new Error("Asiento no encontrado en este tenant.");
      }

      if (original.status === 'REVERSED') {
        throw new Error("El asiento ya ha sido revertido previamente.");
      }

      // Crear contra-asiento (invirtiendo débitos y créditos)
      const reversalIdempotency = `REVERSAL_${original.idempotencyKey}`;
      const reversalEntry = await tx.journalEntry.create({
        data: {
          tenantId,
          idempotencyKey: reversalIdempotency,
          effectiveDate: new Date(),
          description: `REVERSO [${original.description}]: ${reason}`,
          createdById,
          status: 'POSTED',
          lines: {
            create: original.lines.map(l => ({
              accountId: l.accountId,
              debit: l.credit, // Inversión exacta
              credit: l.debit, // Inversión exacta
              currency: l.currency,
              propertyId: l.propertyId,
              leaseId: l.leaseId,
              ownerId: l.ownerId,
            }))
          }
        }
      });

      // Marcar el original como revertido con puntero al nuevo
      await tx.journalEntry.update({
        where: { id: original.id },
        data: {
          status: 'REVERSED',
          reversedById: reversalEntry.id
        }
      });

      return reversalEntry;
    });
  },

  /**
   * Obtiene el balance acumulado de una cuenta por dimensiones (propiedad, contrato, propietario)
   */
  async getAccountBalance(
    tenantId: string,
    accountId: string,
    dimensionFilter?: { propertyId?: string; ownerId?: string; leaseId?: string },
    client?: any
  ) {
    const db = client || prisma;
    const lines = await db.journalLine.findMany({
      where: {
        accountId,
        entry: { tenantId, status: 'POSTED' },
        ...(dimensionFilter?.propertyId ? { propertyId: dimensionFilter.propertyId } : {}),
        ...(dimensionFilter?.ownerId ? { ownerId: dimensionFilter.ownerId } : {}),
        ...(dimensionFilter?.leaseId ? { leaseId: dimensionFilter.leaseId } : {})
      },
      include: { account: true }
    });

    let balance = new Prisma.Decimal(0);
    const accountType = lines[0]?.account.type || 'ASSET';

    for (const line of lines) {
      if (accountType === 'ASSET' || accountType === 'EXPENSE') {
        balance = balance.plus(line.debit).minus(line.credit);
      } else {
        balance = balance.plus(line.credit).minus(line.debit);
      }
    }

    return balance;
  },

  /**
   * CUS-09B: Resumen Fiduciario de la Propiedad (Unificación con Motor Contable)
   * Reutiliza el ledger de partida doble y las tablas operativas para calcular:
   * 1. Fondos efectivamente recibidos bajo custodia (PM_ESCROW)
   * 2. Fondos bajo cobranza directa del propietario (DIRECT_OWNER)
   * 3. Depósitos en garantía en custodia (Pasivo no disponible para gasto operativo)
   * 4. Saldo a favor o en contra del propietario (neto contable)
   * 5. Compromisos operativos vigentes (WorkOrders aprobadas/en curso pendientes de pago)
   * 6. Reserva mínima contractual obligatoria
   * 7. Disponible real para nuevas obligaciones (mostrando déficit negativo si existe)
   */
  async getPropertyFiduciarySummary(tenantId: string, propertyId: string, client?: any) {
    const db = client || prisma;
    const accounts = await this.ensureStandardChartOfAccounts(tenantId, db);

    // 1, 2, 3: Consulta en lote de líneas de diario para las 3 cuentas operativas de la propiedad
    const targetAccountIds = [accounts.cashPmEscrow, accounts.cashDirectOwner, accounts.securityDepositsLiability];
    const journalLines = await db.journalLine.findMany({
      where: {
        accountId: { in: targetAccountIds },
        propertyId,
        entry: { tenantId, status: 'POSTED' }
      },
      include: { account: true }
    });

    const calcBalance = (accId: string, accType: string) => {
      let b = new Prisma.Decimal(0);
      for (const l of journalLines) {
        if (l.accountId === accId) {
          if (accType === 'ASSET' || accType === 'EXPENSE') {
            b = b.plus(l.debit).minus(l.credit);
          } else {
            b = b.plus(l.credit).minus(l.debit);
          }
        }
      }
      return b;
    };

    const pmEscrowBalance = calcBalance(accounts.cashPmEscrow, 'ASSET');
    const directOwnerBalance = calcBalance(accounts.cashDirectOwner, 'ASSET');
    const securityDepositsHeld = calcBalance(accounts.securityDepositsLiability, 'LIABILITY');

    // 4. Compromisos operativos vigentes (Órdenes aprobadas o en curso no completadas: estimado menos lo ya pagado)
    const committedOrders = await db.workOrder.findMany({
      where: {
        propertyId,
        tenantId,
        status: { in: ['AWAITING_APPROVAL', 'IN_PROGRESS'] }
      },
      select: { id: true, estimatedCost: true, actualCost: true }
    });
    // El compromiso real pendiente es estimatedCost menos lo pagado acumulado (actualCost)
    const committedAmount = committedOrders.reduce((sum: number, o: any) => {
      const est = Number(o.estimatedCost || 0);
      const act = Number(o.actualCost || 0);
      return sum + Math.max(0, est - act);
    }, 0);

    // 4B. Propuestas de liquidación activas (DRAFT o APPROVED) congeladas
    const activeSettlements = await db.settlementProposal.findMany({
      where: {
        propertyId,
        tenantId,
        status: { in: ['DRAFT', 'APPROVED'] }
      },
      select: { netPayable: true }
    });
    const activeSettlementAmount = activeSettlements.reduce((sum: number, s: any) => sum + Number(s.netPayable || 0), 0);

    // 5. Acuerdo de gestión y reserva mínima contractual
    const agreement = await db.managementAgreement.findFirst({
      where: { tenantId, propertyId },
      orderBy: { effectiveFrom: 'desc' }
    });

    const reserveMinimum = agreement?.reserveMinimum ? Number(agreement.reserveMinimum) : 0;
    const pmExpenseLimit = agreement?.pmExpenseLimit !== null && agreement?.pmExpenseLimit !== undefined
      ? Number(agreement.pmExpenseLimit)
      : null; // null = Sin configurar formalmente

    // Saldo neto del propietario bajo custodia PM (restando pasivo de depósitos en garantía)
    const netOwnerEscrowFunds = Number(pmEscrowBalance) - Number(securityDepositsHeld);

    // Fondos disponibles antes de separar la reserva (no pueden ser negativos para constituir reserva)
    const liquidFundsForReserve = Math.max(0, netOwnerEscrowFunds);
    // Reserva efectivamente constituida con el efectivo real disponible
    const reserveConstituida = Math.min(reserveMinimum, liquidFundsForReserve);
    // Faltante para completar la reserva mínima requerida
    const reserveFaltante = Math.max(0, reserveMinimum - reserveConstituida);

    // Total de compromisos vigentes
    const totalCommitted = committedAmount + activeSettlementAmount;

    // Disponible para nuevas obligaciones operativas:
    // Efectivo neto real MENOS la reserva efectivamente constituida MENOS compromisos.
    // Solo puede ser menor a 0 si los compromisos u obligaciones exceden el efectivo real disponible (déficit real).
    const availableForExpenses = Math.max(0, netOwnerEscrowFunds - reserveConstituida - totalCommitted);
    // Déficit real de fondos (deuda o compromisos en descubierto)
    const realDeficit = (netOwnerEscrowFunds - totalCommitted) < 0 ? Math.abs(netOwnerEscrowFunds - totalCommitted) : 0;

    return {
      custodiaPmEfectiva: Number(pmEscrowBalance),
      cobranzaDirectaDueño: Number(directOwnerBalance),
      depositosGarantiaRetenidos: Number(securityDepositsHeld),
      fondosNetosDueño: netOwnerEscrowFunds,
      reservaMinimaContractual: reserveMinimum,
      reservaConstituida: reserveConstituida,
      reservaFaltante: reserveFaltante,
      compromisosVigentes: committedAmount,
      liquidacionesActivas: activeSettlementAmount,
      compromisosTotales: totalCommitted,
      disponibleNuevasObligaciones: availableForExpenses,
      deficitReal: realDeficit,
      esDeficitario: realDeficit > 0,
      politicaGastoPM: {
        limiteAutorizado: pmExpenseLimit,
        estaConfigurado: pmExpenseLimit !== null,
        moneda: agreement?.pmExpenseCurrency || "MXN",
        categoriasAutoAprobadas: agreement?.autoApproveCategories || [],
        reglaEmergencia: agreement?.emergencyRule || null,
        configuradoEn: agreement?.configuredAt ? agreement.configuredAt.toISOString() : null,
      }
    };
  }
};
