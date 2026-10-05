import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';

export interface BankStatementItem {
  reference: string;
  amount: number | Prisma.Decimal;
  currency: string;
  transactionDate: Date;
  description: string;
}

export interface ReconciliationResult {
  statementTotal: Prisma.Decimal;
  matchedPaymentsTotal: Prisma.Decimal;
  unmatchedBankItemsCount: number;
  unreconciledSystemPaymentsCount: number;
  adjustedBankBalance: Prisma.Decimal;
  isBalanced: boolean;
}

/**
 * Servicio de Conciliación Bancaria y Cierre de Periodos (CUS-02C)
 */
export const reconciliationService = {
  /**
   * Concilia un extracto bancario sintético contra pagos registrados en sistema
   */
  async reconcileBankStatement(
    tenantId: string,
    statementItems: BankStatementItem[]
  ): Promise<ReconciliationResult> {
    let statementTotal = new Prisma.Decimal(0);
    let matchedPaymentsTotal = new Prisma.Decimal(0);
    let unmatchedCount = 0;

    for (const item of statementItems) {
      const itemAmount = new Prisma.Decimal(item.amount);
      statementTotal = statementTotal.plus(itemAmount);

      // Buscar pago en sistema que coincida con la referencia y monto
      const match = await prisma.payment.findFirst({
        where: {
          tenantId,
          reference: item.reference,
          amount: itemAmount,
          status: { in: ['CONFIRMED', 'REPORTED'] }
        }
      });

      if (match) {
        matchedPaymentsTotal = matchedPaymentsTotal.plus(itemAmount);
        // Marcar pago como CLEARED (conciliado en banco)
        await prisma.payment.update({
          where: { id: match.id },
          data: { status: 'CLEARED' }
        });
      } else {
        unmatchedCount++;
      }
    }

    // Pagos en sistema aún sin conciliar
    const unreconciledSystem = await prisma.payment.count({
      where: {
        tenantId,
        status: { in: ['CONFIRMED', 'REPORTED'] }
      }
    });

    const isBalanced = statementTotal.equals(matchedPaymentsTotal) && unmatchedCount === 0;

    return {
      statementTotal,
      matchedPaymentsTotal,
      unmatchedBankItemsCount: unmatchedCount,
      unreconciledSystemPaymentsCount: unreconciledSystem,
      adjustedBankBalance: matchedPaymentsTotal,
      isBalanced
    };
  }
};
