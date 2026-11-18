# 🏛️ MATRIZ DE ACEPTACIÓN FINITA Y CALIFICACIÓN DE CAPACIDADES (CUSTODIA)

**Fecha:** 2026-10-04  
**Rama:** `feature/pilot-acceptance-candidate`  
**Base SHA:** `4119f81b2515049092c4cea7129e9d6e641462dc`  
**Entorno de Datos:** Supabase de Desarrollo (`https://ptfejkjyxrcmxslpuexo.supabase.co`)  

---

## 1. Clasificación Oficial de Estados

- **ENTREGADO Y DEMOSTRADO:** Código completo en rutas/acciones, probado contra PostgreSQL real en Supabase con aserciones pasando al 100%.
- **MOCK SEGURO:** Adaptador implementado con aislamiento estricto, sin efectos colaterales externos (pases de acceso, webhooks, firma sin PSC).
- **PENDIENTE EXTERNO:** Requiere contrato comercial o credenciales productivas de terceros (ej. Stripe Live, Twilio, CFDI PAC, Alddea bilateral).

---

## 2. Matriz Requisito $\rightarrow$ Ruta $\rightarrow$ Servicio $\rightarrow$ Prueba $\rightarrow$ Estado

| Requisito | Ruta / Server Action | Servicio / Modelo | Suite de Pruebas | Estado |
|---|---|---|---|:---:|
| **Organizaciones & Aislamiento** | `/app/page.tsx` | `Tenant`, `TenantMember`, `membership-guard.ts` | `tests/cus01-acceptance.test.ts` (TC-01..05) | **ENTREGADO Y DEMOSTRADO** |
| **Carteras & Propiedades** | `/app/propiedades/page.tsx` | `Portfolio`, `Property`, `property-service.ts` | `tests/cus01-acceptance.test.ts` (TC-02, 08) | **ENTREGADO Y DEMOSTRADO** |
| **Contratos & Sin Traslapes** | `/app/rentas/page.tsx`, `draftLease` | `Lease`, `lease-service.ts` | `tests/cus01-acceptance.test.ts` (TC-07) | **ENTREGADO Y DEMOSTRADO** |
| **Generación de Rentas (Idempotente)** | `generateMonthlyRentChargesAction` | `Charge`, `charge-service.ts` | `tests/cus02-canonical.test.ts` (TC-02-09) | **ENTREGADO Y DEMOSTRADO** |
| **Cobro & Partida Doble ($\Sigma D = \Sigma C$)** | `recordPaymentAction`, `confirmPaymentAction` | `Payment`, `accounting-service.ts` | `tests/cus02-canonical.test.ts` (TC-02-08) | **ENTREGADO Y DEMOSTRADO** |
| **Liquidación Explicable ($14,500 Base)** | `createSettlementProposalAction` | `SettlementProposal`, `settlement-service.ts` | `tests/cus02-canonical.test.ts` (TC-02-BASE) | **ENTREGADO Y DEMOSTRADO** |
| **Webhooks Durables (Deduplicación)** | `/app/api/webhooks/tenant/route.ts` | `WebhookEvent`, `webhook-service.ts` | `tests/cus03-cus04-acceptance.test.ts` (TC-01) | **ENTREGADO Y DEMOSTRADO** |
| **Recibos con Folio & Disclaimer** | `generateReceiptAction` | `Receipt`, `receipt-service.ts` | `tests/cus03-cus04-acceptance.test.ts` (TC-02) | **ENTREGADO Y DEMOSTRADO** |
| **Conciliación Bancaria (Matching)** | `confirmBankMatchAction` | `BankStatementLine`, `bank-reconciliation-service.ts` | `tests/cus03-cus04-acceptance.test.ts` (TC-03) | **ENTREGADO Y DEMOSTRADO** |
| **Contratos & Firma Digital Operativa** | `createContractDocumentAction`, `completeSignatureAction` | `ContractDocument`, `contract-lifecycle-service.ts` | `tests/cus03-cus04-acceptance.test.ts` (TC-01..02) | **ENTREGADO Y DEMOSTRADO** |
| **Inspecciones (Move-In/Move-Out Diff)** | `createInspectionAction` | `Inspection`, `inspection-service.ts` | `tests/cus03-cus04-acceptance.test.ts` (TC-03) | **ENTREGADO Y DEMOSTRADO** |
| **Mantenimiento & Presupuestos (Anti-Conflicto)** | `createWorkOrderAction`, `approveQuoteAction` | `WorkOrderQuote`, `maintenance-service.ts` | `tests/cus05-cus06-acceptance.test.ts` (TC-01..03, 05) | **ENTREGADO Y DEMOSTRADO** |
| **Activos & Mantenimiento Preventivo** | `createAssetAction` | `UnitAsset`, `asset-management-service.ts` | `tests/cus05-cus06-acceptance.test.ts` (TC-06) | **ENTREGADO Y DEMOSTRADO** |
| **Delegación de Pases a Alddea** | `prepareAlddeaPassAction` | `AlddeaPassDelegation`, `alddea-delegation-service.ts` | `tests/cus05-cus06-acceptance.test.ts` (TC-04) | **MOCK SEGURO** |
| **Comunicación Aislada por Audiencias** | `createThreadAction`, `postMessageAction` | `CommunicationThread`, `communication-service.ts` | `tests/cus05-cus06-acceptance.test.ts` (TC-01) | **ENTREGADO Y DEMOSTRADO** |
| **Cierre Mensual Auditado (Bloqueo)** | `executeMonthlyClosingAction`, `reopenMonthlyClosingAction` | `MonthlyClosing`, `monthly-closing-service.ts` | `tests/cus07-cus08-acceptance.test.ts` (TC-01..02) | **ENTREGADO Y DEMOSTRADO** |
| **Entitlements SaaS en Servidor** | `assertCanAddProperty` | `entitlement-service.ts` | `tests/cus07-cus08-acceptance.test.ts` (TC-01) | **ENTREGADO Y DEMOSTRADO** |
| **Notificaciones Internas con Dedupe** | `sendNotificationAction` | `InternalNotification`, `notification-service.ts` | `tests/cus07-cus08-acceptance.test.ts` (TC-02) | **ENTREGADO Y DEMOSTRADO** |

---

## 3. Disclaimers y Delimitaciones Legales / Fiscales

1. **Recibos de Cobranza:** Se emiten con serie consecutiva única y snapshot inmutable en formato **HTML imprimible**. Llevan la leyenda expresa: *"Comprobante interno de pago sin validez fiscal (No deducible / No CFDI)"*.
2. **Firma Electrónica:** Opera bajo el estándar de consentimiento electrónico del Código de Comercio (Art. 89). No sustituye la constancia de conservación de datos NOM-151 provista por un PSC autorizado.
3. **Pases de Alddea:** Operan bajo modo Mock (`isMock: true`). No se emiten accesos directos sin un acuerdo de integración bilateral con la plataforma de seguridad.
4. **Bóveda de Seguridad:** Las claves de acceso están cifradas a nivel de aplicación y jamás son expuestas en tickets de soporte, presupuestos ni mensajes.
