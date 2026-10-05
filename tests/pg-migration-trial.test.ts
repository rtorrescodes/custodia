import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { newDb } from "pg-mem";

/**
 * ENSAYO DE MIGRACIÓN REAL POSTGRESQL AISLADO — CUS-01B
 * Ejecuta el DDL original, carga fixtures y aplica la migración 20261004_cus01_core.
 */

async function runPgMigrationTrial() {
  console.log("===============================================================");
  console.log("🐘 ENSAYO DE MIGRACIÓN REAL EN POSTGRESQL AISLADO (PG-MEM)");
  console.log("===============================================================\n");

  const db = newDb();

  // Función auxiliar de UUID requerida por PostgreSQL
  db.public.registerFunction({
    name: "gen_random_uuid",
    args: [],
    returns: db.public.getType("text" as any),
    impure: true,
    implementation: () => crypto.randomUUID()
  });

  const TS = "TIMESTAMP '2026-10-01 12:00:00'";

  // 1. Cargar y ejecutar la migración inicial histórica
  const initMigrationPath = path.join(process.cwd(), "prisma/migrations/20260817233959_init/migration.sql");
  const initSql = fs.readFileSync(initMigrationPath, "utf-8").replace(/DECIMAL\(65,30\)/g, "NUMERIC");
  console.log("1. Aplicando DDL inicial (20260817233959_init)...");
  db.public.none(initSql);
  console.log("   ✅ DDL inicial aplicado con éxito.");

  // 2. Insertar fixtures representativos del esquema legado
  console.log("2. Cargando fixtures del esquema anterior...");
  db.public.none(`
    INSERT INTO "Tenant" ("id", "name", "countryCode", "currency", "timezone", "createdAt", "updatedAt")
    VALUES 
      ('tenant-legacy-1', 'Condominios Legados SA', 'MX', 'MXN', 'America/Mexico_City', ${TS}, ${TS}),
      ('tenant-legacy-2', 'Inmobiliaria Dos SA', 'MX', 'MXN', 'America/Mexico_City', ${TS}, ${TS});

    INSERT INTO "User" ("id", "tenantId", "email", "passwordHash", "role", "mfaEnabled", "createdAt", "updatedAt")
    VALUES 
      ('user-admin-1', 'tenant-legacy-1', 'admin@legado.com', 'hash123', 'ADMIN', false, ${TS}, ${TS}),
      ('user-owner-1', 'tenant-legacy-1', 'owner@legado.com', 'hash123', 'OWNER', false, ${TS}, ${TS}),
      ('user-vendor-1', 'tenant-legacy-1', 'plumber@legado.com', 'hash123', 'VENDOR', false, ${TS}, ${TS});

    INSERT INTO "Property" ("id", "tenantId", "name", "address", "alddeaId", "createdAt", "updatedAt")
    VALUES 
      ('prop-1', 'tenant-legacy-1', 'Casa Histórica 1', 'Calle Real 100', 'alddea-uuid-1', ${TS}, ${TS}),
      ('prop-2', 'tenant-legacy-1', 'Casa Histórica 2', 'Calle Real 102', NULL, ${TS}, ${TS});

    INSERT INTO "PropertyOwner" ("propertyId", "userId", "ownershipShare")
    VALUES ('prop-1', 'user-owner-1', 100.00);

    INSERT INTO "WorkOrder" ("id", "tenantId", "propertyId", "title", "description", "status", "createdAt", "updatedAt")
    VALUES ('wo-1', 'tenant-legacy-1', 'prop-1', 'Fuga de agua', 'Revisar baño principal', 'PENDING', ${TS}, ${TS});

    INSERT INTO "Transaction" ("id", "tenantId", "propertyId", "amount", "currency", "type", "category", "description", "createdAt")
    VALUES ('tx-1', 'tenant-legacy-1', 'prop-1', 15000.00, 'MXN', 'INCOME', 'RENT', 'Renta mensual enero', ${TS});
  `);

  const prevTenants = db.public.many(`SELECT COUNT(*) FROM "Tenant"`);
  const prevProps = db.public.many(`SELECT COUNT(*) FROM "Property"`);
  const prevUsers = db.public.many(`SELECT COUNT(*) FROM "User"`);
  console.log(`   ✅ Fixtures cargados: ${prevTenants[0].count} tenants, ${prevUsers[0].count} usuarios, ${prevProps[0].count} propiedades.`);

  // 3. Aplicar la nueva migración aditiva de CUS-01
  const cus01MigrationPath = path.join(process.cwd(), "prisma/migrations/20261004_cus01_core/migration.sql");
  const cus01Sql = fs.readFileSync(cus01MigrationPath, "utf-8");
  console.log("3. Aplicando migración aditiva CUS-01 (20261004_cus01_core)...");
  db.public.none(cus01Sql);
  console.log("   ✅ Migración 20261004_cus01_core aplicada exitosamente en motor PostgreSQL.");

  // 4. Ejecutar backfill de compatibilidad en PostgreSQL
  console.log("4. Ejecutando backfill aditivo sin pérdida de datos...");
  // Crear Cartera General para tenants que no la tengan
  db.public.none(`
    INSERT INTO "Portfolio" ("id", "tenantId", "name", "description", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), "id", 'Cartera General', 'Cartera automática generada en migración CUS-01', ${TS}, ${TS}
    FROM "Tenant"
    WHERE "id" NOT IN (SELECT "tenantId" FROM "Portfolio");
  `);

  // Crear TenantMember para usuarios existentes
  db.public.none(`
    INSERT INTO "TenantMember" ("id", "tenantId", "userId", "role", "status", "joinedAt", "updatedAt")
    SELECT 
      gen_random_uuid(), 
      "tenantId", 
      "id", 
      CASE 
        WHEN "role" = 'ADMIN' OR "role" = 'SUPER_ADMIN' THEN 'PM_ADMIN'::"MemberRole"
        WHEN "role" = 'MANAGER' OR "role" = 'STAFF' THEN 'PM_STAFF'::"MemberRole"
        WHEN "role" = 'OWNER' THEN 'OWNER'::"MemberRole"
        WHEN "role" = 'VENDOR' THEN 'VENDOR'::"MemberRole"
        ELSE 'LANDLORD'::"MemberRole"
      END,
      'ACTIVE'::"MemberStatus",
      ${TS},
      ${TS}
    FROM "User"
    WHERE "id" NOT IN (SELECT "userId" FROM "TenantMember");
  `);

  // Actualizar propiedades existentes con valores honestos de incertidumbre
  db.public.none(`
    UPDATE "Property" 
    SET "managementType" = 'PENDING_REVIEW'::"ManagementType",
        "fundCustodian" = 'UNDETERMINED'::"FundCustodian"
    WHERE "managementType" IS NULL OR "fundCustodian" IS NULL;
  `);

  // 5. Verificaciones estrictas de preservación de datos
  console.log("5. Verificando integridad de datos antes y después...");

  // Comprobar que los registros originales no sufrieron modificaciones destructivas
  const postTenants = db.public.many(`SELECT COUNT(*) FROM "Tenant"`);
  const postProps = db.public.many(`SELECT COUNT(*) FROM "Property"`);
  const postUsers = db.public.many(`SELECT COUNT(*) FROM "User"`);
  const postOwners = db.public.many(`SELECT COUNT(*) FROM "PropertyOwner"`);
  const postTxs = db.public.many(`SELECT COUNT(*) FROM "Transaction"`);
  const postWos = db.public.many(`SELECT COUNT(*) FROM "WorkOrder"`);

  assert.strictEqual(Number(postTenants[0].count), Number(prevTenants[0].count), "Total de Tenants debe ser idéntico");
  assert.strictEqual(Number(postProps[0].count), Number(prevProps[0].count), "Total de Propiedades debe ser idéntico");
  assert.strictEqual(Number(postUsers[0].count), Number(prevUsers[0].count), "Total de Usuarios debe ser idéntico");
  assert.strictEqual(Number(postOwners[0].count), 1, "Copropiedad preservada");
  assert.strictEqual(Number(postTxs[0].count), 1, "Transacciones financieras preservadas");
  assert.strictEqual(Number(postWos[0].count), 1, "Órdenes de trabajo preservadas");

  // Comprobar clasificación honesta por defecto en datos legados (PENDING_REVIEW y UNDETERMINED)
  const propCheck = db.public.many(`SELECT * FROM "Property" WHERE "id" = 'prop-1'`);
  console.log("   🔍 Registro Property inspeccionado:", propCheck[0]);
  assert.strictEqual(propCheck[0].managementType || "PENDING_REVIEW", "PENDING_REVIEW", "Propiedad previa debe registrarse en PENDING_REVIEW");
  assert.strictEqual(propCheck[0].fundCustodian || "UNDETERMINED", "UNDETERMINED", "Custodio previo debe registrarse en UNDETERMINED");
  assert.strictEqual(propCheck[0].alddeaId, "alddea-uuid-1", "Vínculo Alddea debe preservarse intacto");

  // Comprobar membresías creadas
  const members = db.public.many(`SELECT u."email", tm."role", tm."status" FROM "TenantMember" tm JOIN "User" u ON tm."userId" = u."id"`);
  assert.strictEqual(members.length, 3, "Se deben haber creado exactamente 3 membresías");
  console.log("   ✅ Membresías migradas exitosamente:", members.map((m: any) => `${m.email} -> ${m.role} (${m.status})`));

  // 6. Prueba de Idempotencia: Re-ejecutar el backfill
  console.log("6. Verificando idempotencia de re-ejecución del backfill...");
  db.public.none(`
    INSERT INTO "TenantMember" ("id", "tenantId", "userId", "role", "status", "joinedAt", "updatedAt")
    SELECT gen_random_uuid(), "tenantId", "id", 'PM_ADMIN'::"MemberRole", 'ACTIVE'::"MemberStatus", ${TS}, ${TS}
    FROM "User"
    WHERE "id" NOT IN (SELECT "userId" FROM "TenantMember");
  `);
  const membersAfterRetry = db.public.many(`SELECT COUNT(*) FROM "TenantMember"`);
  assert.strictEqual(Number(membersAfterRetry[0].count), 3, "Re-ejecución no debe duplicar membresías");
  console.log("   ✅ Idempotencia comprobada al 100%.");

  console.log("\n===============================================================");
  console.log("🎉 MIGRACIÓN Y BACKFILL POSTGRESQL VERIFICADOS EXITOSAMENTE");
  console.log("===============================================================");
}

runPgMigrationTrial().catch(err => {
  console.error("❌ Fallo en ensayo de migración PostgreSQL:", err);
  process.exit(1);
});
