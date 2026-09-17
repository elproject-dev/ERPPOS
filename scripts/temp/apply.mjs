import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sql = `
ALTER TABLE public.sales_returns
ADD COLUMN IF NOT EXISTS cash_refund numeric(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS deducted_balance numeric(15,2) DEFAULT 0;
`;

const projectRef = process.env.SUPABASE_PROJECT_REF || "bqmxjxsdassgiuhtquaw";
const connectionString = process.env.SUPABASE_DB_URL || `postgresql://postgres:postgres@127.0.0.1:54322/postgres`;

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString, ssl: false });

try {
  await client.connect();
  await client.query(sql);
  console.log("Migration successful");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
