-- CUS-09C: Stable WorkOrder relationship and Idempotent Payment Key on Transaction
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "workOrderId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "paymentKey" TEXT;

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_workOrderId_fkey'
  ) THEN 
    ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_workOrderId_fkey" 
    FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_tenantId_paymentKey_key" ON "Transaction"("tenantId", "paymentKey");
CREATE INDEX IF NOT EXISTS "Transaction_tenantId_workOrderId_idx" ON "Transaction"("tenantId", "workOrderId");
