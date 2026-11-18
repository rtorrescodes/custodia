# Custodia Handoff — CUS-09C: Entrega Demostrable de Operación Diaria

## 1. Objetivo y Alcance
Cierre definitivo e implementación de la suite de operación diaria demostrable (**CUS-09C**), construida sobre la base comprobada de `feature/cus-09c-daily-operations`:

1. **Separación de Aprobación vs. Financiamiento**:
   - El propietario puede aprobar formalmente cotizaciones aun cuando no existan fondos suficientes en custodia.
   - El sistema transiciona la cotización a `APPROVED`, marca la orden de trabajo como `"Aprobada, pendiente de fondos"` y deriva automáticamente la solicitud de aportación (`OwnerContribution`) sin bloquear la soberanía del propietario.
2. **Efecto Financiero Completo en Pagos (`recordVendorPaymentAction`)**:
   - Liquidación a proveedores con soporte para pagos parciales (anticipos) y finiquitos.
   - Consumo del propio compromiso de la orden sin doble deducción de saldo disponible ni falsos bloqueos.
   - Respeto a modalidades de custodia (`PM_ESCROW` vs `DIRECT_OWNER`) y no mezcla de monedas.
3. **Recorrido Completo de Tareas y Personal Operativo**:
   - Máquina de estados completa para operarios/staff (`ASSIGNED` -> `IN_PROGRESS` -> `BLOCKED` con motivo obligatorio -> `VERIFICATION_PENDING` con evidencias -> `COMPLETED` o devolución con observaciones por el PM).
   - Aislamiento Zero-Trust: El personal asignado solo recibe la información operativa necesaria sin exponer secretos maestros de la bóveda.
4. **Llegadas Preparadas y Casa Desocupada**:
   - Checklist de preparación estricto; estado "Lista" solo se deriva cuando todos los ítems obligatorios están satisfechos.
   - Cancelación de estadías con anulación de pases y reversión.
   - `Property.lastCareVisitAt` se actualiza **únicamente** cuando una visita preventiva de cuidado se completa y verifica de forma efectiva.
5. **Ciclo de Contrato y Obligaciones Recurrentes**:
   - Renovación versionada de contratos de arrendamiento (`renewLeaseAction`).
   - Salida (move-out) con inspección y liquidación humana de depósito en garantía (`processMoveOutWithDepositReviewAction`).
   - Generación periódica idempotente de tareas para obligaciones recurrentes (`executeRecurringObligationAction`).
6. **Informe de Valor y Deduplicación Persistente de Traducciones**:
   - Generación de informe operativo de valor bilingüe para el propietario (`generateOwnerPerformanceReportAction`), diferenciado del estado de cuenta.
   - Deduplicación atómica persistente en base de datos (`TranslationRecord`) con hash SHA256 (`sourceHash`).
7. **Entrega Formal de Administración (Handoff)**:
   - `executePropertyHandoffAction`: Reasignación del administrador principal, transferencia de tareas operativas pendientes, marcado obligatorio de rotación física de credenciales y generación de acta formal.

## 2. Estado de Base de Datos y Persistencia
- **Modelo Aditivo Sincronizado**: `TranslationRecord` con `@unique([sourceHash])` en Supabase de desarrollo.
- **Cliente Prisma**: Regenerado exitosamente vía `npx prisma generate`.

## 3. Pruebas y Comprobación Física
- **Compilación Limpia**: `npm run build` ejecutado en Next.js Turbopack: 17 rutas analizadas, 0 errores de TypeScript y 0 advertencias bloqueantes.
- **Suite CUS-09C (`tests/cus09c-acceptance.test.ts`)**: 7 de 7 recorridos demostrables aprobados:
  - `R1`: Aprobación sin fondos y derivación de aportación.
  - `R2`: Pago parcial y consumo de compromisos sin doble descuento.
  - `R3`: Ciclo de vida completo del personal operativo con bloqueo obligatorio y verificación.
  - `R4`: Llegadas de dueño con checklist e inspección preventiva condicional.
  - `R5`: Renovación versionada, move-out con liquidación humana de depósito y obligaciones periódicas idempotentes.
  - `R6`: Informe de valor y deduplicación persistente SHA256.
  - `R7`: Entrega de administración con rotación obligatoria de credenciales.
- **Suites de No Regresión**:
  - `tests/cus09b-acceptance.test.ts`: 6 de 6 pruebas aprobadas.
  - `tests/cus09-acceptance.test.ts`: 11 de 11 pruebas aprobadas.

## 4. Instrucciones para Revisión en Local
1. Servidor activo en `http://localhost:3000`.
2. Probar la aprobación soberana del dueño en `/portal` o `/propiedades/[id]` con fondos insuficientes.
3. Verificar el resumen de valor y expediente de entrega en `/propiedades/[id]`.
4. Ejecutar la suite integral de verificación:
   `npx tsx tests/cus09c-acceptance.test.ts`

