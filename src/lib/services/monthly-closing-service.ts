import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';

export interface ExecuteMonthlyClosingInput {
  tenantId: string;
  year: number;
  month: number;
  currency?: string;
  closedById: string;
}

export interface ReopenMonthlyClosingInput {
  tenantId: string;
  year: number;
  month: number;
  currency?: string;
  reopenedById: string;
  reason: string;
}

/**
 * Servicio de Cierre Mensual, Conciliación de Fondos y Auditoría Fiduciaria (CUS-07A)
 * - Congela las operaciones de un periodo fiscal y genera el balance snapshot inmutable.
 * - Detecta discrepancias no resueltas (cargos sin pago, líneas bancarias no conciliadas).
 * - Permite reapertura justificada y auditada sin borrar la historia previa.
 */
export const monthlyClosingService = {
  /**
   * Ejecuta el cierre mensual auditado
   */
  async executeMonthlyClosing(input: ExecuteMonthlyClosingInput) {
    const currency = input.currency || 'MXN';

    return prisma.$transaction(async (tx) => {
      // 1. Verificar si el periodo ya está cerrado
      const existing = await tx.monthlyClosing.findUnique({
        where: {
          tenantId_periodYear_periodMonth_currency: {
            tenantId: input.tenantId,
            periodYear: input.year,
            periodMonth: input.month,
            currency,
          },
        },
      });

      if (existing && existing.status === 'CLOSED') {
        throw new Error(`El periodo ${input.month}/${input.year} ya se encuentra cerrado.`);
      }

      // 2. Calcular agregaciones del periodo
      const charges = await tx.charge.findMany({
        where: {
          tenantId: input.tenantId,
          periodYear: input.year,
          periodMonth: input.month,
          currency,
        },
      });

      const totalCharged = charges.reduce((acc, c) => acc + Number(c.amount), 0);
      const totalCollected = charges.reduce((acc, c) => acc + Number(c.amountPaid), 0);
      const pendingAr = totalCharged - totalCollected;

      // Gastos del periodo en Ledger
      const startDate = new Date(Date.UTC(input.year, input.month - 1, 1));
      const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59));

      const expenses = await tx.transaction.findMany({
        where: {
          tenantId: input.tenantId,
          type: 'EXPENSE',
          currency,
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      const totalExpenses = expenses.reduce((acc, e) => acc + Number(e.amount), 0);

      // Comprobar líneas bancarias sin conciliar
      const unmatchedLines = await tx.bankStatementLine.count({
        where: {
          statement: { tenantId: input.tenantId },
          operationDate: { gte: startDate, lte: endDate },
          status: 'UNMATCHED',
        },
      });

      const discrepanciesCount = unmatchedLines;

      const summarySnapshot = {
        period: `${input.month}/${input.year}`,
        currency,
        totalCharged,
        totalCollected,
        pendingAr,
        totalExpenses,
        netDistributable: Math.max(0, totalCollected - totalExpenses),
        unmatchedBankLines: unmatchedLines,
        closedAt: new Date().toISOString(),
      };

      const closing = await tx.monthlyClosing.upsert({
        where: {
          tenantId_periodYear_periodMonth_currency: {
            tenantId: input.tenantId,
            periodYear: input.year,
            periodMonth: input.month,
            currency,
          },
        },
        update: {
          status: 'CLOSED',
          closedById: input.closedById,
          closedAt: new Date(),
          summarySnapshot,
          discrepanciesCount,
        },
        create: {
          tenantId: input.tenantId,
          periodYear: input.year,
          periodMonth: input.month,
          currency,
          status: 'CLOSED',
          closedById: input.closedById,
          closedAt: new Date(),
          summarySnapshot,
          discrepanciesCount,
        },
      });

      return closing;
    });
  },

  /**
   * Reabre un periodo cerrado con justificación obligatoria
   */
  async reopenMonthlyClosing(input: ReopenMonthlyClosingInput) {
    const currency = input.currency || 'MXN';

    if (!input.reason || input.reason.trim().length < 5) {
      throw new Error('Se requiere un motivo explícito para reabrir un periodo contable cerrado.');
    }

    return prisma.monthlyClosing.update({
      where: {
        tenantId_periodYear_periodMonth_currency: {
          tenantId: input.tenantId,
          periodYear: input.year,
          periodMonth: input.month,
          currency,
        },
      },
      data: {
        status: 'REOPENED',
        reopenedById: input.reopenedById,
        reopenedAt: new Date(),
        reopenReason: input.reason,
      },
    });
  },

  /**
   * Verifica si un periodo está cerrado para bloquear modificaciones
   */
  async isPeriodClosed(tenantId: string, year: number, month: number, currency: string = 'MXN'): Promise<boolean> {
    const closing = await prisma.monthlyClosing.findUnique({
      where: {
        tenantId_periodYear_periodMonth_currency: {
          tenantId,
          periodYear: year,
          periodMonth: month,
          currency,
        },
      },
    });

    return closing?.status === 'CLOSED';
  },
};
