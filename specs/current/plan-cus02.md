# PLAN TÉCNICO Y ARQUITECTURA CUS-02
## Motor Financiero de Custodia

### 1. Modelo de Datos y Esquema Prisma (Aditivo)
Reutilizaremos la estructura existente de Prisma e incorporaremos los modelos contables sin alterar destructivamente `Transaction` histórico:

1. **`Account` / `LedgerAccount`**:
   - `id`: UUID
   - `tenantId`: String (Aislamiento multi-tenant estricto)
   - `code`: String (`1000_CASH_PM_ESCROW`, `1010_CASH_DIRECT_OWNER`, `1100_ACCOUNTS_RECEIVABLE_RENTER`, `2000_SECURITY_DEPOSITS_LIABILITY`, `2100_OWNER_FUNDS_PAYABLE`, `4000_PM_COMMISSION_REVENUE`, `5000_MAINTENANCE_EXPENSE`)
   - `name`: String
   - `type`: Enum (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`)
   - `currency`: String (`MXN`, `USD`)

2. **`JournalEntry` (Asiento de Doble Partida)**:
   - `id`: UUID
   - `tenantId`: String
   - `entryNumber`: Serial / Secuencial trazable
   - `idempotencyKey`: String (Unique por tenant)
   - `effectiveDate`: DateTime
   - `description`: String
   - `status`: Enum (`POSTED`, `REVERSED`)
   - `reversedById`: String? (Referencia al asiento inverso)
   - `createdById`: String

3. **`JournalLine` (Línea de Asiento)**:
   - `id`: UUID
   - `entryId`: String
   - `accountId`: String
   - `debit`: Decimal (Precision 18, Scale 2)
   - `credit`: Decimal (Precision 18, Scale 2)
   - `propertyId`: String? (Dimensión de inmueble)
   - `unitId`: String? (Dimensión de unidad)
   - `ownerId`: String? (Dimensión de propietario beneficiario)
   - `leaseId`: String? (Dimensión de contrato)

4. **`Charge` (Obligación / Cargo Exigible)**:
   - `id`: UUID
   - `tenantId`: String
   - `leaseId`: String
   - `propertyId`: String
   - `concept`: String
   - `type`: Enum (`RENT`, `MAINTENANCE_FEE`, `LATE_FEE`, `SECURITY_DEPOSIT`, `UTILITY`, `OTHER`)
   - `amount`: Decimal
   - `currency`: String
   - `dueDate`: DateTime
   - `periodMonth`: Int
   - `periodYear`: Int
   - `status`: Enum (`PENDING`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`)
   - `amountPaid`: Decimal @default(0)

5. **`Payment` (Recepción de Fondos)**:
   - `id`: UUID
   - `tenantId`: String
   - `leaseId`: String?
   - `payerName`: String
   - `amount`: Decimal
   - `currency`: String
   - `status`: Enum (`REPORTED`, `CONFIRMED`, `CLEARED`, `REVERSED`)
   - `method`: Enum (`TRANSFER`, `CASH`, `CARD`, `STRIPE`, `OTHER`)
   - `reference`: String?
   - `receiptUrl`: String?
   - `confirmedAt`: DateTime?
   - `confirmedById`: String?

6. **`PaymentApplication` (Aplicación Pago a Cargo)**:
   - `id`: UUID
   - `paymentId`: String
   - `chargeId`: String
   - `amountApplied`: Decimal
   - `appliedAt`: DateTime @default(now())

7. **`ManagementAgreement` (Acuerdo de Honorarios y Comisiones)**:
   - `id`: UUID
   - `tenantId`: String
   - `propertyId`: String?
   - `portfolioId`: String?
   - `commissionType`: Enum (`PERCENTAGE_RENT`, `FIXED_FEE`, `HYBRID`)
   - `commissionRate`: Decimal (ej. 0.1000 para 10%)
   - `fixedFeeAmount`: Decimal?
   - `commissionBase`: Enum (`COLLECTED`, `ACCRUED`)
   - `reserveMinimum`: Decimal @default(0)
   - `effectiveFrom`: DateTime
   - `effectiveTo`: DateTime?

8. **`SettlementProposal` (Propuesta de Liquidación a Propietario)**:
   - `id`: UUID
   - `tenantId`: String
   - `ownerId`: String
   - `propertyId`: String?
   - `periodStart`: DateTime
   - `periodEnd`: DateTime
   - `grossCollected`: Decimal
   - `expensesDeducted`: Decimal
   - `commissionDeducted`: Decimal
   - `reserveRetained`: Decimal
   - `netPayable`: Decimal
   - `status`: Enum (`DRAFT`, `APPROVED`, `EXECUTED`, `CANCELLED`)
   - `approvedById`: String?
   - `executedAt`: DateTime?

---

### 2. Matriz de Riesgos y Mitigaciones
| Riesgo Financiero | Vector de Ataque / Error | Mitigación Técnica |
| :--- | :--- | :--- |
| Asientos desbalanceados | Error en lógica o redondeo | Check estricto en transacción: `SUM(debits) === SUM(credits)`. Si difiere > 0.0001, abortar con rollback total. |
| Duplicación de cobros | Doble click o reintento de cron | Clave de idempotencia única `[leaseId, periodMonth, periodYear, type]`. |
| Aplicación concurrente | Dos usuarios aplican el mismo pago | Bloqueo o verificación de balance residual `payment.amount - sum(applied) >= requested`. |
| Dispersión doble de fondos | Dos liquidaciones para el mismo periodo | Bloqueo atómico del monto propuesto con estado `DRAFT` y validación de disponible en tiempo real. |
| Confusión de custodio | PM liquida dinero cobrado directamente por el dueño | Validación estricta del campo `fundCustodian`: Si es `DIRECT_OWNER`, el disponible en custodia PM es estrictamente 0. |

---

### 3. Fases de Implementación (CUS-02A / CUS-02B / CUS-02C)
- **CUS-02A:** Motor contable base de partida doble, generador de cargos y rentas periódicas, prorrateos y notas de crédito.
- **CUS-02B:** Registro de pagos, comprobantes sintéticos, aplicaciones atómicas N:M, saldo a favor y gestión de depósitos en garantía.
- **CUS-02C:** Acuerdos de comisión dinámicos, cálculo riguroso del disponible, liquidaciones de propietarios y conciliación de saldos.
