# 📖 RUNBOOKS OPERACIONALES Y PLANES DE CONTINGENCIA (CUSTODIA)

Este documento detalla los procedimientos de respuesta ante incidentes operativos para administradores y soporte técnico de Custodia.

---

## 1. Runbook: Pago Mal Aplicado o Erróneo
- **Síntoma:** Un pago confirmado fue aplicado a un cargo incorrecto o por un importe excedente.
- **Impacto:** Distorsiona la cuenta por cobrar (AR) del inquilino y la liquidación del propietario.
- **Procedimiento de Mitigación:**
  1. No eliminar el registro de pago (integridad del libro de bancos).
  2. Ejecutar la reversión de aplicación vía Server Action `reversePaymentApplication`.
  3. Esto genera un asiento inverso en el Ledger (`JournalEntry`) acreditando la cuenta de saldos a favor del inquilino.
  4. Re-aplicar el pago al cargo correcto usando `applyPaymentAction`.
  5. Si el recibo ya había sido emitido, emitir una nota de ajuste referenciando el folio original.

---

## 2. Runbook: Webhook Externo Perdido o No Recibido
- **Síntoma:** El inquilino pagó en pasarela pero el contrato no refleja el pago.
- **Impacto:** El inquilino aparece moroso incorrectamente.
- **Procedimiento de Mitigación:**
  1. Consultar el panel de Stripe/pasarela externa para obtener el `PaymentIntent ID` (ej. `pi_3...`).
  2. Disparar el reenvío del evento desde la pasarela hacia `/api/webhooks/tenant`.
  3. Si la pasarela está inaccesible, el administrador puede usar `recordPaymentAction` con método `STRIPE` y referencia `pi_3...`.
  4. La restricción de unicidad `@@unique([tenantId, provider, externalId])` en `WebhookEvent` garantiza que si el webhook llega después, será detectado como duplicado (`IGNORED_DUPLICATE`) sin duplicar fondos en el ledger.

---

## 3. Runbook: Conciliación Incompleta o Movimiento Bancario No Emparejado
- **Síntoma:** Un extracto CSV bancario tiene movimientos en estado `UNMATCHED`.
- **Impacto:** El periodo no puede cerrarse limpiamente sin declarar discrepancias.
- **Procedimiento de Mitigación:**
  1. En `/rentas` o panel financiero, revisar las propuestas de fuzzy matching generadas por `bankReconciliationService.proposeMatches`.
  2. Si el movimiento corresponde a un pago ya reportado pero con referencia con error tipográfico, usar `confirmBankMatchAction` asociando manualmente los IDs.
  3. Si corresponde a un abono desconocido (depósito en ventanilla sin identificar), mantener la línea bancaria en estado `UNMATCHED` y clasificarla en el balance como "Fondos por Identificar".

---

## 4. Runbook: Revocación Inmediata de Permisos a Miembro del Equipo
- **Síntoma:** Un administrador de cartera o staff causa baja o es suspendido.
- **Impacto:** Riesgo de acceso no autorizado a contratos o finanzas de propiedades.
- **Procedimiento de Mitigación:**
  1. Modificar el estado del registro `TenantMember` a `REVOKED` o `SUSPENDED`.
  2. El middleware y `membership-guard.ts` evalúan el estado de la membresía en la base de datos en cada Server Action (`resolveMembershipContext`).
  3. Cualquier mutación o consulta protegida subsecuente es rechazada inmediatamente con error: *"Membresía no activa en esta organización"*, aún si el token de sesión sigue vivo en el navegador.

---

## 5. Runbook: Cierre Mensual Erróneo y Reapertura Justificada
- **Síntoma:** Se ejecutó el cierre mensual pero se omitió registrar una factura o gasto de mantenimiento.
- **Impacto:** El periodo está en estado `CLOSED`, impidiendo asientos retroactivos.
- **Procedimiento de Mitigación:**
  1. El Administrador Principal debe invocar `reopenMonthlyClosingAction` indicando el motivo por escrito (mínimo 5 caracteres).
  2. El sistema actualiza el estado a `REOPENED` y guarda la bitácora con `reopenedById`, timestamp y motivo.
  3. Asentar los ajustes contables faltantes.
  4. Volver a ejecutar el cierre mensual mediante `executeMonthlyClosingAction`. Se genera una nueva versión inmutable del snapshot financiero.

---

## 6. Procedimiento de Respaldo y Restauración de Base de Datos
- **Entorno:** PostgreSQL en Supabase.
- **Generación de DDL y Esquema:** `scripts/clean-mount-supabase.ts` (sin DROP CASCADE destructivo en producción).
- **Extracción de Dump:**
  ```powershell
  # Respaldo de estructura y datos
  pg_dump -d "$DATABASE_URL" --format=custom --file="backup_custodia_$(Get-Date -Format yyyyMMdd).dump"
  ```
- **Restauración:**
  ```powershell
  # Restauración en esquema aislado
  pg_restore -d "$DATABASE_URL" --clean --if-exists backup_custodia_YYYYMMDD.dump
  ```
