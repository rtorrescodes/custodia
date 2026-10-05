import 'dotenv/config';
import { Pool } from 'pg';

async function seedDirect() {
  console.log("Iniciando seed directo a Supabase...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Tenant
    const tenantRes = await pool.query(`
      INSERT INTO "Tenant" (id, name, "countryCode", currency, timezone, "operatingMode", "updatedAt")
      VALUES (gen_random_uuid(), 'Zirian Property Management', 'MX', 'MXN', 'America/Mexico_City', 'PROPERTY_MANAGER', NOW())
      RETURNING id, name;
    `);
    const tenant = tenantRes.rows[0];
    console.log(`✅ Tenant creado: ${tenant.name} (${tenant.id})`);

    // 2. User
    const userRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'rodrigo@zirian.com', 'handled_by_supabase', 'SUPER_ADMIN', false, NOW())
      RETURNING id, email;
    `, [tenant.id]);
    const user = userRes.rows[0];
    console.log(`✅ User creado: ${user.email} (${user.id})`);

    // 3. Portfolio
    const portRes = await pool.query(`
      INSERT INTO "Portfolio" (id, "tenantId", name, description, "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Cartera General', 'Cartera residencial principal', NOW())
      RETURNING id;
    `, [tenant.id]);
    const portfolioId = portRes.rows[0].id;
    console.log(`✅ Portfolio creado: Cartera General (${portfolioId})`);

    // 4. TenantMember
    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PM_ADMIN', 'ACTIVE', NOW());
    `, [tenant.id, user.id]);
    console.log(`✅ Membresía PM_ADMIN activa vinculada.`);

    // 5. Properties
    const prop1Res = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "portfolioId", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Torre Marena PH2', 'Blvd. Kukulcan Km 10, Cancun', 'THIRD_PARTY', 'PM_ESCROW', $2, NOW())
      RETURNING id, name;
    `, [tenant.id, portfolioId]);

    const prop2Res = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "portfolioId", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Residencial Aurora 4B', 'Av. Las Torres 123, Monterrey', 'THIRD_PARTY', 'PM_ESCROW', $2, NOW())
      RETURNING id, name;
    `, [tenant.id, portfolioId]);

    console.log(`✅ Propiedades creadas: ${prop1Res.rows[0].name}, ${prop2Res.rows[0].name}`);

    // 6. Work Orders
    await pool.query(`
      INSERT INTO "WorkOrder" (id, "tenantId", "propertyId", title, description, status, "updatedAt")
      VALUES 
        (gen_random_uuid(), $1, $2, 'Inspección estructural', 'Revisión periódica de pilares principales.', 'PENDING', NOW()),
        (gen_random_uuid(), $1, $3, 'Cambio de luminarias', 'Sustitución de luces LED en pasillos.', 'IN_PROGRESS', NOW());
    `, [tenant.id, prop1Res.rows[0].id, prop2Res.rows[0].id]);

    // 7. Transactions
    await pool.query(`
      INSERT INTO "Transaction" (id, "tenantId", "propertyId", amount, currency, type, category, description)
      VALUES 
        (gen_random_uuid(), $1, $2, 15000.00, 'MXN', 'INCOME', 'Mantenimiento', 'Cuota de mantenimiento mensual'),
        (gen_random_uuid(), $1, $3, 4500.00, 'MXN', 'EXPENSE', 'Reparaciones', 'Pago a electricista por luminarias');
    `, [tenant.id, prop1Res.rows[0].id, prop2Res.rows[0].id]);

    const check = await pool.query(`
      SELECT 
        (SELECT count(*) FROM "Tenant") as tenants,
        (SELECT count(*) FROM "User") as users,
        (SELECT count(*) FROM "Property") as properties,
        (SELECT count(*) FROM "TenantMember") as members,
        (SELECT count(*) FROM "Portfolio") as portfolios,
        (SELECT count(*) FROM "WorkOrder") as work_orders,
        (SELECT count(*) FROM "Transaction") as transactions;
    `);
    console.log("🎉 VERIFICACIÓN INTEGRAL DE SEED:", check.rows[0]);
  } catch (err: any) {
    console.error("❌ Error en seedDirect:", err.message);
  } finally {
    await pool.end();
  }
}

seedDirect();
