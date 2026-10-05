# ESPECIFICACIÓN TÉCNICA CUS-02 (SDD)
## Motor Financiero de Rentas, Depósitos, Comisiones y Liquidaciones Explicables

### 1. Invariantes del Sistema Financiero
1. **Conservación de la Moneda:** En todo asiento contable (`JournalEntry`), la suma exacta de Débitos es igual a la suma de Créditos (`Σ Debits = Σ Credits`) por moneda.
2. **Inmutabilidad Contable:** Un asiento confirmado (`POSTED`) jamás puede modificarse ni eliminarse. Se corrige únicamente mediante un asiento inverso (`REVERSED`) con referencia cruzada.
3. **No Co-mezcla de Depósitos:** Los depósitos en garantía se registran como pasivos fiduciarios (`LIABILITY_DEPOSIT`) y están estrictamente prohibidos de computarse como dinero distribuible al propietario.
4. **Disponibilidad Real Explicable:** El dinero liquidable a un beneficiario se calcula estrictamente como:
   `Disponible = (Cobros Efectivos en Custodia PM) - (Gastos Pagados) - (Comisiones Contractuales) - (Reservas Mínimas Retenidas) - (Liquidaciones Previas Comprometidas o Pagadas)`.
   Está terminantemente prohibido calcular el disponible sumando ingresos menos egresos globales sin segmentar custodia ni beneficiario.
5. **No Cobros Fantasma en Cobranza Directa:** Si una unidad tiene custodia `DIRECT_OWNER`, el PM registra el devengo y la recepción informativa, pero **no** contabiliza dinero en las cuentas de caja/banco del PM ni genera una propuesta de liquidación bancaria de esos fondos.

---

### 2. Desglose de Entidades y Estados

#### A. Ciclo de Cargos y Obligaciones (`Charge`)
- **Estados:** `PENDING` (Exigible), `PARTIALLY_PAID` (Parcialmente pagado), `PAID` (Cubierto al 100%), `OVERPAID` (Excedente a favor), `CANCELLED` (Anulado con nota de crédito).
- **Tipos de Cargo:** `RENT` (Renta ordinaria periódica), `MAINTENANCE_FEE` (Cuota de mantenimiento), `LATE_FEE` (Interés o penalización moratoria), `DAMAGE_CHARGE` (Cargo por desperfectos), `SECURITY_DEPOSIT` (Exigibilidad de depósito inicial).
- **Idempotencia:** La clave compuesta `[leaseId, periodMonth, periodYear, chargeType]` garantiza que múltiples ejecuciones del cron de facturación no dupliquen la renta del mes.

#### B. Pagos y Aplicaciones (`Payment` y `PaymentApplication`)
- **Estados de Pago:**
  - `REPORTED`: El inquilino subió un comprobante; es informativo y **no** genera dinero contable disponible.
  - `CONFIRMED`: El administrador o sistema bancario validó el ingreso de fondos reales.
  - `CLEARED`: Fondos liberados y conciliados en el extracto bancario.
  - `REVERSED`: Pago devuelto o desconocido por el banco.
- **Aplicación N:M:** Un pago confirmado puede aplicarse a múltiples cargos pendientes. Si el pago supera las obligaciones exigibles, el excedente se almacena como saldo a favor (`CREDIT_BALANCE`) del contrato/inquilino.

#### C. Acuerdos de Administración y Comisiones (`ManagementAgreement`)
- Define para cada propiedad/cartera:
  - Tipo de comisión: `PERCENTAGE_RENT` (% de renta cobrada), `FIXED_FEE` (Monto fijo), `HYBRID`.
  - Regla de base: `COLLECTED` (Solo sobre renta efectivamente cobrada) vs. `ACCRUED` (Sobre renta devengada).
  - Reserva mínima operativa (`reserveMinimum`): Fondo de reserva que el propietario debe mantener en cuenta antes de poder recibir dispersiones.
  - Copropiedad: Cuotas porcentuales entre múltiples dueños con algoritmo de reparto que asigna el centavo residual al copropietario mayoritario.

#### D. Propuestas de Liquidación (`SettlementProposal`)
- **Estados:** `DRAFT` (Borrador de cálculo), `APPROVED` (Aprobada por PM_ADMIN), `EXECUTED` (Fondos transferidos y marcados con referencia bancaria), `CANCELLED`.
- Congela atómicamente el monto propuesto para evitar que dos administradores liquiden simultáneamente el mismo saldo disponible.
