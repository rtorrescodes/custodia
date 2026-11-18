require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function setupBucket() {
  const existing = (await pool.query('SELECT id FROM "storage"."buckets" WHERE id = $1', ['evidence-vault'])).rows[0];
  if (!existing) {
    await pool.query(`
      INSERT INTO "storage"."buckets" (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('evidence-vault', 'evidence-vault', false, 10485760, ARRAY['image/jpeg', 'image/png', 'application/pdf'])
    `);
    console.log('Bucket privado evidence-vault creado con éxito.');
  } else {
    console.log('Bucket evidence-vault ya existía.');
  }
  await pool.end();
}

setupBucket().catch(console.error);
