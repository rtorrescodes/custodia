require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const user = (await pool.query('SELECT id, email FROM "User" WHERE email = $1', ['propietario@demo.custodia.app'])).rows[0];
  const props = (await pool.query('SELECT po."propertyId", p.name FROM "PropertyOwner" po JOIN "Property" p ON po."propertyId" = p.id WHERE po."userId" = $1', [user.id])).rows;
  console.log('PROPIEDADES DE propietario@demo.custodia.app:');
  console.log(props);

  const allProps = (await pool.query('SELECT id, name, "tenantId" FROM "Property" LIMIT 10')).rows;
  console.log('ALL PROPS IN DB:');
  console.log(allProps);

  await pool.end();
}

check().catch(console.error);
