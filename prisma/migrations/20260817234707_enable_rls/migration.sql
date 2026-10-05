-- Habilitar RLS en las tablas principales
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Property" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantIntegration" ENABLE ROW LEVEL SECURITY;

-- Crear políticas basadas en app.current_tenant_id para aislar los datos

CREATE POLICY "tenant_isolation" ON "User" 
FOR ALL USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "Property" 
FOR ALL USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "WorkOrder" 
FOR ALL USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "Transaction" 
FOR ALL USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY "tenant_isolation" ON "TenantIntegration" 
FOR ALL USING ("tenantId" = current_setting('app.current_tenant_id', true));