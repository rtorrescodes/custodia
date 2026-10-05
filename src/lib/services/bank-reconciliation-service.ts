import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';
import { paymentService } from './payment-service';

export interface BankStatementRowInput {
  operationDate: string | Date;
  reference?: string;
  concept: string;
  amount: number;
}

export interface ImportStatementInput {
  tenantId: string;
  bankName: string;
  accountNum?: string;
  filename: string;
  importedById?: string;
  rows: BankStatementRowInput[];
}

export interface MatchProposal {
  lineId: string;
  paymentId: string;
  confidence: number;
  reason: string;
}

/**
 * Servicio de Conciliación Bancaria y Estados de Cuenta (CUS-03C)
 * - Importación de extractos bancarios (CSV sintético / real).
 * - Propuestas automáticas de conciliación por monto, fecha y referencia.
 * - Confirmación manual auditada que previene duplicidades.
 */
export const bankReconciliationService = {
  /**
   * Importa un extracto bancario con sus líneas
   */
  async importStatement(input: ImportStatementInput) {
    return prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: {
          tenantId: input.tenantId,
          bankName: input.bankName,
          accountNum: input.accountNum,
          filename: input.filename,
          totalRows: input.rows.length,
          importedById: input.importedById,
        },
      });

      const lineData = input.rows.map((row, index) => ({
        statementId: statement.id,
        rowNumber: index + 1,
        operationDate: new Date(row.operationDate),
        reference: row.reference,
        concept: row.concept,
        amount: new Prisma.Decimal(row.amount),
        status: 'UNMATCHED' as const,
      }));

      await tx.bankStatementLine.createMany({
        data: lineData,
      });

      return statement;
    });
  },

  /**
   * Genera propuestas de emparejamiento (Fuzzy/Exact Matching) entre líneas bancarias no conciliadas
   * y pagos reportados o confirmados en el sistema.
   */
  async proposeMatches(tenantId: string, statementId: string): Promise<MatchProposal[]> {
    const lines = await prisma.bankStatementLine.findMany({
      where: {
        statementId,
        status: 'UNMATCHED',
      },
    });

    // Buscar pagos que no estén ya asociados a una línea conciliada
    const matchedLinePaymentIds = (
      await prisma.bankStatementLine.findMany({
        where: { statement: { tenantId }, status: 'MATCHED', matchedPaymentId: { not: null } },
        select: { matchedPaymentId: true },
      })
    ).map((l) => l.matchedPaymentId as string);

    const openPayments = await prisma.payment.findMany({
      where: {
        tenantId,
        status: 'REPORTED', // Enfocarse principalmente en pagos no confirmados/conciliados
        id: { notIn: matchedLinePaymentIds },
      },
    });

    const proposals: MatchProposal[] = [];

    for (const line of lines) {
      const lineAmt = Number(line.amount);
      if (lineAmt <= 0) continue; // Solo nos interesan abonos recibidos

      let bestCandidate: { paymentId: string; confidence: number; reason: string } | null = null;

      for (const p of openPayments) {
        const pAmt = Number(p.amount);
        let confidence = 0;
        let reasons: string[] = [];

        // Coincidencia exacta de monto
        if (Math.abs(lineAmt - pAmt) < 0.01) {
          confidence += 0.5;
          reasons.push('Monto idéntico');
        }

        // Coincidencia de referencia
        if (line.reference && p.reference && line.reference.trim() === p.reference.trim()) {
          confidence += 0.45;
          reasons.push('Referencia idéntica');
        } else if (line.concept && p.reference && line.concept.includes(p.reference)) {
          confidence += 0.3;
          reasons.push('Referencia contenida en concepto');
        }

        if (confidence >= 0.7) {
          if (!bestCandidate || confidence > bestCandidate.confidence) {
            bestCandidate = {
              paymentId: p.id,
              confidence: Math.min(confidence, 1.0),
              reason: reasons.join(', '),
            };
          }
        }
      }

      if (bestCandidate) {
        proposals.push({
          lineId: line.id,
          paymentId: bestCandidate.paymentId,
          confidence: bestCandidate.confidence,
          reason: bestCandidate.reason,
        });
      }
    }

    // Actualizar estado a PROPOSED en la base de datos
    for (const prop of proposals) {
      await prisma.bankStatementLine.update({
        where: { id: prop.lineId },
        data: {
          status: 'PROPOSED',
          matchedPaymentId: prop.paymentId,
          matchConfidence: new Prisma.Decimal(prop.confidence),
          matchReason: prop.reason,
        },
      });
    }

    return proposals;
  },

  /**
   * Confirma manualmente una conciliación bancaria.
   * Si el pago estaba en estado REPORTED, lo confirma en el motor contable.
   */
  async confirmMatch(tenantId: string, lineId: string, paymentId: string, confirmedById?: string) {
    const line = await prisma.bankStatementLine.findUnique({
      where: { id: lineId },
      include: { statement: true },
    });

    if (!line || line.statement.tenantId !== tenantId) {
      throw new Error('Línea de estado de cuenta no encontrada o ajena a la organización.');
    }

    if (line.status === 'MATCHED') {
      throw new Error('Esta línea bancaria ya fue conciliada previamente.');
    }

    // Marcar línea como MATCHED
    await prisma.bankStatementLine.update({
      where: { id: lineId },
      data: {
        status: 'MATCHED',
        matchedPaymentId: paymentId,
      },
    });

    // Confirmar el pago en el motor de pagos si aún estaba pendiente
    await paymentService.confirmPayment(tenantId, paymentId, confirmedById);

    return { success: true, lineId, paymentId };
  },
};
