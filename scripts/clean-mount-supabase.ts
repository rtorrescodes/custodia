import { Pool } from 'pg';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

async function cleanAndMount() {
  console.log("Limpiando y montando en Supabase:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Limpieza total de esquemas previos
    console.log("Ejecutando DROP SCHEMA public CASCADE; CREATE SCHEMA public;...");
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query('GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;');
    console.log("✅ Esquema public limpio y restablecido.");

    // 2. Generar DDL completo limpio desde prisma/schema.prisma
    console.log("Generando DDL completo desde prisma/schema.prisma...");
    const fullSql = execSync('npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script', {
      encoding: 'utf8'
    });

    console.log(`Aplicando DDL (${fullSql.length} caracteres)...`);
    await pool.query(fullSql);
    console.log("✅ Tablas, tipos e índices de Custodia montados exitosamente.");

    // 3. Activar RLS en todas las tablas
    console.log("Activando Row Level Security (RLS) en todas las tablas públicas...");
    await pool.query(`
      DO $$
      DECLARE
        row record;
      BEGIN
        FOR row IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
          EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', row.tablename);
        END LOOP;
      END;
      $$;
    `);
    console.log("✅ RLS activado en todas las tablas.");

    // 4. Verificación final de inventario de tablas
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;");
    console.log(`\n🎉 Total de tablas montadas en Supabase: ${tables.rows.length}`);
    console.log("Lista de tablas:", tables.rows.map(r => r.tablename).join(", "));
  } catch (err: any) {
    console.error("❌ Error en cleanAndMount:", err.message);
  } finally {
    await pool.end();
  }
}

cleanAndMount();
