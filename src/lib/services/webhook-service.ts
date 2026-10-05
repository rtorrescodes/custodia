import { prisma } from '@/lib/prisma';
import { paymentService } from './payment-service';

export interface IngestWebhookInput {
  tenantId: string;
  provider: 'STRIPE' | 'MERCADOPAGO' | 'OPENPAY' | 'STP';
  externalId: string;
  eventType: string;
  payload: any;
  signature?: string;
}

export interface WebhookProcessResult {
  eventId: string;
  status: 'PROCESSED' | 'IGNORED_DUPLICATE' | 'FAILED';
  message?: string;
  paymentId?: string;
}

/**
 * Servicio de Ingesta y Procesamiento Durable de Webhooks (CUS-03B)
 * - Persistencia del evento antes de cualquier procesamiento o ACK.
 * - Deduplicación estricta e idempotencia por (tenantId, provider, externalId).
 * - Manejo de estados: RECEIVED -> PROCESSING -> PROCESSED | FAILED.
 */
export const webhookService = {
  /**
   * Recibe y persiste el webhook garantizando durabilidad.
   */
  async ingestAndProcess(input: IngestWebhookInput): Promise<WebhookProcessResult> {
    // 1. Verificar si ya existe el evento para deduplicación idempotente
    const existing = await prisma.webhookEvent.findUnique({
      where: {
        tenantId_provider_externalId: {
          tenantId: input.tenantId,
          provider: input.provider,
          externalId: input.externalId,
        },
      },
    });

    if (existing) {
      if (existing.status === 'PROCESSED') {
        return {
          eventId: existing.id,
          status: 'IGNORED_DUPLICATE',
          message: 'Evento ya procesado exitosamente con anterioridad.',
        };
      }
      if (existing.status === 'PROCESSING') {
        return {
          eventId: existing.id,
          status: 'IGNORED_DUPLICATE',
          message: 'Evento actualmente en proceso por otro worker.',
        };
      }
    }

    // 2. Persistir evento en estado RECEIVED si es nuevo
    const event = existing
      ? existing
      : await prisma.webhookEvent.create({
          data: {
            tenantId: input.tenantId,
            provider: input.provider,
            externalId: input.externalId,
            eventType: input.eventType,
            payload: input.payload,
            signature: input.signature,
            status: 'RECEIVED',
          },
        });

    // 3. Pasar a estado PROCESSING e incrementar intentos
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
      },
    });

    // 4. Ejecutar el despachador de negocio según el tipo de evento
    try {
      let createdPaymentId: string | undefined;

      if (input.eventType === 'payment_intent.succeeded' || input.eventType === 'checkout.session.completed') {
        const data = input.payload.data?.object || input.payload;
        const amount = data.amount_received ? data.amount_received / 100 : (data.amount || 0);
        const leaseId = data.metadata?.leaseId;
        const payerName = data.customer_details?.name || data.metadata?.payerName || 'Inquilino Stripe';

        // Registrar y autoconfirmar el pago en el motor financiero
        const payment = await paymentService.recordPayment({
          tenantId: input.tenantId,
          leaseId,
          payerName,
          amount,
          currency: (data.currency || 'mxn').toUpperCase(),
          method: 'STRIPE',
          reference: input.externalId,
          autoConfirm: true,
        });

        createdPaymentId = payment.id;
      } else if (input.eventType === 'charge.refunded') {
        // En caso de reembolso, registrar la reversión o nota correspondiente
        // (Dejado listo para extender en reconciliaciones)
      }

      // 5. Marcar como PROCESSED
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          lastError: null,
        },
      });

      return {
        eventId: event.id,
        status: 'PROCESSED',
        paymentId: createdPaymentId,
      };
    } catch (err: any) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: 'FAILED',
          lastError: err.message || 'Error desconocido al procesar webhook',
        },
      });

      return {
        eventId: event.id,
        status: 'FAILED',
        message: err.message,
      };
    }
  },
};
