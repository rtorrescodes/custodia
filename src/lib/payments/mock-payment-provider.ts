/**
 * Adaptador Mock de Proveedor de Pagos Externo (CUS-03)
 * Simula el comportamiento de Stripe Connect y Webhooks sin llamadas de red reales.
 */

export interface MockPaymentSession {
  sessionId: string;
  url: string;
  amount: number;
  currency: string;
  leaseId: string;
}

export class MockPaymentProvider {
  private processedWebhookEvents = new Set<string>();

  /**
   * Crea una sesión de cobro simulada (Checkout)
   */
  async createCheckoutSession(params: {
    tenantId: string;
    leaseId: string;
    amount: number;
    currency: string;
    customerEmail: string;
  }): Promise<MockPaymentSession> {
    const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      sessionId,
      url: `https://checkout.stripe.mock/pay/${sessionId}`,
      amount: params.amount,
      currency: params.currency,
      leaseId: params.leaseId
    };
  }

  /**
   * Procesa un evento de webhook entrante de forma durable e idempotente
   */
  async processWebhookEvent(event: {
    id: string;
    type: string;
    signature: string;
    payload: any;
  }) {
    // 1. Validar firma criptográfica sintética
    if (!event.signature || event.signature !== 'valid_stripe_signature') {
      throw new Error('FIRMA INVÁLIDA: El webhook no proviene del proveedor autorizado.');
    }

    // 2. Comprobar idempotencia
    if (this.processedWebhookEvents.has(event.id)) {
      return { status: 'IGNORED_DUPLICATE', eventId: event.id };
    }

    // 3. Procesar según tipo de evento
    let result = { status: 'UNHANDLED_EVENT', eventId: event.id };
    if (event.type === 'payment_intent.succeeded') {
      this.processedWebhookEvents.add(event.id);
      result = { status: 'PAYMENT_PROCESSED', eventId: event.id };
    } else if (event.type === 'charge.refunded') {
      this.processedWebhookEvents.add(event.id);
      result = { status: 'REFUND_PROCESSED', eventId: event.id };
    }

    return result;
  }
}
