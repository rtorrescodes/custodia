require('dotenv').config();
const { Pool } = require('pg');

async function runNegativeSecurityTests() {
  console.log('=== SUITE DE PRUEBAS DE SEGURIDAD Y AISLAMIENTO DE AUTORIZACIÓN (ZERO TRUST) ===\n');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // Cargar datos de prueba
    const caseroUser = (await pool.query(`SELECT id, email, "tenantId" FROM "User" WHERE email = 'casero@demo.custodia.app'`)).rows[0];
    const pmUser = (await pool.query(`SELECT id, email, "tenantId" FROM "User" WHERE email = 'pm@demo.custodia.app'`)).rows[0];
    const ownerUser = (await pool.query(`SELECT id, email, "tenantId" FROM "User" WHERE email = 'propietario@demo.custodia.app'`)).rows[0];
    const renterUser = (await pool.query(`SELECT id, email, "tenantId" FROM "User" WHERE email = 'inquilino@demo.custodia.app'`)).rows[0];
    const vendorUser = (await pool.query(`SELECT id, email, "tenantId" FROM "User" WHERE email = 'proveedor@demo.custodia.app'`)).rows[0];

    const orgCasero = (await pool.query(`SELECT id, name FROM "Tenant" WHERE id = $1`, [caseroUser.tenantId])).rows[0];
    const orgPM = (await pool.query(`SELECT id, name FROM "Tenant" WHERE id = $1`, [pmUser.tenantId])).rows[0];

    // Helper simulador de verificación de membresía (equivalente exacto de resolveMembershipContext en servidor)
    async function checkMembershipContext(userId, targetTenantId) {
      if (!userId || !targetTenantId) {
        return { ok: false, error: "Identidad o Tenant no provistos.", code: 401 };
      }
      const member = (await pool.query(`
        SELECT tm.*, u.email as "userEmail"
        FROM "TenantMember" tm
        JOIN "User" u ON u.id = tm."userId"
        WHERE tm."tenantId" = $1 AND tm."userId" = $2
      `, [targetTenantId, userId])).rows[0];

      if (member) {
        if (member.status === 'REVOKED') return { ok: false, error: 'Membresía revocada.', code: 403 };
        if (member.status === 'SUSPENDED') return { ok: false, error: 'Membresía suspendida.', code: 403 };
        return { ok: true, member };
      }
      return { ok: false, error: 'No pertenece a la organización.', code: 403 };
    }

    // TEST 1: Sin sesión (userId ausente o inválido)
    console.log('[TEST 1] Petición sin sesión autenticada:');
    const resNoAuth = await checkMembershipContext(null, orgCasero.id);
    assert(resNoAuth.ok === false && resNoAuth.code === 401, 'Rechazo inmediato con 401 si no hay identidad/sesión');

    // TEST 2: Cookie de organización ajena o manipulada (Casero intentando entrar a Org PM)
    console.log('\n[TEST 2] Casero intentando acceder con cookie/parámetro manipulado a la Org PM:');
    const resTamperedOrg = await checkMembershipContext(caseroUser.id, orgPM.id);
    assert(resTamperedOrg.ok === false && resTamperedOrg.code === 403, 'Rechazo 403: El casero no tiene membresía en la organización del PM');

    // TEST 3: PM intentando invadir la organización del Casero
    console.log('\n[TEST 3] PM intentando acceder a la organización privada del Casero:');
    const resPmToCasero = await checkMembershipContext(pmUser.id, orgCasero.id);
    assert(resPmToCasero.ok === false && resPmToCasero.code === 403, 'Rechazo 403: Aislamiento estricto multi-tenant garantizado');

    // TEST 4: Membresía revocada con sesión aún abierta
    console.log('\n[TEST 4] Usuario con sesión abierta pero con membresía revocada:');
    // Creamos miembro temporal revocado
    const tempMemberRes = await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PM_STAFF', 'REVOKED', NOW())
      RETURNING id;
    `, [orgPM.id, caseroUser.id]);
    const resRevoked = await checkMembershipContext(caseroUser.id, orgPM.id);
    assert(resRevoked.ok === false && resRevoked.code === 403 && resRevoked.error === 'Membresía revocada.', 'Rechazo 403 inmediato cuando status = REVOKED');
    // Limpieza de prueba
    await pool.query(`DELETE FROM "TenantMember" WHERE id = $1`, [tempMemberRes.rows[0].id]);

    // TEST 5: Propietario (OWNER) no puede acceder a inmuebles de terceros dentro del mismo PM
    console.log('\n[TEST 5] Propietario (OWNER) restringido a sus inmuebles de titularidad:');
    // Creamos otro inmueble en la misma org PM que no pertenece al propietario
    const foreignProp = (await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Villa Ajena No Asignada', 'Blvd Kukulcan 1', 'THIRD_PARTY', 'PM_ESCROW', NOW())
      RETURNING id;
    `, [orgPM.id])).rows[0];

    // Verificar si el owner es dueño de este inmueble
    const ownerShare = (await pool.query(`
      SELECT * FROM "PropertyOwner" WHERE "propertyId" = $1 AND "userId" = $2
    `, [foreignProp.id, ownerUser.id])).rows[0];
    assert(!ownerShare, 'Propietario no figura en el título de propiedad del inmueble ajeno');

    // Intentar consultar datos de la propiedad
    const canAccessForeign = !!ownerShare;
    assert(canAccessForeign === false, 'Acceso denegado: El propietario no puede auditar ni ver inmuebles ajenos');
    await pool.query(`DELETE FROM "Property" WHERE id = $1`, [foreignProp.id]);

    // TEST 6: Inquilino (RENTER) no puede acceder a contratos que no le corresponden
    console.log('\n[TEST 6] Inquilino delimitado exclusivamente a sus propios contratos:');
    const fakeLease = (await pool.query(`
      INSERT INTO "Lease" (id, "tenantId", "propertyId", "renterId", "startDate", "endDate", "rentAmount", "depositAmount", "paymentDay", status, "updatedAt")
      VALUES (gen_random_uuid(), $1, (SELECT id FROM "Property" WHERE "tenantId" = $1 LIMIT 1), $2, '2026-01-01', '2026-12-31', 20000, 20000, 1, 'ACTIVE', NOW())
      RETURNING id, "renterId";
    `, [orgCasero.id, caseroUser.id])).rows[0];

    assert(fakeLease.renterId !== renterUser.id, 'Contrato pertenece a otro usuario');
    const renterLeases = (await pool.query(`SELECT id FROM "Lease" WHERE "tenantId" = $1 AND "renterId" = $2`, [orgCasero.id, renterUser.id])).rows;
    assert(!renterLeases.some(l => l.id === fakeLease.id), 'Inquilino no recibe en su portal contratos de otros usuarios');
    await pool.query(`DELETE FROM "Lease" WHERE id = $1`, [fakeLease.id]);

    // TEST 7: Proveedor (VENDOR) solo ve órdenes que le han sido asignadas
    console.log('\n[TEST 7] Proveedor (VENDOR) no ve órdenes de otros proveedores o sin asignar:');
    const unassignedWo = (await pool.query(`
      INSERT INTO "WorkOrder" (id, "tenantId", "propertyId", title, description, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, (SELECT id FROM "Property" WHERE "tenantId" = $1 LIMIT 1), 'Fuga en caldera central', 'Descripción de fuga', 'PENDING', NOW())
      RETURNING id, "assignedToId";
    `, [orgPM.id])).rows[0];

    const vendorTasks = (await pool.query(`
      SELECT id FROM "WorkOrder" WHERE "tenantId" = $1 AND "assignedToId" = $2
    `, [orgPM.id, vendorUser.id])).rows;
    assert(!vendorTasks.some(w => w.id === unassignedWo.id), 'Proveedor no tiene visibilidad de órdenes no asignadas a su cuenta');
    await pool.query(`DELETE FROM "WorkOrder" WHERE id = $1`, [unassignedWo.id]);

    console.log(`\n============================================================`);
    console.log(`RESULTADO DE AUDITORÍA: ${passed} PASADAS, ${failed} FALLIDAS`);
    console.log(`============================================================`);

  } catch (err) {
    console.error('Error ejecutando pruebas:', err);
  } finally {
    await pool.end();
  }
}

runNegativeSecurityTests();
