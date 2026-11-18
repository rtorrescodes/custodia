-- CUS-02 Financial Engine & Trust Accounting Migration (Additive)

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "EntryStatus" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "ChargeType" AS ENUM ('RENT', 'MAINTENANCE_FEE', 'LATE_FEE', 'SECURITY_DEPOSIT', 'UTILITY', 'OTHER');
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('REPORTED', 'CONFIRMED', 'CLEARED', 'REVERSED');
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CASH', 'CARD', 'STRIPE', 'OTHER');
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE_RENT', 'FIXED_FEE', 'HYBRID');
CREATE TYPE "CommissionBase" AS ENUM ('COLLECTED', 'ACCRUED');
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'APPROVED', 'EXECUTED', 'CANCELLED');

-- 1. Ledger Accounts
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerAccount_tenantId_code_key" ON "LedgerAccount"("tenantId", "code");
CREATE INDEX "LedgerAccount_tenantId_type_idx" ON "LedgerAccount"("tenantId", "type");
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Journal Entries
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'POSTED',
    "reversedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalEntry_tenantId_idempotencyKey_key" ON "JournalEntry"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "JournalEntry_reversedById_key" ON "JournalEntry"("reversedById");
CREATE INDEX "JournalEntry_tenantId_effectiveDate_idx" ON "JournalEntry"("tenantId", "effectiveDate");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Journal Lines
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "credit" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "propertyId" TEXT,
    "leaseId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX "JournalLine_propertyId_idx" ON "JournalLine"("propertyId");
CREATE INDEX "JournalLine_ownerId_idx" ON "JournalLine"("ownerId");

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Charges
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "type" "ChargeType" NOT NULL DEFAULT 'RENT',
    "amount" NUMERIC(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "amountPaid" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Charge_leaseId_periodYear_periodMonth_type_key" ON "Charge"("leaseId", "periodYear", "periodMonth", "type");
CREATE INDEX "Charge_tenantId_status_idx" ON "Charge"("tenantId", "status");
CREATE INDEX "Charge_propertyId_idx" ON "Charge"("propertyId");

ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Payments
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leaseId" TEXT,
    "payerName" TEXT NOT NULL,
    "amount" NUMERIC(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'REPORTED',
    "method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFER',
    "reference" TEXT,
    "receiptUrl" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Payment_tenantId_status_idx" ON "Payment"("tenantId", "status");
CREATE INDEX "Payment_leaseId_idx" ON "Payment"("leaseId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Payment Applications
CREATE TABLE "PaymentApplication" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountApplied" NUMERIC(18,2) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentApplication_paymentId_idx" ON "PaymentApplication"("paymentId");
CREATE INDEX "PaymentApplication_chargeId_idx" ON "PaymentApplication"("chargeId");
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentApplication" ADD CONSTRAINT "PaymentApplication_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Management Agreements
CREATE TABLE "ManagementAgreement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT,
    "portfolioId" TEXT,
    "commissionType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE_RENT',
    "commissionRate" NUMERIC(5,4) NOT NULL DEFAULT 0.1000,
    "fixedFeeAmount" NUMERIC(18,2),
    "commissionBase" "CommissionBase" NOT NULL DEFAULT 'COLLECTED',
    "reserveMinimum" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagementAgreement_tenantId_idx" ON "ManagementAgreement"("tenantId");
CREATE INDEX "ManagementAgreement_propertyId_idx" ON "ManagementAgreement"("propertyId");
ALTER TABLE "ManagementAgreement" ADD CONSTRAINT "ManagementAgreement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManagementAgreement" ADD CONSTRAINT "ManagementAgreement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Settlement Proposals
CREATE TABLE "SettlementProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "propertyId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossCollected" NUMERIC(18,2) NOT NULL,
    "expensesDeducted" NUMERIC(18,2) NOT NULL,
    "commissionDeducted" NUMERIC(18,2) NOT NULL,
    "reserveRetained" NUMERIC(18,2) NOT NULL,
    "netPayable" NUMERIC(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SettlementProposal_tenantId_status_idx" ON "SettlementProposal"("tenantId", "status");
CREATE INDEX "SettlementProposal_ownerId_idx" ON "SettlementProposal"("ownerId");
ALTER TABLE "SettlementProposal" ADD CONSTRAINT "SettlementProposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementProposal" ADD CONSTRAINT "SettlementProposal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SettlementProposal" ADD CONSTRAINT "SettlementProposal_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
