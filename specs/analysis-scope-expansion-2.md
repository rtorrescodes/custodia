# Análisis de Impacto y Extensibilidad (Scope Expansion - Addendum 2)
**Fecha:** 2026-08-17
**Propósito:** Analizar la expansión de las "Killer Features" (Fases 6 a 12) y las adiciones de la Fase 2 (Pagos/Contratos) frente a la arquitectura actual (Fase 1) y el Addendum 1.

## 1. Análisis de Pagos y Contratos (Expansión Fase 2)
- **Tokenización:** Requerirá que el backend consuma APIs de Stripe (SetupIntents) y almacene `stripeCustomerId` o `paymentMethodId` en Prisma. Esto no rompe la tabla `User` ni `Tenant`, solo añade columnas.
- **Contratos:** Se requerirá un sistema de plantillas. Esto sugiere nuevas tablas `ContractTemplate`, `ContractClause`, y `ContractSignature`. Es una adición 100% aislada que no afecta `Property` ni `WorkOrder`.

## 2. Dependencias de Fases 6 a 12
- **Fase 6 (Historial Verificado):** Es fundamentalmente una capa de agregación (lectura) y exportación. Depende fuertemente de la calidad de datos de `WorkOrder` (Fase 1) y `TenantIntegration` (Fase 5). No requiere alterar esquemas. **(ALTO IMPACTO / BAJO ESFUERZO)**
- **Fase 7 (Llave Digital):** Depende de la API de Alddea. Impacta el modelo `User` introduciendo tokens de acceso temporales relacionados a `WorkOrder`.
- **Fase 8 (Poder de Compra Colectivo):** Requiere que la tabla `Provider` (Fase 1) soporte un nivel "Global" además de "Por Tenant", o un mercado cross-tenant con consentimientos. Esto altera el paradigma multi-tenant RLS estricto para un dominio específico. **(ALTO IMPACTO / ESFUERZO MEDIO)**
- **Fase 9 (Fintech / Factoring):** Depende de una integración externa bancaria. Las transferencias generarán registros en el `Ledger` de la Fase 1. Se debe prever en el modelo financiero una tipología de transacción "adelanto".
- **Fase 10 (Seguros):** Depende del modelo de fotos de `WorkOrder`.
- **Fase 11 y 12:** Reglas de negocio avanzadas que no afectan la arquitectura base de almacenamiento.

## Conclusión
La arquitectura planeada y los esquemas Prisma actuales son suficientemente flexibles. Se documentan dependencias críticas cruzadas. Las Fases 6 y 8 quedan marcadas como "Low Hanging Fruit" (alta prioridad comercial), mientras que la 9 y 10 quedan bloqueadas operativamente hasta cerrar alianzas externas.
