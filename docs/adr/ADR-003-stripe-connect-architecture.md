# ADR-003: Arquitectura de Integración de Pagos con Stripe Connect (CUS-03)

## Estado
Propuesto / Preparado para Fase CUS-03 (Sin cobros reales)

## Contexto y Dos Necesidades Distintas de Cobro
Custodia presenta dos flujos monetarios completamente desacoplados:
1. **Flujo A (Suscripción SaaS Custodia):** Cobro recurrente de la plataforma Custodia hacia las organizaciones (Caseros y Property Managers) por puerta o suscripción mensual/anual.
2. **Flujo B (Cobranza de Rentas de Inquilinos):** Cobro de rentas, mantenimientos y depósitos desde los inquilinos hacia los Property Managers o caseros.

## Comparativa Técnica: Stripe Connect Standard vs. Custom / Express en México y LATAM

| Criterio | Stripe Connect Standard | Stripe Connect Custom / Express |
| :--- | :--- | :--- |
| **Responsabilidad KYC y Legal** | Stripe asume el KYC y contratos con cada PM. El PM crea su cuenta de Stripe directamente. | Custodia asume la responsabilidad del KYC o el flujo de onboarding; mayor riesgo regulatorio para la plataforma. |
| **Riesgo de Contracargos y Saldo Negativo** | El PM o casero absorbe el riesgo directo en su cuenta conectada. Custodia no queda expuesta a deudas de terceros. | Custodia responde solidariamente ante Stripe por balances negativos o fraudes en cuentas Custom. |
| **Experiencia de Usuario (White-Label)** | Redirige al Dashboard de Stripe para configuración bancaria y fiscal inicial. | Embebido en la UI de Custodia, pero requiere desarrollo complejo de compliance y reportes ante el SAT. |
| **Comisiones de Plataforma (Application Fees)** | Custodia puede cobrar una tarifa por transacción (`application_fee_amount`) de forma transparente y automática. | Custodia gestiona las transferencias directas (`transfers`) deduciendo honorarios. |

### Decisión de Recomendación Arquitectónica:
Para la operación de Property Managers en México, **Stripe Connect Standard con cargos directos o cargos de destino (`Destination Charges`)** es la alternativa óptima:
- Deslinda a Custodia de la retención fiscal obligatoria de plataformas tecnológicas en rentas ajenas y de la absorción de saldos negativos por disputas entre inquilinos y propietarios.
- Permite a cada Property Manager deducir sus comisiones y dispersar transferencias hacia sus cuentas bancarias locales vía SPEI con su propia razón social.

---

## Contrato de Proveedor de Pagos y Mocks (CUS-03)

```typescript
export interface PaymentIntentRequest {
  tenantId: string;
  leaseId: string;
  chargeId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResponse {
  paymentIntentId: string;
  clientSecret: string;
  status: 'requires_payment_method' | 'processing' | 'succeeded' | 'failed';
}

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      metadata?: Record<string, string>;
    };
  };
}
```

### Invariantes de Frontera:
1. **Checkout Exitoso $\neq$ Dinero en Banco:** Un evento `checkout.session.completed` únicamente confirma la intención de pago; la contabilidad de fondos líquidos solo se asienta cuando el webhook confirma `charge.succeeded` o `payout.paid`.
2. **Idempotencia de Webhooks:** El `event.id` de Stripe debe persistirse en una tabla de eventos procesados para ignorar reintentos duplicados del webhook.
3. **Cero Claves Reales en Local:** Todo test local de CUS-03 debe consumir un adaptador Mock que simule caídas, firmas inválidas y duplicados sin invocar los servidores de Stripe en vivo.
