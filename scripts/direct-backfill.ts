import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const tenantRes = await pool.query('SELECT id FROM "Tenant" LIMIT 1;');
    const userRes = await pool.query('SELECT id FROM "User" LIMIT 1;');

    if (tenantRes.rows.length === 0 || userRes.rows.length === 0) {
      console.log('No hay tenant o usuario base.');
      return;
    }

    const tenantId = tenantRes.rows[0].id;
    const userId = userRes.rows[0].id;

    // 1. Portfolio
    const portRes = await pool.query(
      'INSERT INTO "Portfolio" (id, "tenantId", name, description, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, NOW()) RETURNING id;',
      [tenantId, 'Cartera General', 'Cartera inicial']
    );
    const portfolioId = portRes.rows[0].id;
    console.log('✅ Portfolio creado:', portfolioId);

    // 2. TenantMember
    await pool.query(
      'INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW());',
      [tenantId, userId, 'PM_ADMIN', 'ACTIVE']
    );
    console.log('✅ Membresía creada para usuario como PM_ADMIN');

    // 3. Properties
    await pool.query('UPDATE "Property" SET "portfolioId" = $1 WHERE "portfolioId" IS NULL;', [portfolioId]);
    console.log('✅ Propiedades vinculadas a Cartera General');

    const counts = await pool.query(`
      SELECT 
        (SELECT count(*) FROM "Tenant") as tenants, 
        (SELECT count(*) FROM "User") as users, 
        (SELECT count(*) FROM "Property") as properties, 
        (SELECT count(*) FROM "TenantMember") as members, 
        (SELECT count(*) FROM "Portfolio") as portfolios;
    `);
    console.log('🎉 VERIFICACIÓN FINAL EN SUPABASE:', counts.rows[0]);
  } catch (err: any) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
