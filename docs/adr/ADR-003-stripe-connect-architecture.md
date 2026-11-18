# ADR-003: Análisis Arquitectónico y Fiscal de Integración con Stripe Connect (CUS-03)

## Estado
Borrador de Trabajo / En Revisión Especializada (Sin activación externa)

## 1. Contexto Operativo y Dos Modelos de Cobro
Custodia administra dos circuitos financieros estrictamente separados:
- **Flujo A (Suscripción SaaS Custodia):** Cobro de Custodia a las empresas/caseros por el uso del software (tarifa por puerta/mes).
- **Flujo B (Cobranza de Rentas de Inquilinos):** Cobro de rentas, mantenimientos y depósitos de inquilinos en favor de Property Managers (PMs) o propietarios.

---

## 2. Comparativa Técnica y de Responsabilidad: Direct Charges vs. Destination Charges vs. Separate Charges & Transfers

Conforme a la documentación oficial de Stripe ([Stripe Connect Disputes](https://docs.stripe.com/connect/disputes), [Direct Charges](https://docs.stripe.com/connect/direct-charges), y [Destination Charges](https://docs.stripe.com/connect/destination-charges)):

| Dimensión de Análisis | Direct Charges (Cargos Directos) | Destination Charges (Cargos de Destino) | Separate Charges and Transfers |
| :--- | :--- | :--- | :--- |
| **Cuenta donde se crea el cargo** | Cuenta Conectada (del PM/Dueño). | Cuenta de la Plataforma (Custodia). | Cuenta de la Plataforma (Custodia). |
| **Titular de los Fondos** | La Cuenta Conectada es el comerciante registrado (Merchant of Record). | La Plataforma cobra y transfiere inmediatamente a la conectada. | La Plataforma cobra en su balance y luego transfiere discrecionalmente. |
| **Responsabilidad de Contracargos y Disputas** | **La Cuenta Conectada** responde íntegramente por contracargos, tarifas de disputa y pérdidas. | **La Plataforma (Custodia)** es responsable principal ante Stripe; los fondos en disputa se descuentan del balance de Custodia si la conectada carece de saldo. | **La Plataforma (Custodia)** responde al 100% por disputas y fraude. |
| **Saldos Negativos** | Permanecen en la Cuenta Conectada. Stripe intenta recuperarlos de la cuenta bancaria del PM. | Custodia absorbe el saldo negativo ante Stripe si el PM no tiene fondos suficientes. | Custodia absorbe cualquier saldo negativo. |
| **Comisión de la Plataforma** | Custodia cobra mediante `application_fee_amount` deducido automáticamente en el cargo. | Custodia cobra reteniendo una porción del cargo antes del split. | Custodia retiene fondos en su balance antes de la transferencia. |
| **Tipo de Cuenta Conectada Recomendada** | Standard (el PM tiene su propio dashboard) o Express. | Express o Custom. | Express o Custom. |
| **Presencia en el Estado de Cuenta del Inquilino** | Nombre del Property Manager / Inmobiliaria. | Nombre de Custodia o Nombre Conjunto. | Nombre de Custodia. |

---

## 3. Corrección Crítica de Conclusiones Previas

> [!WARNING]
> **Correcciones Obligatorias:**
> 1. Se retira formalmente la afirmación previa de que *"Destination Charges mitiga contracargos en cuentas conectadas"*. Por diseño de Stripe Connect, en **Destination Charges la plataforma (Custodia) es responsable final ante Stripe por disputas, tarifas y balances negativos**, no la cuenta conectada.
> 2. Se retira formalmente la afirmación de que *"Standard con Destination Charges deslinda a Custodia de retenciones fiscales"*. La elección entre Standard/Custom/Express o el tipo de cargo **no exime legal ni tributariamente a la plataforma** frente a las regulaciones del SAT en México (como la retención a plataformas tecnológicas o la emisión de complementos de pago).

---

## 4. Candidato Arquitectónico Recomendado para Evaluación: Direct Charges con Cuentas Standard

Para el flujo de rentas entre inquilino y PM:
1. **Merchant of Record Claro:** El Property Manager o dueño es el receptor formal del pago. Su razón social aparece en el recibo y extracto bancario del inquilino.
2. **Mitigación Real de Responsabilidad de Disputas:** Con **Direct Charges**, las disputas y contracargos son gestionados directamente por la cuenta conectada del PM; Stripe deduce las pérdidas de la cuenta bancaria del PM, no del patrimonio de Custodia.
3. **Flujo de Monetización SaaS:** Custodia cobra su comisión de plataforma (`application_fee_amount`) de forma nativa en cada transacción exitosa.

---

## 5. Cuestiones Fiscales y Legales: Marcadas como PENDIENTES DE VALIDACIÓN ESPECIALIZADA

1. **Régimen de Plataformas Tecnológicas (Art. 113-A LISR):** Se requiere dictamen fiscal de un contador/abogado fiscalista para determinar si el cobro de rentas de terceros mediante Direct Charges constituye intermediación gravada con retención obligatoria de ISR/IVA para Custodia en México.
2. **Facturación Electrónica (CFDI con Complemento de Arrendamiento):** Definir si el CFDI al inquilino lo timbra el PM directamente desde su propio RFC o si se requiere un servicio de timbrado PAC embebido.

---

## 6. Frontera Técnica y Mocks (CUS-03)
- No se activarán claves reales de Stripe (`pk_live`, `sk_live`) ni se habilitarán webhooks de producción hasta contar con el dictamen fiscal y la aprobación explícita de Dirección.
- Se mantiene el adaptador [`MockPaymentProvider`](file:///c:/CODES/Custodia/src/lib/payments/mock-payment-provider.ts) para simular los estados `requires_action`, `succeeded`, caídas de red y deduplicación durable de webhooks.
