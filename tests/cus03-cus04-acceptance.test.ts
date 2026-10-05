import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { webhookService } from '../src/lib/services/webhook-service';
import { receiptService } from '../src/lib/services/receipt-service';
import { bankReconciliationService } from '../src/lib/services/bank-reconciliation-service';
import { contractLifecycleService } from '../src/lib/services/contract-lifecycle-service';
import { inspectionService } from '../src/lib/services/inspection-service';
import { chargeService } from '../src/lib/services/charge-service';
import { paymentService } from '../src/lib/services/payment-service';

test('📦 SUITE DE OPERACIONES Y COBRANZA (CUS-03 & CUS-04)', async (t) => {
  // Contexto base para las pruebas
  const tenant = await prisma.tenant.findFirst();
  const property = await prisma.property.findFirst();
  const user = await prisma.user.findFirst();

  assert.ok(tenant, 'Debe existir un tenant');
  assert.ok(property, 'Debe existir una propiedad');
  assert.ok(user, 'Debe existir un usuario');

  const tenantId = tenant.id;
  const propertyId = property.id;
  const renterId = user.id;

  // Crear contrato de prueba para el flujo
  const lease = await prisma.lease.create({
    data: {
      tenantId,
      propertyId,
      renterId,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      rentAmount: 18000,
      paymentDay: 5,
      depositAmount: 18000,
      status: 'PENDING_SIGNATURE',
    },
  });

  await t.test('CUS04-TC-01: Documento contractual versionado con SHA-256 inmutable', async () => {
    const doc = await contractLifecycleService.createDocument({
      tenantId,
      leaseId: lease.id,
      title: 'Contrato de Arrendamiento Residencial 2026',
      content: 'CLÁUSULA PRIMERA: Renta mensual de $18,000 MXN.',
    });

    assert.equal(doc.version, 1);
    assert.equal(doc.isLatest, true);
    assert.ok(doc.fileSha256, 'Debe tener hash criptográfico de integridad');
  });

  await t.test('CUS04-TC-02: Firma electrónica con auditoría activa contrato a ACTIVE', async () => {
    const doc = await prisma.contractDocument.findFirst({
      where: { leaseId: lease.id, isLatest: true },
    });
    assert.ok(doc);

    const sigReq = await contractLifecycleService.requestSignature({
      documentId: doc.id,
      signerEmail: 'inquilino@test.com',
      signerName: 'Inquilino Test',
      signerRole: 'RENTER',
    });

    assert.equal(sigReq.status, 'PENDING');

    const result = await contractLifecycleService.completeSignature({
      token: sigReq.signatureToken,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 Test Suite',
      handwrittenBase64: 'data:image/png;base64,mock',
    });

    assert.equal(result.success, true);
    assert.equal(result.leaseActivated, true);

    const updatedLease = await prisma.lease.findUnique({ where: { id: lease.id } });
    assert.equal(updatedLease?.status, 'ACTIVE');
  });

  await t.test('CUS03-TC-01: Ingesta de Webhook durable e idempotencia garantizada', async () => {
    const externalId = `evt_test_${Date.now()}`;
    const payload = {
      id: externalId,
      data: {
        object: {
          amount_received: 1800000, // 18,000 en centavos
          currency: 'mxn',
          metadata: {
            leaseId: lease.id,
            payerName: 'Inquilino Pagador',
          },
        },
      },
    };

    // Primera ingesta
    const firstResult = await webhookService.ingestAndProcess({
      tenantId,
      provider: 'STRIPE',
      externalId,
      eventType: 'payment_intent.succeeded',
      payload,
    });

    assert.equal(firstResult.status, 'PROCESSED');
    assert.ok(firstResult.paymentId);

    // Segunda ingesta (mismo ID): debe ser ignorado sin reprocesar
    const dupResult = await webhookService.ingestAndProcess({
      tenantId,
      provider: 'STRIPE',
      externalId,
      eventType: 'payment_intent.succeeded',
      payload,
    });

    assert.equal(dupResult.status, 'IGNORED_DUPLICATE');
  });

  await t.test('CUS03-TC-02: Emisión de recibo con folio único y leyenda sin CFDI', async () => {
    // Generar cargo para vincular pago
    const charges = await chargeService.generateMonthlyRentCharges({
      tenantId,
      month: 1,
      year: 2026,
    });
    const charge = charges.find(c => c.leaseId === lease.id) || charges[0];

    // Registrar pago confirmado
    const payment = await paymentService.recordPayment({
      tenantId,
      leaseId: lease.id,
      payerName: 'Inquilino Pagador',
      amount: 18000,
      method: 'TRANSFER',
      reference: 'SPEI-998822',
      autoConfirm: true,
    });

    await paymentService.applyPayment(tenantId, payment.id, [{ chargeId: charge.id, amount: 18000 }]);

    // Generar recibo
    const receipt = await receiptService.generateReceipt({
      tenantId,
      paymentId: payment.id,
      payerTaxId: 'XAXX010101000',
    });

    assert.ok(receipt.folio.startsWith('REC-'));
    assert.match(receipt.legalDisclaimer, /No CFDI/);
    assert.equal(Number(receipt.amount), 18000);

    const snapshot = receipt.snapshotJson as any;
    assert.equal(snapshot.payerName, 'Inquilino Pagador');
    assert.equal(snapshot.appliedCharges.length, 1);
  });

  await t.test('CUS03-TC-03: Conciliación bancaria (Importación y propuesta de match)', async () => {
    const uniqueRef = `REF-BANCO-${Date.now()}`;

    // 1. Pago pendiente de confirmar
    const reportedPayment = await paymentService.recordPayment({
      tenantId,
      leaseId: lease.id,
      payerName: 'Depósito Inquilino',
      amount: 18000,
      method: 'TRANSFER',
      reference: uniqueRef,
      autoConfirm: false,
    });

    // 2. Importar extracto bancario con la misma referencia
    const statement = await bankReconciliationService.importStatement({
      tenantId,
      bankName: 'BBVA Bancomer',
      accountNum: '1234',
      filename: 'extracto_enero_2026.csv',
      rows: [
        {
          operationDate: '2026-01-05',
          reference: uniqueRef,
          concept: `DEPÓSITO SPEI ${uniqueRef}`,
          amount: 18000,
        },
      ],
    });

    assert.equal(statement.totalRows, 1);

    // 3. Proponer match
    const proposals = await bankReconciliationService.proposeMatches(tenantId, statement.id);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].paymentId, reportedPayment.id);
    assert.ok(proposals[0].confidence >= 0.8);

    // 4. Confirmar match
    const confirmResult = await bankReconciliationService.confirmMatch(
      tenantId,
      proposals[0].lineId,
      reportedPayment.id
    );
    assert.equal(confirmResult.success, true);

    const checkedPayment = await prisma.payment.findUnique({ where: { id: reportedPayment.id } });
    assert.equal(checkedPayment?.status, 'CONFIRMED');
  });

  await t.test('CUS04-TC-03: Inspección Move-In/Move-Out con diff de deterioros', async () => {
    // Inspección de entrada
    const moveIn = await inspectionService.createInspection({
      tenantId,
      propertyId,
      leaseId: lease.id,
      type: 'MOVE_IN',
      inspectorName: 'Perito Arquitecto',
      zones: [
        {
          zoneName: 'Cocina',
          items: [
            { name: 'Tarja', condition: 'GOOD' },
            { name: 'Estufa', condition: 'GOOD', photoUrl: 'https://storage/estufa.jpg' },
          ],
        },
      ],
    });

    // Inspección de salida con daño en estufa
    const moveOut = await inspectionService.createInspection({
      tenantId,
      propertyId,
      leaseId: lease.id,
      type: 'MOVE_OUT',
      inspectorName: 'Perito Arquitecto',
      zones: [
        {
          zoneName: 'Cocina',
          items: [
            { name: 'Tarja', condition: 'GOOD' },
            { name: 'Estufa', condition: 'DAMAGED', notes: 'Quemador roto' },
          ],
        },
      ],
    });

    const comparison = await inspectionService.compareInspections(moveIn.id, moveOut.id);
    assert.equal(comparison.differencesCount, 1);
    assert.equal(comparison.differences[0].item, 'Estufa');
    assert.equal(comparison.differences[0].deductionSuggested, true);
  });
});
