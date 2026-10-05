require('dotenv').config();
const https = require('https');
const { Pool } = require('pg');

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'DemoCustodia2026!';
const SUPABASE_HOST = 'ptfejkjyxrcmxslpuexo.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: SUPABASE_HOST,
      path: path,
      method: method,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          const parsed = resBody ? JSON.parse(resBody) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ status: res.statusCode, body: parsed });
          }
        } catch (e) {
          resolve({ raw: resBody, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('--- Sincronizando usuarios demo en Supabase Auth vía HTTPS Nativo ---');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Obtener lista de usuarios en Auth
    const listRes = await adminRequest('GET', '/auth/v1/admin/users?per_page=50');
    const existingUsers = listRes.users || [];
    const authUserMap = new Map();
    for (const u of existingUsers) {
      if (u.email) authUserMap.set(u.email.toLowerCase(), u.id);
    }

    const demoEmails = [
      { email: 'casero@demo.custodia.app', role: 'LANDLORD' },
      { email: 'pm@demo.custodia.app', role: 'PM_ADMIN' },
      { email: 'propietario@demo.custodia.app', role: 'OWNER' },
      { email: 'inquilino@demo.custodia.app', role: 'RENTER' },
      { email: 'proveedor@demo.custodia.app', role: 'VENDOR' },
    ];

    const finalAuthIds = {};

    for (const d of demoEmails) {
      let uid = authUserMap.get(d.email);
      if (!uid) {
        console.log(`Creando usuario en Supabase Auth: ${d.email}...`);
        const created = await adminRequest('POST', '/auth/v1/admin/users', {
          email: d.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { role: d.role }
        });
        uid = created.id;
      } else {
        console.log(`Actualizando contraseña en Supabase Auth: ${d.email}...`);
        await adminRequest('PUT', `/auth/v1/admin/users/${uid}`, {
          password: DEMO_PASSWORD,
          email_confirm: true
        });
      }
      finalAuthIds[d.email] = uid;
      console.log(`✅ Auth ID verificado: ${d.email} -> ${uid}`);
    }

    // 2. Limpiar base de datos pública para los tenants de demo
    const oldTenants = await pool.query(`
      SELECT id FROM "Tenant" WHERE name IN ('Casero Residencial del Valle', 'Zirian Property Management')
    `);
    const oldTenantIds = oldTenants.rows.map(r => r.id);

    if (oldTenantIds.length > 0) {
      await pool.query('DELETE FROM "Transaction" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "WorkOrder" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "Charge" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "Lease" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "PropertyOwner" WHERE "propertyId" IN (SELECT id FROM "Property" WHERE "tenantId" = ANY($1))', [oldTenantIds]);
      await pool.query('DELETE FROM "ManagementAgreement" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "Property" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "Portfolio" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "TenantMember" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "User" WHERE "tenantId" = ANY($1)', [oldTenantIds]);
      await pool.query('DELETE FROM "Tenant" WHERE id = ANY($1)', [oldTenantIds]);
    }

    // 3. Crear Organización Casero
    const orgARes = await pool.query(`
      INSERT INTO "Tenant" (id, name, "countryCode", currency, timezone, "operatingMode", "subscriptionPlan", "updatedAt")
      VALUES (gen_random_uuid(), 'Casero Residencial del Valle', 'MX', 'MXN', 'America/Mexico_City', 'LANDLORD', 'LANDLORD_PRO', NOW())
      RETURNING id, name;
    `);
    const orgA = orgARes.rows[0];

    // User Casero
    await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES ($1, $2, 'casero@demo.custodia.app', 'supabase_auth', 'ADMIN', false, NOW());
    `, [finalAuthIds['casero@demo.custodia.app'], orgA.id]);

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'LANDLORD', 'ACTIVE', NOW());
    `, [orgA.id, finalAuthIds['casero@demo.custodia.app']]);

    // User Inquilino
    await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES ($1, $2, 'inquilino@demo.custodia.app', 'supabase_auth', 'RENTER', false, NOW());
    `, [finalAuthIds['inquilino@demo.custodia.app'], orgA.id]);

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'RENTER', 'ACTIVE', NOW());
    `, [orgA.id, finalAuthIds['inquilino@demo.custodia.app']]);

    // Inmueble y contrato del Casero
    const propARes = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Departamento Insurgentes Sur 302', 'Insurgentes Sur 1420, Col. del Valle, CDMX', 'OWNED', 'DIRECT_OWNER', NOW())
      RETURNING id, name;
    `, [orgA.id]);
    const propA = propARes.rows[0];

    const leaseARes = await pool.query(`
      INSERT INTO "Lease" (id, "tenantId", "propertyId", "renterId", "startDate", "endDate", "rentAmount", "depositAmount", "paymentDay", status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-01', '2026-12-31', 16000, 16000, 5, 'ACTIVE', NOW())
      RETURNING id;
    `, [orgA.id, propA.id, finalAuthIds['inquilino@demo.custodia.app']]);

    await pool.query(`
      INSERT INTO "Charge" (id, "tenantId", "leaseId", "propertyId", concept, type, amount, "periodMonth", "periodYear", "dueDate", status, "amountPaid", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, 'Renta Mensual Enero 2026', 'RENT', 16000, 1, 2026, '2026-01-05', 'PENDING', 0, NOW());
    `, [orgA.id, leaseARes.rows[0].id, propA.id]);

    console.log(`✅ Organización Casero configurada: ${orgA.name} (${orgA.id})`);

    // 4. Crear Organización PM
    const orgBRes = await pool.query(`
      INSERT INTO "Tenant" (id, name, "countryCode", currency, timezone, "operatingMode", "subscriptionPlan", "updatedAt")
      VALUES (gen_random_uuid(), 'Zirian Property Management', 'MX', 'MXN', 'America/Mexico_City', 'PROPERTY_MANAGER', 'PM_BUSINESS', NOW())
      RETURNING id, name;
    `);
    const orgB = orgBRes.rows[0];

    // PM Admin
    await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES ($1, $2, 'pm@demo.custodia.app', 'supabase_auth', 'ADMIN', false, NOW());
    `, [finalAuthIds['pm@demo.custodia.app'], orgB.id]);

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PM_ADMIN', 'ACTIVE', NOW());
    `, [orgB.id, finalAuthIds['pm@demo.custodia.app']]);

    // Owner
    await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES ($1, $2, 'propietario@demo.custodia.app', 'supabase_auth', 'OWNER', false, NOW());
    `, [finalAuthIds['propietario@demo.custodia.app'], orgB.id]);

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'OWNER', 'ACTIVE', NOW());
    `, [orgB.id, finalAuthIds['propietario@demo.custodia.app']]);

    // Vendor
    await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES ($1, $2, 'proveedor@demo.custodia.app', 'supabase_auth', 'VENDOR', false, NOW());
    `, [finalAuthIds['proveedor@demo.custodia.app'], orgB.id]);

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'VENDOR', 'ACTIVE', NOW());
    `, [orgB.id, finalAuthIds['proveedor@demo.custodia.app']]);

    // Cartera e Inmueble Fiduciario PM
    const portBRes = await pool.query(`
      INSERT INTO "Portfolio" (id, "tenantId", name, description, "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Cartera Departamentos Lujo Cancún', 'Administración fiduciaria para inversionistas', NOW())
      RETURNING id;
    `, [orgB.id]);
    const portBId = portBRes.rows[0].id;

    const propBRes = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "portfolioId", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Torre Marena PH2', 'Blvd. Kukulcan Km 10, Zona Hotelera, Cancún', 'THIRD_PARTY', 'PM_ESCROW', $2, NOW())
      RETURNING id, name;
    `, [orgB.id, portBId]);
    const propB = propBRes.rows[0];

    await pool.query(`
      INSERT INTO "PropertyOwner" ("propertyId", "userId", "ownershipShare")
      VALUES ($1, $2, 100.00);
    `, [propB.id, finalAuthIds['propietario@demo.custodia.app']]);

    await pool.query(`
      INSERT INTO "ManagementAgreement" (id, "tenantId", "propertyId", "commissionType", "commissionRate", "reserveMinimum", "effectiveFrom", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PERCENTAGE_RENT', 0.10, 2000, '2026-01-01', NOW());
    `, [orgB.id, propB.id]);

    // Actualizar metadata de app en Supabase Auth
    for (const d of demoEmails) {
      const uid = finalAuthIds[d.email];
      const tid = d.email.includes('casero') || d.email.includes('inquilino') ? orgA.id : orgB.id;
      await adminRequest('PUT', `/auth/v1/admin/users/${uid}`, {
        app_metadata: { tenantId: tid, role: d.role },
        user_metadata: { tenantId: tid, role: d.role }
      });
    }

    console.log(`✅ Organización PM configurada: ${orgB.name} (${orgB.id})`);
    console.log('\n🎉 TODOS LOS USUARIOS SINTÉTICOS EXISTEN EN SUPABASE AUTH Y ESTÁN ENLAZADOS 1:1 CON LA BASE DE DATOS.');

  } catch (err) {
    console.error('❌ Error en main:', err);
  } finally {
    await pool.end();
  }
}

main();
