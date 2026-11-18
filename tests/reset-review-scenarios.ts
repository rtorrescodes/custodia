import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetScenarios() {
  await pool.query(`
    UPDATE "WorkOrderQuote"
    SET status = 'SUBMITTED', "approvedById" = null, "approvedAt" = null
    WHERE id = 'fb1ab408-bd52-4cd4-b892-fc86ad87840e'
  `);
  await pool.query(`
    UPDATE "WorkOrder"
    SET status = 'AWAITING_APPROVAL'
    WHERE id = 'b10718e5-5341-4827-bd78-d515bb92a8b1'
  `);
  await pool.query(`
    UPDATE "OwnerContribution"
    SET status = 'REQUESTED', reference = null, "evidenceUrl" = null, "reportedAt" = null, "verifiedAt" = null
    WHERE id = '2fd1b14d-b198-49ec-8517-b2d3ccee6b40'
  `);
  await pool.query(`
    UPDATE "Inspection"
    SET status = 'SCHEDULED', "summaryNotes" = 'Llegada de propietario - Insumos requeridos'
    WHERE "propertyId" = 'f28e8fa3-63e8-4113-b620-0cf181e2363c' AND type = 'MOVE_IN'
  `);
  await pool.query(`
    DELETE FROM "OperationalTask"
    WHERE "propertyId" = 'f28e8fa3-63e8-4113-b620-0cf181e2363c' AND ("sourceType" = 'STAY' OR "sourceId" IN (
      SELECT id FROM "Inspection" WHERE "propertyId" = 'f28e8fa3-63e8-4113-b620-0cf181e2363c'
    ))
  `);
  console.log("RESET SCENARIOS COMPLETED");
  await pool.end();
}

resetScenarios().catch(e => {
  console.error(e);
  process.exit(1);
});
