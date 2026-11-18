import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';
import { accountingService } from './accounting-service';

export interface GenerateRentChargesInput {
  tenantId: string;
  month: number;
  year: number;
  createdById?: string;
}

export interface ProratedRentInput {
  leaseId: string;
  month: number;
  year: number;
  daysOccupied: number;
  totalDaysInMonth: number;
  createdById?: string;
}

/**
 * Servicio de Obligaciones y Cargos Periódicos (CUS-02A)
 * Genera rentas periódicas con clave de idempotencia contractual y prorrateo auditable.
 */
export const chargeService = {
  /**
   * Generación periódica idempotente de rentas para contratos activos
   */
  async generateMonthlyRentCharges(input: GenerateRentChargesInput) {
    const { tenantId, month, year, createdById } = input;
    const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId);

    // Obtener contratos activos para este tenant
    const activeLeases = await prisma.lease.findMany({
      where: {
        tenantId,
        status: 'ACTIVE'
      },
      include: {
        property: true
      }
    });

    const generatedCharges = [];

    for (const lease of activeLeases) {
      // Verificar vigencia del contrato en este periodo
      const periodDate = new Date(Date.UTC(year, month - 1, lease.paymentDay || 1));
      if (periodDate < lease.startDate || periodDate > lease.endDate) {
        continue;
      }

      const rentAmount = new Prisma.Decimal(lease.rentAmount);
      const idempotencyKey = `RENT_${lease.id}_${year}_${month}`;

      // Crear cargo de forma atómica e idempotente
      const charge = await prisma.$transaction(async (tx) => {
        // Verificar si ya existe cargo para este contrato y periodo
        const existing = await tx.charge.findUnique({
          where: {
            leaseId_periodYear_periodMonth_type: {
              leaseId: lease.id,
              periodYear: year,
              periodMonth: month,
              type: 'RENT'
            }
          }
        });

        if (existing) {
          return existing;
        }

        // 1. Crear registro de obligación
        const newCharge = await tx.charge.create({
          data: {
            tenantId,
            leaseId: lease.id,
            propertyId: lease.propertyId,
            concept: `Renta correspondiente a ${month}/${year}`,
            type: 'RENT',
            amount: rentAmount,
            currency: lease.currency,
            dueDate: periodDate,
            periodMonth: month,
            periodYear: year,
            status: 'PENDING'
          }
        });

        // 2. Registrar asiento contable del devengo (AR Renter Débito vs Owner Funds Payable / Revenue Crédito)
        await tx.journalEntry.create({
          data: {
            tenantId,
            idempotencyKey,
            effectiveDate: periodDate,
            description: `Devengo de Renta ${month}/${year} - Contrato ${lease.id}`,
            createdById,
            status: 'POSTED',
            lines: {
              create: [
                {
                  accountId: accounts.accountsReceivableRenter,
                  debit: rentAmount,
                  credit: 0,
                  currency: lease.currency,
                  propertyId: lease.propertyId,
                  leaseId: lease.id
                },
                {
                  accountId: accounts.ownerFundsPayable,
                  debit: 0,
                  credit: rentAmount,
                  currency: lease.currency,
                  propertyId: lease.propertyId,
                  leaseId: lease.id
                }
              ]
            }
          }
        });

        return newCharge;
      });

      generatedCharges.push(charge);
    }

    return generatedCharges;
  },

  /**
   * Crea un cargo prorrateado por días efectivos de ocupación
   */
  async createProratedRentCharge(input: ProratedRentInput) {
    const { leaseId, month, year, daysOccupied, totalDaysInMonth, createdById } = input;
    const lease = await prisma.lease.findUniqueOrThrow({
      where: { id: leaseId },
      include: { property: true }
    });

    const fullRent = new Prisma.Decimal(lease.rentAmount);
    // Prorrateo exacto: (Renta / Total Días) * Días Ocupados
    const proratedAmount = fullRent
      .dividedBy(totalDaysInMonth)
      .times(daysOccupied)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const idempotencyKey = `PRORATED_RENT_${lease.id}_${year}_${month}`;
    const periodDate = new Date(Date.UTC(year, month - 1, 1));
    const accounts = await accountingService.ensureStandardChartOfAccounts(lease.tenantId);

    return prisma.$transaction(async (tx) => {
      const charge = await tx.charge.create({
        data: {
          tenantId: lease.tenantId,
          leaseId: lease.id,
          propertyId: lease.propertyId,
          concept: `Renta prorrateada (${daysOccupied}/${totalDaysInMonth} días) ${month}/${year}`,
          type: 'RENT',
          amount: proratedAmount,
          currency: lease.currency,
          dueDate: periodDate,
          periodMonth: month,
          periodYear: year,
          status: 'PENDING'
        }
      });

      await tx.journalEntry.create({
        data: {
          tenantId: lease.tenantId,
          idempotencyKey,
          effectiveDate: periodDate,
          description: `Devengo Renta Prorrateada ${daysOccupied} días - ${month}/${year}`,
          createdById,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: accounts.accountsReceivableRenter,
                debit: proratedAmount,
                credit: 0,
                currency: lease.currency,
                propertyId: lease.propertyId,
                leaseId: lease.id
              },
              {
                accountId: accounts.ownerFundsPayable,
                debit: 0,
                credit: proratedAmount,
                currency: lease.currency,
                propertyId: lease.propertyId,
                leaseId: lease.id
              }
            ]
          }
        }
      });

      return charge;
    });
  },

  /**
   * Aplica un descuento o nota de crédito trazable a un cargo existente
   */
  async applyCreditNote(chargeId: string, discountAmount: number | Prisma.Decimal, reason: string, createdById?: string) {
    const charge = await prisma.charge.findUniqueOrThrow({
      where: { id: chargeId },
      include: { lease: true }
    });

    const discount = new Prisma.Decimal(discountAmount);
    if (discount.lessThanOrEqualTo(0)) {
      throw new Error("El monto de la nota de crédito debe ser positivo.");
    }

    if (discount.greaterThan(charge.amount)) {
      throw new Error("El descuento no puede superar el monto de la obligación.");
    }

    const accounts = await accountingService.ensureStandardChartOfAccounts(charge.tenantId);
    const idempotencyKey = `CREDIT_NOTE_${charge.id}_${Date.now()}`;

    return prisma.$transaction(async (tx) => {
      // 1. Ajustar el cargo
      const newAmount = new Prisma.Decimal(charge.amount).minus(discount);
      const updatedCharge = await tx.charge.update({
        where: { id: chargeId },
        data: {
          amount: newAmount,
          status: newAmount.equals(0) ? 'CANCELLED' : charge.status
        }
      });

      // 2. Asiento contable de contra-crédito
      await tx.journalEntry.create({
        data: {
          tenantId: charge.tenantId,
          idempotencyKey,
          effectiveDate: new Date(),
          description: `Nota de Crédito a Cargo ${charge.concept}: ${reason}`,
          createdById,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: accounts.ownerFundsPayable,
                debit: discount, // Disminuye pasivo con dueño
                credit: 0,
                currency: charge.currency,
                propertyId: charge.propertyId,
                leaseId: charge.leaseId
              },
              {
                accountId: accounts.accountsReceivableRenter,
                debit: 0,
                credit: discount, // Disminuye cuenta por cobrar del inquilino
                currency: charge.currency,
                propertyId: charge.propertyId,
                leaseId: charge.leaseId
              }
            ]
          }
        }
      });

      return updatedCharge;
    });
  },

  /**
   * CUS-10: Evalúa cargos de renta vencidos y aplica recargos por mora (LATE_FEE)
   * respetando los días de gracia y reglas estipuladas en el contrato de arrendamiento.
   */
  async evaluateAndApplyLateFees(input: {
    tenantId: string;
    referenceDate?: Date;
    createdById?: string;
  }) {
    const { tenantId, referenceDate = new Date(), createdById } = input;
    const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId);

    // Buscar cargos de tipo RENT que estén en status PENDING o PARTIALLY_PAID
    const unpaidRentCharges = await prisma.charge.findMany({
      where: {
        tenantId,
        type: 'RENT',
        status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      },
      include: {
        lease: true,
        property: true,
      }
    });

    const createdLateFees = [];

    for (const charge of unpaidRentCharges) {
      const lease = charge.lease;
      if (!lease) continue;

      // Calcular días transcurridos desde el dueDate
      const dueDate = new Date(charge.dueDate);
      const graceDays = lease.gracePeriodDays ?? 5;
      const graceDeadline = new Date(dueDate.getTime() + graceDays * 24 * 60 * 60 * 1000);

      // Si aún no vence el periodo de gracia, no aplica mora
      if (referenceDate <= graceDeadline) {
        continue;
      }

      // Determinar monto de la mora
      let feeAmount = new Prisma.Decimal(0);
      if (lease.lateFeeFixedAmount && Number(lease.lateFeeFixedAmount) > 0) {
        feeAmount = new Prisma.Decimal(lease.lateFeeFixedAmount);
      } else if (lease.lateFeePercentage && Number(lease.lateFeePercentage) > 0) {
        // Porcentaje sobre el saldo insoluto o renta base
        const unpaidAmount = new Prisma.Decimal(charge.amount).minus(charge.amountPaid);
        feeAmount = unpaidAmount
          .times(new Prisma.Decimal(lease.lateFeePercentage))
          .dividedBy(100)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      } else {
        // Si el contrato no tiene estipulado recargo, no se genera mora
        continue;
      }

      if (feeAmount.lessThanOrEqualTo(0)) continue;

      // Clave de idempotencia única para este recargo de mora en este periodo
      const idempotencyKey = `LATE_FEE_${charge.id}_${charge.periodYear}_${charge.periodMonth}`;

      const appliedFee = await prisma.$transaction(async (tx) => {
        // Verificar si ya existe el cargo de mora para este cargo de renta
        const existing = await tx.charge.findFirst({
          where: {
            tenantId,
            leaseId: lease.id,
            periodYear: charge.periodYear,
            periodMonth: charge.periodMonth,
            type: 'LATE_FEE',
          }
        });

        if (existing) {
          return null; // Ya fue aplicado previamente
        }

        // 1. Crear el cargo de mora
        const newLateCharge = await tx.charge.create({
          data: {
            tenantId,
            leaseId: lease.id,
            propertyId: lease.propertyId,
            concept: `Recargo por mora - Renta ${charge.periodMonth}/${charge.periodYear} (Vencida tras ${graceDays} días de gracia)`,
            type: 'LATE_FEE',
            amount: feeAmount,
            currency: charge.currency,
            dueDate: referenceDate,
            periodMonth: charge.periodMonth,
            periodYear: charge.periodYear,
            status: 'PENDING',
          }
        });

        // 2. Asiento contable de devengo de mora
        await tx.journalEntry.create({
          data: {
            tenantId,
            idempotencyKey,
            effectiveDate: referenceDate,
            description: `Devengo de Mora - Contrato ${lease.id} (${charge.periodMonth}/${charge.periodYear})`,
            createdById,
            status: 'POSTED',
            lines: {
              create: [
                {
                  accountId: accounts.accountsReceivableRenter,
                  debit: feeAmount,
                  credit: 0,
                  currency: charge.currency,
                  propertyId: lease.propertyId,
                  leaseId: lease.id,
                },
                {
                  accountId: accounts.ownerFundsPayable,
                  debit: 0,
                  credit: feeAmount,
                  currency: charge.currency,
                  propertyId: lease.propertyId,
                  leaseId: lease.id,
                }
              ]
            }
          }
        });

        return newLateCharge;
      });

      if (appliedFee) {
        createdLateFees.push(appliedFee);
      }
    }

    return createdLateFees;
  }
};
