import { prisma } from '@/lib/prisma';
import { Prisma } from '../../generated/prisma/client';
import { accountingService } from './accounting-service';

export interface RecordPaymentInput {
  tenantId: string;
  leaseId?: string;
  payerName: string;
  amount: number | Prisma.Decimal;
  currency?: string;
  method: 'TRANSFER' | 'CASH' | 'CARD' | 'STRIPE' | 'OTHER';
  reference?: string;
  receiptUrl?: string;
  autoConfirm?: boolean;
  confirmedById?: string;
}

export interface ApplyPaymentItem {
  chargeId: string;
  amount: number | Prisma.Decimal;
}

/**
 * Servicio de Pagos, Aplicaciones N:M y Depósitos en Garantía (CUS-02B)
 */
export const paymentService = {
  /**
   * Registra un pago recibido (inicialmente REPORTED o CONFIRMED)
   */
  async recordPayment(input: RecordPaymentInput) {
    const paymentAmount = new Prisma.Decimal(input.amount);
    if (paymentAmount.lessThanOrEqualTo(0)) {
      throw new Error("El monto del pago debe ser mayor a cero.");
    }

    const status = input.autoConfirm ? 'CONFIRMED' : 'REPORTED';
    const confirmedAt = input.autoConfirm ? new Date() : null;

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          leaseId: input.leaseId,
          payerName: input.payerName,
          amount: paymentAmount,
          currency: input.currency || 'MXN',
          method: input.method,
          reference: input.reference,
          receiptUrl: input.receiptUrl,
          status,
          confirmedAt,
          confirmedById: input.confirmedById
        }
      });

      // Si está confirmado inmediatamente, registrar el asiento de recepción de fondos
      if (input.autoConfirm) {
        await this._postConfirmedPaymentEntry(tx, payment, input.confirmedById);
      }

      return payment;
    });
  },

  /**
   * Confirma un pago previamente reportado (pasa a CONFIRMED y contabiliza el ingreso en banco)
   */
  async confirmPayment(tenantId: string, paymentId: string, confirmedById?: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, tenantId }
      });

      if (!payment) {
        throw new Error("Pago no encontrado.");
      }

      if (payment.status === 'CONFIRMED' || payment.status === 'CLEARED') {
        return payment;
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          confirmedById
        }
      });

      await this._postConfirmedPaymentEntry(tx, updatedPayment, confirmedById);
      return updatedPayment;
    });
  },

  /**
   * Aplica un pago confirmado a uno o varios cargos pendientes (Relación N:M)
   * Previene sobre-aplicación y soporta sobrepagos como saldo a favor del inquilino.
   */
  async applyPayment(
    tenantId: string,
    paymentId: string,
    applications: ApplyPaymentItem[]
  ) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { id: paymentId, tenantId },
        include: { applications: true }
      });

      if (!payment) {
        throw new Error("Pago no encontrado.");
      }

      if (payment.status !== 'CONFIRMED' && payment.status !== 'CLEARED') {
        throw new Error("Solo pagos confirmados o conciliados pueden ser aplicados a obligaciones.");
      }

      // 1. Calcular monto disponible del pago
      const alreadyApplied = payment.applications.reduce(
        (sum, app) => sum.plus(new Prisma.Decimal(app.amountApplied)),
        new Prisma.Decimal(0)
      );
      const remainingPaymentBalance = new Prisma.Decimal(payment.amount).minus(alreadyApplied);

      // 2. Sumar total solicitado para aplicar
      let requestedTotal = new Prisma.Decimal(0);
      for (const item of applications) {
        const itemAmount = new Prisma.Decimal(item.amount);
        if (itemAmount.lessThanOrEqualTo(0)) {
          throw new Error("El monto a aplicar a cada cargo debe ser positivo.");
        }
        requestedTotal = requestedTotal.plus(itemAmount);
      }

      if (requestedTotal.greaterThan(remainingPaymentBalance)) {
        throw new Error(
          `FONDOS INSUFICIENTES: Se solicitó aplicar ${requestedTotal}, pero solo quedan disponibles ${remainingPaymentBalance} en este pago.`
        );
      }

      // 3. Aplicar a cada cargo de forma atómica
      const appliedResults = [];
      for (const item of applications) {
        const charge = await tx.charge.findFirst({
          where: { id: item.chargeId, tenantId }
        });

        if (!charge) {
          throw new Error(`Cargo ${item.chargeId} no encontrado en este tenant.`);
        }

        const appAmount = new Prisma.Decimal(item.amount);
        const newPaid = new Prisma.Decimal(charge.amountPaid).plus(appAmount);

        let newStatus: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' = 'PARTIALLY_PAID';
        if (newPaid.greaterThanOrEqualTo(charge.amount)) {
          newStatus = 'PAID';
        }

        // Actualizar cargo
        await tx.charge.update({
          where: { id: charge.id },
          data: {
            amountPaid: newPaid,
            status: newStatus
          }
        });

        // Registrar vínculo de aplicación
        const applicationRecord = await tx.paymentApplication.create({
          data: {
            paymentId: payment.id,
            chargeId: charge.id,
            amountApplied: appAmount
          }
        });

        appliedResults.push(applicationRecord);
      }

      return {
        paymentId: payment.id,
        applications: appliedResults,
        unappliedBalance: remainingPaymentBalance.minus(requestedTotal)
      };
    });
  },

  /**
   * Registra y custodia un depósito en garantía.
   * El depósito se contabiliza como pasivo fiduciario (LIABILITY) y queda excluido del disponible.
   */
  async recordSecurityDeposit(
    tenantId: string,
    leaseId: string,
    amount: number | Prisma.Decimal,
    payerName: string,
    reference?: string
  ) {
    const depositAmount = new Prisma.Decimal(amount);
    const lease = await prisma.lease.findUniqueOrThrow({
      where: { id: leaseId },
      include: { property: true }
    });

    const accounts = await accountingService.ensureStandardChartOfAccounts(tenantId);
    const idempotencyKey = `DEPOSIT_${lease.id}_${Date.now()}`;

    return prisma.$transaction(async (tx) => {
      // 1. Registrar cargo de depósito
      const charge = await tx.charge.create({
        data: {
          tenantId,
          leaseId: lease.id,
          propertyId: lease.propertyId,
          concept: `Depósito en Garantía - Contrato ${lease.id}`,
          type: 'SECURITY_DEPOSIT',
          amount: depositAmount,
          currency: lease.currency,
          dueDate: new Date(),
          periodMonth: new Date().getMonth() + 1,
          periodYear: new Date().getFullYear(),
          status: 'PAID',
          amountPaid: depositAmount
        }
      });

      // 2. Registrar pago confirmado del depósito
      const payment = await tx.payment.create({
        data: {
          tenantId,
          leaseId: lease.id,
          payerName,
          amount: depositAmount,
          currency: lease.currency,
          status: 'CONFIRMED',
          method: 'TRANSFER',
          reference,
          confirmedAt: new Date()
        }
      });

      // 3. Vincular aplicación
      await tx.paymentApplication.create({
        data: {
          paymentId: payment.id,
          chargeId: charge.id,
          amountApplied: depositAmount
        }
      });

      // 4. Asiento Contable Fiduciario:
      // Débito a Caja Escrow PM (o Direct Owner) vs Crédito a Pasivo de Depósitos (NO es ingreso ni distribuible)
      const cashAccountId = lease.property.fundCustodian === 'DIRECT_OWNER'
        ? accounts.cashDirectOwner
        : accounts.cashPmEscrow;

      await tx.journalEntry.create({
        data: {
          tenantId,
          idempotencyKey,
          effectiveDate: new Date(),
          description: `Custodia de Depósito en Garantía - Inquilino ${payerName}`,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: cashAccountId,
                debit: depositAmount,
                credit: 0,
                currency: lease.currency,
                propertyId: lease.propertyId,
                leaseId: lease.id
              },
              {
                accountId: accounts.securityDepositsLiability,
                debit: 0,
                credit: depositAmount,
                currency: lease.currency,
                propertyId: lease.propertyId,
                leaseId: lease.id
              }
            ]
          }
        }
      });

      return { charge, payment };
    });
  },

  /**
   * Función interna para asentar el cobro confirmado
   */
  async _postConfirmedPaymentEntry(tx: any, payment: any, createdById?: string) {
    const accounts = await accountingService.ensureStandardChartOfAccounts(payment.tenantId);
    let cashAccountId = accounts.cashPmEscrow;

    let propertyId = undefined;
    if (payment.leaseId) {
      const lease = await tx.lease.findUnique({
        where: { id: payment.leaseId },
        include: { property: true }
      });
      if (lease?.property) {
        propertyId = lease.propertyId;
        if (lease.property.fundCustodian === 'DIRECT_OWNER') {
          cashAccountId = accounts.cashDirectOwner;
        }
      }
    }

    const idempotencyKey = `PAYMENT_CONFIRMED_${payment.id}`;

    // Débito a Bancos / Caja vs Crédito a Cuentas por Cobrar Inquilinos (AR)
    await tx.journalEntry.create({
      data: {
        tenantId: payment.tenantId,
        idempotencyKey,
        effectiveDate: payment.confirmedAt || new Date(),
        description: `Cobro Confirmado - ${payment.payerName} [Ref: ${payment.reference || 'N/A'}]`,
        createdById,
        status: 'POSTED',
        lines: {
          create: [
            {
              accountId: cashAccountId,
              debit: payment.amount,
              credit: 0,
              currency: payment.currency,
              propertyId,
              leaseId: payment.leaseId
            },
            {
              accountId: accounts.accountsReceivableRenter,
              debit: 0,
              credit: payment.amount,
              currency: payment.currency,
              propertyId,
              leaseId: payment.leaseId
            }
          ]
        }
      }
    });
  }
};
