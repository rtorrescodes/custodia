require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const pmTenant = (await pool.query('SELECT id, name FROM "Tenant" WHERE name ILIKE $1', ['%Zirian%'])).rows[0];
  console.log('TENANT PM:', pmTenant);

  const pmUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['pm@demo.custodia.app'])).rows[0];
  const ownerUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['propietario@demo.custodia.app'])).rows[0];
  const vendorUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['proveedor@demo.custodia.app'])).rows[0];

  console.log('USERS FOUND:', { pm: pmUser?.id, owner: ownerUser?.id, vendor: vendorUser?.id });

  let prop = (await pool.query('SELECT id, name, "occupancyStatus" FROM "Property" WHERE "tenantId" = $1 AND name = $2', [pmTenant.id, 'Villa Serena Demo CUS-09C'])).rows[0];

  if (!prop) {
    const insertRes = await pool.query(`
      INSERT INTO "Property" (
        id, "tenantId", name, address, fraccionamiento, "occupancyStatus", "managementType", "fundCustodian", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, 'Villa Serena Demo CUS-09C', 'Av. De las Rosas 104, Fracc. Las Palmas', 'Las Palmas', 'VACANT', 'THIRD_PARTY', 'PM_ESCROW', NOW(), NOW()
      ) RETURNING id, name, "occupancyStatus"
    `, [pmTenant.id]);
    prop = insertRes.rows[0];
    console.log('CREATED PROPERTY:', prop);
  } else {
    console.log('EXISTING PROPERTY:', prop);
  }

  // Vincular propietario
  await pool.query(`
    INSERT INTO "PropertyOwner" ("propertyId", "userId", "ownershipShare")
    VALUES ($1, $2, 100.00)
    ON CONFLICT ("propertyId", "userId") DO NOTHING
  `, [prop.id, ownerUser.id]);

  // Asegurar acuerdo de administración
  const agreement = (await pool.query('SELECT id FROM "ManagementAgreement" WHERE "propertyId" = $1', [prop.id])).rows[0];
  if (!agreement) {
    await pool.query(`
      INSERT INTO "ManagementAgreement" (
        id, "tenantId", "propertyId", "commissionType", "commissionRate", "commissionBase", "reserveMinimum", "pmExpenseLimit", "pmExpenseCurrency", "autoApproveCategories", "effectiveFrom", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'PERCENTAGE_RENT', 0.10, 'COLLECTED', 2000, 1500, 'MXN', ARRAY['LIMPIEZA']::text[], NOW(), NOW(), NOW()
      )
    `, [pmTenant.id, prop.id]);
  }

  // Asignar PM principal
  await pool.query('UPDATE "Property" SET "primaryManagerId" = $1 WHERE id = $2', [pmUser.id, prop.id]);

  console.log('SYNTHETIC PROPERTY READY:', prop.id);
  await pool.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
