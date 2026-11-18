# TAREAS Y PRUEBAS CANÓNICAS CUS-02
## Vinculación Directa entre Requerimientos y Pruebas Canónicas

### Incremento CUS-02A: Cuentas, Asientos y Obligaciones
- [ ] **TASK-02A.1:** Actualizar `prisma/schema.prisma` con modelos `LedgerAccount`, `JournalEntry`, `JournalLine`, `Charge`.
- [ ] **TASK-02A.2:** Implementar `AccountingService`: Creación atómica de asientos de partida doble balanceados por moneda, reversos inmutables y consulta de balance por cuenta y dimensión.
- [ ] **TASK-02A.3:** Implementar `ChargeService`: Generador periódico idempotente de cargos de renta, soporte de prorrateo por días de ocupación, notas de crédito y descuentos trazables.
- [ ] **TASK-02A.4:** Pruebas Canónicas A:
  - *TC-02A-01:* Verificación de balance estricto en asientos (Débitos = Créditos) y rechazo de asientos desbalanceados.
  - *TC-02A-02:* Idempotencia del generador periódico (dos ejecuciones generan exactamente 1 cargo por periodo).
  - *TC-02A-03:* Prorrateo contractual exacto y notas de crédito con contra-asiento trazable.

### Incremento CUS-02B: Pagos Registrados, Aplicaciones y Depósitos
- [ ] **TASK-02B.1:** Agregar modelos `Payment`, `PaymentApplication`, `SecurityDeposit` en schema y servicios.
- [ ] **TASK-02B.2:** Implementar `PaymentService`: Registro de pagos en estados `REPORTED`, `CONFIRMED`, `CLEARED`, `REVERSED`.
- [ ] **TASK-02B.3:** Implementar lógica de Aplicación N:M: Distribución de fondos entre múltiples cargos, sobrepagos como saldo a favor y protección contra sobre-aplicación.
- [ ] **TASK-02B.4:** Implementar control fiduciario de depósitos: Registro como pasivo (`LIABILITY_DEPOSIT`), separación absoluta del disponible para el dueño, deducciones con dictamen y devoluciones.
- [ ] **TASK-02B.5:** Pruebas Canónicas B:
  - *TC-02B-01:* Pago reportado sin confirmar no altera saldo disponible en banco.
  - *TC-02B-02:* Dos pagos parciales cubren progresivamente un cargo único.
  - *TC-02B-03:* Sobrepago genera saldo a favor fidedigno.
  - *TC-02B-04:* Dos aplicaciones concurrentes no sobre-aplican el importe disponible del pago.
  - *TC-02B-05:* Depósito en garantía de $20,000 MXN no incrementa el disponible para liquidación al dueño.

### Incremento CUS-02C: Comisiones, Reservas, Conciliación y Liquidaciones
- [ ] **TASK-02C.1:** Modelos `ManagementAgreement` y `SettlementProposal`.
- [ ] **TASK-02C.2:** Implementar `CommissionService`: Cálculo versionado de comisiones (porcentual, fija, mixta) sobre base cobrada o devengada, con desglose para copropietarios y residuo de centavos.
- [ ] **TASK-02C.3:** Implementar `SettlementService`: Cálculo estricto del disponible fiduciario, creación y aprobación de propuestas con congelamiento atómico de fondos y prevención de doble liquidación.
- [ ] **TASK-02C.4:** Implementar conciliación de fondos entre libros, cuentas de custodio y extractos informativos.
- [ ] **TASK-02C.5:** Pruebas Canónicas C:
  - *TC-02C-01 (Caso Base Canónico):* Renta $20,000, Comisión $2,000, Gasto pagado $1,500, Reserva $2,000 -> Disponible exacto = $14,500 MXN. Depósito de $20,000 no suma.
  - *TC-02C-02:* Copropiedad 60/40 con importe de centavos indivisible asigna residuo al copropietario mayoritario.
  - *TC-02C-03:* Cobro directo al propietario (`DIRECT_OWNER`) arroja disponible en custodia PM = 0.
  - *TC-02C-04:* Dos propuestas de liquidación concurrentes no comprometen el mismo saldo.
  - *TC-02C-05:* Reconstrucción fidedigna de cifras y saldos desde el libro mayor de asientos.

### Integración de Experiencia y Portales
- [ ] **TASK-02-EXP.1:** Integrar vista `/rentas` con desglose de exigible, pagado, pendiente y estado de confirmación.
- [ ] **TASK-02-EXP.2:** Integrar vista `/propiedades/[id]` y `/portal` con estado de cuenta fiduciario explicable (saldo inicial, cobros, gastos, comisiones, reserva, disponible y propuesta de liquidación).
