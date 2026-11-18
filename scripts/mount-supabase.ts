import { Pool } from 'pg';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

async function inspectAndSync() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
    console.log("Tablas existentes actualmente en public:", tables.rows.map(r => r.tablename));

    console.log("Calculando diferencias usando prisma migrate diff --from-config-datasource --to-schema...");
    const diffSql = execSync('npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script', {
      encoding: 'utf8'
    });

    console.log(`Script diferencial generado (${diffSql.length} caracteres):\n`, diffSql.slice(0, 500) + '...');

    if (diffSql.trim().length > 0) {
      console.log("Aplicando diferencias en Supabase...");
      await pool.query(diffSql);
      console.log("✅ Diferencias aplicadas exitosamente.");
    } else {
      console.log("✅ El esquema ya se encuentra sincronizado.");
    }

    const updatedTables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
    console.log(`✅ Total final de tablas en Supabase: ${updatedTables.rows.length}`);
    console.log("Tablas finales:", updatedTables.rows.map(r => r.tablename).join(", "));
  } catch (err: any) {
    console.error("❌ Error en sincronización:", err.message);
  } finally {
    await pool.end();
  }
}

inspectAndSync();
