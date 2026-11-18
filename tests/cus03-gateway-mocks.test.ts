import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MockPaymentProvider } from '../src/lib/payments/mock-payment-provider';

describe('⚡ MOCK EXTERNAL GATEWAY TESTS (CUS-03)', () => {
  const provider = new MockPaymentProvider();

  it('CUS03-MOCK-01: Creación de sesión de pago simulada', async () => {
    const session = await provider.createCheckoutSession({
      tenantId: 'tenant-test',
      leaseId: 'lease-test-123',
      amount: 15000,
      currency: 'MXN',
      customerEmail: 'renter@test.com'
    });

    assert.ok(session.sessionId.startsWith('cs_test_'));
    assert.strictEqual(session.amount, 15000);
    assert.strictEqual(session.currency, 'MXN');
  });

  it('CUS03-MOCK-02: Webhook con firma inválida es rechazado', async () => {
    await assert.rejects(
      async () => {
        await provider.processWebhookEvent({
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          signature: 'invalid_forged_sig',
          payload: {}
        });
      },
      /FIRMA INVÁLIDA/
    );
  });

  it('CUS03-MOCK-03: Webhook válido procesado y deduplicación por idempotencia', async () => {
    const eventId = `evt_${Date.now()}`;
    const firstRun = await provider.processWebhookEvent({
      id: eventId,
      type: 'payment_intent.succeeded',
      signature: 'valid_stripe_signature',
      payload: { amount: 15000 }
    });

    assert.strictEqual(firstRun.status, 'PAYMENT_PROCESSED');

    // Reintento idéntico
    const secondRun = await provider.processWebhookEvent({
      id: eventId,
      type: 'payment_intent.succeeded',
      signature: 'valid_stripe_signature',
      payload: { amount: 15000 }
    });

    assert.strictEqual(secondRun.status, 'IGNORED_DUPLICATE');
  });
});
