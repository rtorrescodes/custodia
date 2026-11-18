require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedReviewScenarios() {
  console.log('--- PREPARANDO DATOS SINTÉTICOS PARA REVISIÓN DE RODRIGO ---');

  const pmTenant = (await pool.query('SELECT id, name FROM "Tenant" WHERE name ILIKE $1', ['%Zirian%'])).rows[0];
  const pmUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['pm@demo.custodia.app'])).rows[0];
  const ownerUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['propietario@demo.custodia.app'])).rows[0];
  const vendorUser = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['proveedor@demo.custodia.app'])).rows[0];

  // Renombrar la propiedad para quitar el sufijo "Demo CUS-09C" y dejarla impecable para producción/revisión
  let prop = (await pool.query('SELECT id, name FROM "Property" WHERE "tenantId" = $1 AND (name ILIKE $2 OR name ILIKE $3)', [pmTenant.id, '%Villa Serena%', '%Villa Serena Demo%'])).rows[0];

  if (prop) {
    await pool.query('UPDATE "Property" SET name = $1 WHERE id = $2', ['Villa Serena Residencial', prop.id]);
    prop.name = 'Villa Serena Residencial';
  } else {
    const insertRes = await pool.query(`
      INSERT INTO "Property" (
        id, "tenantId", name, address, fraccionamiento, "occupancyStatus", "managementType", "fundCustodian", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, 'Villa Serena Residencial', 'Av. De las Rosas 104, Fracc. Las Palmas', 'Las Palmas', 'VACANT', 'THIRD_PARTY', 'PM_ESCROW', NOW(), NOW()
      ) RETURNING id, name
    `, [pmTenant.id]);
    prop = insertRes.rows[0];
  }
  console.log('Propiedad activa:', prop);

  const propertyId = prop.id;

  // 1. REPARACIÓN PENDIENTE DE AUTORIZACIÓN POR EL DUEÑO
  // Crear WorkOrder con WorkOrderQuote en status "SUBMITTED"
  let woPending = (await pool.query('SELECT id FROM "WorkOrder" WHERE "propertyId" = $1 AND title = $2', [propertyId, 'Impermeabilización Azotea y Sellado'])).rows[0];
  if (!woPending) {
    const woRes = await pool.query(`
      INSERT INTO "WorkOrder" (
        id, "tenantId", "propertyId", title, description, status, priority, "estimatedCost", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'Impermeabilización Azotea y Sellado', 'Filtración detectada en temporada de lluvias. Requiere membrana asfáltica.', 'AWAITING_APPROVAL', 'HIGH', 4800, NOW(), NOW()
      ) RETURNING id
    `, [pmTenant.id, propertyId]);
    woPending = woRes.rows[0];

    await pool.query(`
      INSERT INTO "WorkOrderQuote" (
        id, "tenantId", "workOrderId", version, "totalCost", "laborCost", "materialCost", status, "itemsJson", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 1, 4800, 2800, 2000, 'SUBMITTED', '[]'::jsonb, NOW(), NOW()
      )
    `, [pmTenant.id, woPending.id]);
    console.log('Creada reparación pendiente de autorización:', woPending.id);
  }

  // 2. REPARACIÓN APROBADA PENDIENTE DE FONDOS CON APORTACIÓN
  let woApprovedFunds = (await pool.query('SELECT id FROM "WorkOrder" WHERE "propertyId" = $1 AND title = $2', [propertyId, 'Reemplazo de Bomba Hidroneumática'])).rows[0];
  if (!woApprovedFunds) {
    const woRes = await pool.query(`
      INSERT INTO "WorkOrder" (
        id, "tenantId", "propertyId", title, description, status, priority, "estimatedCost", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'Reemplazo de Bomba Hidroneumática', 'Bomba presurizadora quemada. Cotización autorizada pendiente de aportación.', 'AWAITING_APPROVAL', 'HIGH', 6500, NOW(), NOW()
      ) RETURNING id
    `, [pmTenant.id, propertyId]);
    woApprovedFunds = woRes.rows[0];

    await pool.query(`
      INSERT INTO "WorkOrderQuote" (
        id, "tenantId", "workOrderId", version, "totalCost", "laborCost", "materialCost", status, "approvedById", "approvedAt", "itemsJson", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 1, 6500, 2500, 4000, 'APPROVED', $3, NOW(), '[]'::jsonb, NOW(), NOW()
      )
    `, [pmTenant.id, woApprovedFunds.id, ownerUser.id]);

    await pool.query(`
      INSERT INTO "OwnerContribution" (
        id, "tenantId", "propertyId", "ownerId", amount, currency, reason, status, "requestedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 6500, 'MXN', 'Aportación para Reemplazo de Bomba Hidroneumática', 'REQUESTED', NOW(), NOW(), NOW()
      )
    `, [pmTenant.id, propertyId, ownerUser.id]);
    console.log('Creada reparación aprobada pendiente de fondos:', woApprovedFunds.id);
  }

  // 3. TRABAJO PENDIENTE DE VERIFICACIÓN POR EL PM
  let taskVerif = (await pool.query('SELECT id FROM "OperationalTask" WHERE "propertyId" = $1 AND title = $2', [propertyId, 'Mantenimiento y Clorado de Alberca'])).rows[0];
  if (!taskVerif) {
    await pool.query(`
      INSERT INTO "OperationalTask" (
        id, "tenantId", "propertyId", title, description, status, priority, "assigneeId", "sourceType", "checklistJson", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'Mantenimiento y Clorado de Alberca', 'Aspirado profundo, limpieza de filtros y balanceo químico. Trabajo terminado pendiente de visto bueno PM.', 'VERIFICATION_PENDING', 'MEDIUM', $3, 'MANUAL', '[]'::jsonb, NOW(), NOW()
      )
    `, [pmTenant.id, propertyId, vendorUser.id]);
    console.log('Creada tarea pendiente de verificación técnica PM');
  }

  // 4. LLEGADA CON TAREA ESENCIAL INCOMPLETA (CHECKLIST PENDIENTE)
  let stay = (await pool.query('SELECT id FROM "Inspection" WHERE "propertyId" = $1 AND "summaryNotes" ILIKE $2', [propertyId, '%Estadía familiar%'])).rows[0];
  if (!stay) {
    await pool.query(`
      INSERT INTO "Inspection" (
        id, "tenantId", "propertyId", type, status, "inspectorName", "inspectionDate", "summaryNotes", "checklistJson", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'ROUTINE', 'IN_PROGRESS', 'Equipo Operativo PM', NOW() + INTERVAL '3 days', 'Estadía familiar del propietario programada para el fin de semana.', 
        '{"cleaningDone": true, "acChecked": true, "suppliesReady": false, "qrEmitted": false}'::jsonb, NOW(), NOW()
      )
    `, [pmTenant.id, propertyId]);
    console.log('Creada llegada con checklist incompleto');
  }

  // 5. VISITA DE CUIDADO DE CASA DESOCUPADA CON HALLAZGO
  let careVisit = (await pool.query('SELECT id FROM "Inspection" WHERE "propertyId" = $1 AND "summaryNotes" ILIKE $2', [propertyId, '%Rondín de conservación%'])).rows[0];
  if (!careVisit) {
    await pool.query(`
      INSERT INTO "Inspection" (
        id, "tenantId", "propertyId", type, status, "inspectorName", "inspectionDate", "summaryNotes", "checklistJson", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'ROUTINE', 'COMPLETED', 'Inspector PM Certificado', NOW() - INTERVAL '1 day', 'Rondín de conservación semanal: goteo detectado en llave exterior.',
        '{"perimeterSecure": true, "doorsLocked": true, "waterLeaksFound": true, "findingsNote": "Goteo persistente en llave de jardín exterior"}'::jsonb, NOW(), NOW()
      )
    `, [pmTenant.id, propertyId]);
    console.log('Creada visita de cuidado con hallazgo');
  }

  console.log('--- DATOS SINTÉTICOS DE REVISIÓN PREPARADOS AL 100% ---');
  await pool.end();
}

seedReviewScenarios().catch(err => {
  console.error(err);
  process.exit(1);
});
