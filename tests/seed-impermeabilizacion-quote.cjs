require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedQuote() {
  const wo = (await pool.query('SELECT id, "tenantId" FROM "WorkOrder" WHERE title = $1', ['Impermeabilización Azotea y Sellado'])).rows[0];
  if (wo) {
    const q = (await pool.query('SELECT id FROM "WorkOrderQuote" WHERE "workOrderId" = $1', [wo.id])).rows[0];
    if (!q) {
      const res = await pool.query(`
        INSERT INTO "WorkOrderQuote" (
          id, "tenantId", "workOrderId", version, "laborCost", "materialCost", "totalCost", currency, status, "itemsJson", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(), $1, $2, 1, 2800, 2000, 4800, 'MXN', 'SUBMITTED', '[]'::jsonb, NOW(), NOW()
        ) RETURNING id
      `, [wo.tenantId, wo.id]);
      console.log('Cotización creada para Impermeabilización:', res.rows[0].id);
    } else {
      console.log('Cotización ya existía:', q.id);
    }
  }
  await pool.end();
}

seedQuote().catch(console.error);
