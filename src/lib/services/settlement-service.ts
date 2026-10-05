import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';
import { accountingService } from './accounting-service';

export interface CreateManagementAgreementInput {
  tenantId: string;
  propertyId?: string;
  portfolioId?: string;
  commissionType: 'PERCENTAGE_RENT' | 'FIXED_FEE' | 'HYBRID';
  commissionRate?: number; // ej. 0.10 para 10%
  fixedFeeAmount?: number;
  commissionBase?: 'COLLECTED' | 'ACCRUED';
  reserveMinimum?: number;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface CalculateAvailableFundsInput {
  tenantId: string;
  ownerId: string;
  propertyId?: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface AvailableFundsBreakdown {
  grossCollected: Prisma.Decimal;
  directOwnerCollected: Prisma.Decimal;
  pmEscrowCollected: Prisma.Decimal;
  expensesDeducted: Prisma.Decimal;
  commissionDeducted: Prisma.Decimal;
  reserveRetained: Prisma.Decimal;
  securityDepositsHeld: Prisma.Decimal; // Informativo fiduciario, NO distribuible
  alreadySettled: Prisma.Decimal;
  netAvailable: Prisma.Decimal;
}

/**
 * Servicio de Liquidaciones, Comisiones y Disponibilidad Fiduciaria (CUS-02C)
 */
export const settlementService = {
  /**
   * Crea o actualiza un acuerdo de administración para una propiedad
   */
  async createAgreement(input: CreateManagementAgreementInput) {
    return prisma.managementAgreement.create({
      data: {
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        portfolioId: input.portfolioId,
        commissionType: input.commissionType,
        commissionRate: new Prisma.Decimal(input.commissionRate ?? 0.10),
        fixedFeeAmount: input.fixedFeeAmount ? new Prisma.Decimal(input.fixedFeeAmount) : null,
        commissionBase: input.commissionBase || 'COLLECTED',
        reserveMinimum: new Prisma.Decimal(input.reserveMinimum ?? 0),
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo
      }
    });
  },

  /**
   * Calcula con rigor matemático el disponible real para dispersión a un propietario.
   * Regla de Oro:
   * Disponible = Cobros PM Escrow - Gastos Pagados - Comisiones - Reservas - Liquidaciones Previas
   */
  async calculateAvailableFunds(input: CalculateAvailableFundsInput): Promise<AvailableFundsBreakdown> {
    const { tenantId, ownerId, propertyId, periodStart, periodEnd } = input;

    // 1. Obtener propiedades vinculadas al propietario
    const ownerProperties = await prisma.property.findMany({
      where: {
        tenantId,
        ...(propertyId ? { id: propertyId } : {}),
        owners: { some: { userId: ownerId } },
        archivedAt: null
      },
      include: {
        agreements: {
          where: {
            effectiveFrom: { lte: periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }]
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1
        },
        owners: { where: { userId: ownerId } }
      }
    });

    if (ownerProperties.length === 0) {
      return {
        grossCollected: new Prisma.Decimal(0),
        directOwnerCollected: new Prisma.Decimal(0),
        pmEscrowCollected: new Prisma.Decimal(0),
        expensesDeducted: new Prisma.Decimal(0),
        commissionDeducted: new Prisma.Decimal(0),
        reserveRetained: new Prisma.Decimal(0),
        securityDepositsHeld: new Prisma.Decimal(0),
        alreadySettled: new Prisma.Decimal(0),
        netAvailable: new Prisma.Decimal(0)
      };
    }

    let grossCollected = new Prisma.Decimal(0);
    let directOwnerCollected = new Prisma.Decimal(0);
    let pmEscrowCollected = new Prisma.Decimal(0);
    let expensesDeducted = new Prisma.Decimal(0);
    let commissionDeducted = new Prisma.Decimal(0);
    let reserveRetained = new Prisma.Decimal(0);
    let securityDepositsHeld = new Prisma.Decimal(0);

    for (const prop of ownerProperties) {
      const share = new Prisma.Decimal(prop.owners[0]?.ownershipShare || 100).dividedBy(100);
      const agreement = prop.agreements[0];
      const commissionRate = agreement ? new Prisma.Decimal(agreement.commissionRate) : new Prisma.Decimal(0.10);
      const minReserve = agreement ? new Prisma.Decimal(agreement.reserveMinimum) : new Prisma.Decimal(0);

      // A. Pagos aplicados a rentas en este periodo para esta propiedad
      const appliedPayments = await prisma.paymentApplication.findMany({
        where: {
          charge: {
            propertyId: prop.id,
            type: 'RENT',
            dueDate: { gte: periodStart, lte: periodEnd }
          },
          payment: { status: { in: ['CONFIRMED', 'CLEARED'] } }
        },
        include: { payment: true }
      });

      let propCollected = new Prisma.Decimal(0);
      for (const app of appliedPayments) {
        propCollected = propCollected.plus(new Prisma.Decimal(app.amountApplied));
      }

      // Desglose según custodio
      if (prop.fundCustodian === 'DIRECT_OWNER') {
        directOwnerCollected = directOwnerCollected.plus(propCollected.times(share));
      } else {
        pmEscrowCollected = pmEscrowCollected.plus(propCollected.times(share));
      }
      grossCollected = grossCollected.plus(propCollected.times(share));

      // B. Comisiones
      const propCommission = propCollected.times(commissionRate).times(share);
      commissionDeducted = commissionDeducted.plus(propCommission);

      // C. Gastos de Mantenimiento / WorkOrders pagadas
      const workOrders = await prisma.workOrder.findMany({
        where: {
          propertyId: prop.id,
          status: 'COMPLETED',
          updatedAt: { gte: periodStart, lte: periodEnd }
        }
      });

      for (const wo of workOrders) {
        const cost = new Prisma.Decimal(wo.actualCost || wo.estimatedCost || 0);
        expensesDeducted = expensesDeducted.plus(cost.times(share));
      }

      // D. Reservas Operativas Retenidas
      reserveRetained = reserveRetained.plus(minReserve.times(share));

      // E. Depósitos en Garantía (Informativo, NO distribuible)
      const depositCharges = await prisma.charge.findMany({
        where: { propertyId: prop.id, type: 'SECURITY_DEPOSIT' }
      });
      for (const dc of depositCharges) {
        securityDepositsHeld = securityDepositsHeld.plus(new Prisma.Decimal(dc.amountPaid).times(share));
      }
    }

    // F. Liquidaciones previas ya ejecutadas o en borrador
    const settled = await prisma.settlementProposal.findMany({
      where: {
        tenantId,
        ownerId,
        ...(propertyId ? { propertyId } : {}),
        status: { in: ['APPROVED', 'EXECUTED'] },
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd }
      }
    });

    let alreadySettled = new Prisma.Decimal(0);
    for (const s of settled) {
      alreadySettled = alreadySettled.plus(new Prisma.Decimal(s.netPayable));
    }

    // G. CÁLCULO FINAL DE DISPONIBILIDAD
    // Solo los fondos en custodia del PM pueden ser dispersados.
    // Si la custodia es DIRECT_OWNER, pmEscrowCollected es 0 y el disponible en caja del PM es 0.
    const calculatedNet = pmEscrowCollected
      .minus(expensesDeducted)
      .minus(commissionDeducted)
      .minus(reserveRetained)
      .minus(alreadySettled);

    const netAvailable = calculatedNet.greaterThan(0)
      ? calculatedNet.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal(0);

    return {
      grossCollected: grossCollected.toDecimalPlaces(2),
      directOwnerCollected: directOwnerCollected.toDecimalPlaces(2),
      pmEscrowCollected: pmEscrowCollected.toDecimalPlaces(2),
      expensesDeducted: expensesDeducted.toDecimalPlaces(2),
      commissionDeducted: commissionDeducted.toDecimalPlaces(2),
      reserveRetained: reserveRetained.toDecimalPlaces(2),
      securityDepositsHeld: securityDepositsHeld.toDecimalPlaces(2),
      alreadySettled: alreadySettled.toDecimalPlaces(2),
      netAvailable
    };
  },

  /**
   * Genera una propuesta formal de liquidación congelando atómicamente el monto
   */
  async createSettlementProposal(input: {
    tenantId: string;
    ownerId: string;
    propertyId?: string;
    periodStart: Date;
    periodEnd: Date;
    createdById?: string;
  }) {
    const breakdown = await this.calculateAvailableFunds(input);

    if (breakdown.netAvailable.lessThanOrEqualTo(0)) {
      throw new Error("No existen fondos disponibles liquidables en custodia para este periodo.");
    }

    return prisma.$transaction(async (tx) => {
      // Bloqueo contra doble propuesta simultánea para el mismo periodo
      const activeProposal = await tx.settlementProposal.findFirst({
        where: {
          tenantId: input.tenantId,
          ownerId: input.ownerId,
          propertyId: input.propertyId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: { in: ['DRAFT', 'APPROVED'] }
        }
      });

      if (activeProposal) {
        throw new Error("Ya existe una propuesta de liquidación activa para este periodo.");
      }

      const proposal = await tx.settlementProposal.create({
        data: {
          tenantId: input.tenantId,
          ownerId: input.ownerId,
          propertyId: input.propertyId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          grossCollected: breakdown.grossCollected,
          expensesDeducted: breakdown.expensesDeducted,
          commissionDeducted: breakdown.commissionDeducted,
          reserveRetained: breakdown.reserveRetained,
          netPayable: breakdown.netAvailable,
          currency: 'MXN',
          status: 'DRAFT'
        }
      });

      return proposal;
    });
  },

  /**
   * Aprueba y ejecuta la propuesta de liquidación (asienta el egreso contable de dispersión)
   */
  async executeSettlement(proposalId: string, approvedById: string, paymentReference: string) {
    const proposal = await prisma.settlementProposal.findUniqueOrThrow({
      where: { id: proposalId }
    });

    if (proposal.status === 'EXECUTED') {
      return proposal;
    }

    const accounts = await accountingService.ensureStandardChartOfAccounts(proposal.tenantId);
    const idempotencyKey = `SETTLEMENT_EXEC_${proposal.id}`;

    return prisma.$transaction(async (tx) => {
      // 1. Actualizar estado de la propuesta
      const updated = await tx.settlementProposal.update({
        where: { id: proposal.id },
        data: {
          status: 'EXECUTED',
          approvedById,
          executedAt: new Date()
        }
      });

      // 2. Asiento contable de dispersión bancaria
      // Débito a Owner Funds Payable (cancela la deuda con el dueño) vs Crédito a Banco PM Escrow
      await tx.journalEntry.create({
        data: {
          tenantId: proposal.tenantId,
          idempotencyKey,
          effectiveDate: new Date(),
          description: `Dispersión Liquidación Propietario [Ref: ${paymentReference}]`,
          createdById: approvedById,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: accounts.ownerFundsPayable,
                debit: proposal.netPayable,
                credit: 0,
                currency: proposal.currency,
                propertyId: proposal.propertyId,
                ownerId: proposal.ownerId
              },
              {
                accountId: accounts.cashPmEscrow,
                debit: 0,
                credit: proposal.netPayable,
                currency: proposal.currency,
                propertyId: proposal.propertyId,
                ownerId: proposal.ownerId
              }
            ]
          }
        }
      });

      return updated;
    });
  }
};
