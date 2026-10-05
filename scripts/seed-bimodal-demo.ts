import 'dotenv/config';
import { Pool } from 'pg';

async function seedBimodalDemo() {
  console.log("Creando datos sintéticos de prueba para Demo Bimodal (Casero y PM)...");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // -------------------------------------------------------------
    // ORGANIZACIÓN A: "Casero Residencial del Valle" (Modo LANDLORD)
    // -------------------------------------------------------------
    const orgARes = await pool.query(`
      INSERT INTO "Tenant" (id, name, "countryCode", currency, timezone, "operatingMode", "subscriptionPlan", "updatedAt")
      VALUES (gen_random_uuid(), 'Casero Residencial del Valle', 'MX', 'MXN', 'America/Mexico_City', 'LANDLORD', 'LANDLORD_PRO', NOW())
      RETURNING id, name;
    `);
    const orgA = orgARes.rows[0];

    // Usuario Casero
    const userCaseroRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'casero@demo.custodia.app', 'demo_hash', 'ADMIN', false, NOW())
      RETURNING id, email;
    `, [orgA.id]);
    const userCasero = userCaseroRes.rows[0];

    // Membresía Casero LANDLORD
    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'LANDLORD', 'ACTIVE', NOW());
    `, [orgA.id, userCasero.id]);

    // Inmueble Propio
    const propARes = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Departamento Insurgentes Sur 302', 'Insurgentes Sur 1420, Col. del Valle, CDMX', 'OWNED', 'DIRECT_OWNER', NOW())
      RETURNING id, name;
    `, [orgA.id]);
    const propA = propARes.rows[0];

    // Inquilino
    const userInquilinoRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'inquilino@demo.custodia.app', 'demo_hash', 'RENTER', false, NOW())
      RETURNING id, email;
    `, [orgA.id]);
    const userInquilino = userInquilinoRes.rows[0];

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'RENTER', 'ACTIVE', NOW());
    `, [orgA.id, userInquilino.id]);

    // Contrato Activo Casero-Inquilino
    const leaseARes = await pool.query(`
      INSERT INTO "Lease" (id, "tenantId", "propertyId", "renterId", "startDate", "endDate", "rentAmount", "depositAmount", "paymentDay", status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, '2026-01-01', '2026-12-31', 16000, 16000, 5, 'ACTIVE', NOW())
      RETURNING id;
    `, [orgA.id, propA.id, userInquilino.id]);
    const leaseAId = leaseARes.rows[0].id;

    // Obligación / Cargo de Renta
    const chargeARes = await pool.query(`
      INSERT INTO "Charge" (id, "tenantId", "leaseId", "propertyId", concept, type, amount, "periodMonth", "periodYear", "dueDate", status, "amountPaid", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, $3, 'Renta Mensual Enero 2026', 'RENT', 16000, 1, 2026, '2026-01-05', 'PENDING', 0, NOW())
      RETURNING id;
    `, [orgA.id, leaseAId, propA.id]);

    console.log(`✅ [Organización Casero] Creada: ${orgA.name} (${orgA.id})`);
    console.log(`   - Usuario: ${userCasero.email}`);
    console.log(`   - Inmueble propio: ${propA.name}`);
    console.log(`   - Contrato: ${leaseAId} ($16,000 MXN)`);

    // -------------------------------------------------------------
    // ORGANIZACIÓN B: "Zirian Property Management" (Modo PROPERTY_MANAGER)
    // -------------------------------------------------------------
    const orgBRes = await pool.query(`
      INSERT INTO "Tenant" (id, name, "countryCode", currency, timezone, "operatingMode", "subscriptionPlan", "updatedAt")
      VALUES (gen_random_uuid(), 'Zirian Property Management', 'MX', 'MXN', 'America/Mexico_City', 'PROPERTY_MANAGER', 'PM_BUSINESS', NOW())
      RETURNING id, name;
    `);
    const orgB = orgBRes.rows[0];

    // Usuario PM Admin
    const userPMRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'pm@demo.custodia.app', 'demo_hash', 'ADMIN', false, NOW())
      RETURNING id, email;
    `, [orgB.id]);
    const userPM = userPMRes.rows[0];

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PM_ADMIN', 'ACTIVE', NOW());
    `, [orgB.id, userPM.id]);

    // Propietario Inversionista (Owner)
    const userOwnerRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'propietario@demo.custodia.app', 'demo_hash', 'OWNER', false, NOW())
      RETURNING id, email;
    `, [orgB.id]);
    const userOwner = userOwnerRes.rows[0];

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'OWNER', 'ACTIVE', NOW());
    `, [orgB.id, userOwner.id]);

    // Proveedor Mantenimiento
    const userVendorRes = await pool.query(`
      INSERT INTO "User" (id, "tenantId", email, "passwordHash", role, "mfaEnabled", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'proveedor@demo.custodia.app', 'demo_hash', 'VENDOR', false, NOW())
      RETURNING id, email;
    `, [orgB.id]);
    const userVendor = userVendorRes.rows[0];

    await pool.query(`
      INSERT INTO "TenantMember" (id, "tenantId", "userId", role, status, "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'VENDOR', 'ACTIVE', NOW());
    `, [orgB.id, userVendor.id]);

    // Cartera de Terceros
    const portBRes = await pool.query(`
      INSERT INTO "Portfolio" (id, "tenantId", name, description, "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Cartera Departamentos Lujo Cancún', 'Administración fiduciaria para inversionistas', NOW())
      RETURNING id;
    `, [orgB.id]);
    const portBId = portBRes.rows[0].id;

    // Propiedad en Cartera
    const propBRes = await pool.query(`
      INSERT INTO "Property" (id, "tenantId", name, address, "managementType", "fundCustodian", "portfolioId", "updatedAt")
      VALUES (gen_random_uuid(), $1, 'Torre Marena PH2', 'Blvd. Kukulcan Km 10, Zona Hotelera, Cancún', 'THIRD_PARTY', 'PM_ESCROW', $2, NOW())
      RETURNING id, name;
    `, [orgB.id, portBId]);
    const propB = propBRes.rows[0];

    // Vincular Copropietario
    await pool.query(`
      INSERT INTO "PropertyOwner" ("propertyId", "userId", "ownershipShare")
      VALUES ($1, $2, 100.00);
    `, [propB.id, userOwner.id]);

    // Acuerdo de Gestión (ManagementAgreement): Comisión 10%, Reserva Mínima $2,000
    await pool.query(`
      INSERT INTO "ManagementAgreement" (id, "tenantId", "propertyId", "commissionType", "commissionRate", "reserveMinimum", "effectiveFrom", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, 'PERCENTAGE_RENT', 0.10, 2000, '2026-01-01', NOW());
    `, [orgB.id, propB.id]);

    console.log(`✅ [Organización Property Manager] Creada: ${orgB.name} (${orgB.id})`);
    console.log(`   - PM Admin: ${userPM.email}`);
    console.log(`   - Propietario vinculado: ${userOwner.email}`);
    console.log(`   - Proveedor asignable: ${userVendor.email}`);
    console.log(`   - Inmueble fiduciario: ${propB.name}`);

    console.log("\n🎉 DEMO BIMODAL SINTÉTICA LISTA EN SUPABASE.");
  } catch (err: any) {
    console.error("❌ Error en seedBimodalDemo:", err.message);
  } finally {
    await pool.end();
  }
}

seedBimodalDemo();
