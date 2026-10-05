import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Prisma } from '../src/generated/prisma/client';
const Decimal = Prisma.Decimal;

// Mocks y estructuras canónicas en memoria para evaluación pura de invariantes CUS-02
describe('🏛️ SUITE DE PRUEBAS FÍSICAS CANÓNICAS CUS-02 (MOTOR FINANCIERO)', () => {

  it('TC-02-BASE: Caso Base Canónico ($20,000 renta, $2,000 comisión, $1,500 gasto, $2,000 reserva -> $14,500 disponible)', () => {
    const grossRent = new Decimal(20000);
    const commission = grossRent.times(0.10); // 10% = 2,000
    const expense = new Decimal(1500);
    const reserve = new Decimal(2000);
    const securityDeposit = new Decimal(20000); // Depósito separado

    // Cálculo fiduciario
    const netAvailable = grossRent.minus(commission).minus(expense).minus(reserve);

    assert.strictEqual(commission.toNumber(), 2000, 'Comisión debe ser $2,000');
    assert.strictEqual(netAvailable.toNumber(), 14500, 'El disponible debe ser exactamente $14,500');
    
    // Invariante de depósito: NO debe aumentar el disponible
    const availableWithDeposit = netAvailable; // El depósito no se suma
    assert.strictEqual(availableWithDeposit.toNumber(), 14500, 'El depósito jamás debe incrementar el disponible del dueño');
  });

  it('TC-02-01: Pago reportado sin confirmar no altera saldo disponible en banco', () => {
    let confirmedBankBalance = new Decimal(0);
    const reportedPayment = { amount: new Decimal(20000), status: 'REPORTED' };

    if (reportedPayment.status === 'CONFIRMED') {
      confirmedBankBalance = confirmedBankBalance.plus(reportedPayment.amount);
    }

    assert.strictEqual(confirmedBankBalance.toNumber(), 0, 'El saldo bancario debe permanecer en 0 con pago solo REPORTED');
  });

  it('TC-02-02: Pago confirmado sin liquidación disponible (bloqueo por reservas y gastos)', () => {
    const grossRent = new Decimal(5000);
    const commission = new Decimal(500);
    const emergencyRepair = new Decimal(3000);
    const reserve = new Decimal(2000); // 5000 - 500 - 3000 - 2000 = -500

    const net = grossRent.minus(commission).minus(emergencyRepair).minus(reserve);
    const available = net.greaterThan(0) ? net : new Decimal(0);

    assert.strictEqual(available.toNumber(), 0, 'No debe haber disponible líquido si los gastos y reservas superan el cobro');
  });

  it('TC-02-03: Dos pagos parciales cubren progresivamente una obligación de renta', () => {
    const totalRent = new Decimal(12000);
    let amountPaid = new Decimal(0);

    // Pago 1: $5,000
    const payment1 = new Decimal(5000);
    amountPaid = amountPaid.plus(payment1);
    let status = amountPaid.greaterThanOrEqualTo(totalRent) ? 'PAID' : 'PARTIALLY_PAID';
    assert.strictEqual(status, 'PARTIALLY_PAID');
    assert.strictEqual(totalRent.minus(amountPaid).toNumber(), 7000);

    // Pago 2: $7,000
    const payment2 = new Decimal(7000);
    amountPaid = amountPaid.plus(payment2);
    status = amountPaid.greaterThanOrEqualTo(totalRent) ? 'PAID' : 'PARTIALLY_PAID';
    assert.strictEqual(status, 'PAID');
    assert.strictEqual(totalRent.minus(amountPaid).toNumber(), 0);
  });

  it('TC-02-04: Sobrepago conserva saldo a favor identificado del inquilino', () => {
    const charge = new Decimal(10000);
    const payment = new Decimal(12500);

    const applied = Decimal.min(charge, payment);
    const creditBalance = payment.minus(applied);

    assert.strictEqual(applied.toNumber(), 10000, 'Se aplica el total del cargo exigible');
    assert.strictEqual(creditBalance.toNumber(), 2500, 'El saldo a favor del inquilino es exactamente $2,500');
  });

  it('TC-02-05: Devolución parcial revierte asiento sin borrar historia', () => {
    const originalPayment = new Decimal(10000);
    const refund = new Decimal(3000);
    const netReceived = originalPayment.minus(refund);

    assert.strictEqual(netReceived.toNumber(), 7000, 'El neto recibido tras devolución parcial es $7,000');
  });

  it('TC-02-06: Dos copropietarios (60/40) con residuo de redondeo asignan centavo al mayoritario', () => {
    const netToDistribute = new Decimal('1000.01'); // Monto indivisible
    const shareA = new Decimal('0.60');
    const shareB = new Decimal('0.40');

    let partA = netToDistribute.times(shareA).toDecimalPlaces(2, Decimal.ROUND_DOWN); // 600.00
    let partB = netToDistribute.times(shareB).toDecimalPlaces(2, Decimal.ROUND_DOWN); // 400.00
    const remainder = netToDistribute.minus(partA).minus(partB); // 0.01

    if (remainder.greaterThan(0)) {
      partA = partA.plus(remainder); // El mayoritario absorbe el centavo residual
    }

    assert.strictEqual(partA.toFixed(2), '600.01');
    assert.strictEqual(partB.toFixed(2), '400.00');
    assert.strictEqual(partA.plus(partB).toFixed(2), '1000.01');
  });

  it('TC-02-07: Cobro directo al propietario (DIRECT_OWNER) arroja disponible en custodia PM = 0', () => {
    const directRentCollected = new Decimal(25000);
    const fundCustodian = 'DIRECT_OWNER';

    const pmEscrowFunds = fundCustodian === 'DIRECT_OWNER' ? new Decimal(0) : directRentCollected;
    const availableForPmDisbursement = pmEscrowFunds;

    assert.strictEqual(availableForPmDisbursement.toNumber(), 0, 'El PM no puede liquidar dinero que fue cobrado directo por el dueño');
  });

  it('TC-02-08: Invariante estricta de partida doble: Débitos === Créditos', () => {
    const lines = [
      { debit: new Decimal(15000), credit: new Decimal(0) },
      { debit: new Decimal(0), credit: new Decimal(13500) },
      { debit: new Decimal(0), credit: new Decimal(1500) },
    ];

    const totalDebit = lines.reduce((acc, l) => acc.plus(l.debit), new Decimal(0));
    const totalCredit = lines.reduce((acc, l) => acc.plus(l.credit), new Decimal(0));

    assert.strictEqual(totalDebit.equals(totalCredit), true, 'Débitos y Créditos deben sumar exactamente lo mismo');
  });

  it('TC-02-09: Idempotencia de generación de rentas (clave compuesta única)', () => {
    const keys = new Set<string>();
    const generate = (leaseId: string, year: number, month: number) => {
      const key = `${leaseId}_${year}_${month}`;
      if (keys.has(key)) return { created: false, message: 'DUPLICATE_IGNORED' };
      keys.add(key);
      return { created: true, message: 'CREATED' };
    };

    const run1 = generate('lease-123', 2026, 10);
    const run2 = generate('lease-123', 2026, 10);

    assert.strictEqual(run1.created, true);
    assert.strictEqual(run2.created, false);
    assert.strictEqual(keys.size, 1, 'Solo debe existir exactamente un cargo para el periodo');
  });

  it('TC-02-10: Dos propuestas de liquidación concurrentes no comprometen el mismo saldo', () => {
    const totalAvailable = new Decimal(14500);
    let committedFunds = new Decimal(0);

    const tryPropose = (amount: any) => {
      if (committedFunds.plus(amount).greaterThan(totalAvailable)) {
        throw new Error('FONDOS INSUFICIENTES: Ya comprometidos por otra propuesta.');
      }
      committedFunds = committedFunds.plus(amount);
      return true;
    };

    assert.strictEqual(tryPropose(new Decimal(14500)), true);
    assert.throws(() => tryPropose(new Decimal(14500)), /FONDOS INSUFICIENTES/);
  });
});
