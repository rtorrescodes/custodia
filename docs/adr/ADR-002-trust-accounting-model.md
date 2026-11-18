# ADR-002: Modelo de Contabilidad Fiduciaria, Fondos Administrados y Cobros Directos

## Estado
Aprobado (CUS-02)

## Contexto
Custodia opera tanto para caseros independientes (dueños directos) como para empresas de Property Management (PM) que gestionan propiedades de terceros.
En la gestión inmobiliaria existen dos modalidades operativas críticas de cobranza y custodia de fondos:
1. **Cobranza Administrada (PM Escrow):** El inquilino paga a la cuenta concentradora del Property Manager. El PM deduce comisiones contractuales y gastos de mantenimiento autorizados, aparta reservas operativas o depósitos en garantía, y dispersa el remanente disponible al propietario mediante una propuesta de liquidación formal.
2. **Cobranza Directa (Direct to Owner):** El inquilino paga directamente a la cuenta bancaria del propietario. El PM registra el devengo y la confirmación del pago para control de mora y cobranza, pero los fondos **nunca ingresan a las cuentas bancarias del PM**. Por lo tanto, el PM no puede liquidar un dinero que no mantiene en custodia, y la comisión del PM se convierte en una cuenta por cobrar hacia el propietario (facturación de honorarios), no una retención en origen.

Adicionalmente, el sistema **no constituye por sí mismo un fideicomiso legal formal ni certifica cumplimiento tributario o fiscal universal**, sino que implementa una disciplina contable de doble partida (Double-Entry Bookkeeping) inmutable para garantizar que cada peso sea explicable y auditable.

## Decisiones de Arquitectura

1. **Separación de Conceptos Operativos y Contables:**
   - **Obligación / Cargo (Charge):** El monto exigible al inquilino derivado de un contrato de arrendamiento (renta periódica, servicios, penalización).
   - **Pago Recibido (Payment):** Registro de fondos captados junto con su método y referencia.
   - **Aplicación (PaymentApplication):** El vínculo N:M entre un pago recibido y una o varias obligaciones exigibles.
   - **Depósito en Garantía (Security Deposit):** Pasivo custodio que no constituye ingreso ordinario ni dinero distribuible al propietario.
   - **Reserva de Fondo Operativo:** Dinero del propietario restringido temporalmente para contingencias o mantenimiento.
   - **Asiento Contable (JournalEntry & LedgerLine):** Registro inmutable de doble partida balanceado por moneda (Débitos = Créditos) con clave de idempotencia y fecha efectiva.

2. **Tipos de Custodia de Fondos (`FundCustodian`):**
   - `LANDLORD`: El propio casero recibe y custodia los fondos de sus propiedades.
   - `PM_ESCROW`: El PM recibe los fondos en su cuenta concentradora fiduciaria y administra la dispersión.
   - `DIRECT_OWNER`: El propietario recibe el dinero directamente del inquilino; el PM no concilia banco sobre estos fondos.
   - `UNDETERMINED`: Propiedades históricas sin evidencia que requieren revisión manual antes de permitir dispersiones.

3. **Inmutabilidad y Correcciones:**
   - Prohibido el borrado destructivo (`DELETE`) o actualización in situ (`UPDATE`) de asientos contables confirmados.
   - Toda corrección se efectúa mediante un contra-asiento (reverso) y un nuevo asiento correctivo trazable.

4. **Precisión Numérica:**
   - Todos los cálculos monetarios utilizan tipos `Decimal` (Prisma) o enteros en centavos (para operaciones en memoria), evitando conversiones a `Number` de JavaScript de punto flotante que causen pérdidas de precisión o discrepancias de centavos.
   - Redondeo explícito bancario y manejo transparente de residuos en copropiedades.

## Consecuencias
- Cero discrepancias entre balances y asientos.
- Cada peso en el portal del propietario tiene una trazabilidad matemática exacta hacia cargos, pagos, deducciones y reservas.
- Claridad jurídica y fiduciaria ante auditorías entre PMs y dueños de inmuebles.
