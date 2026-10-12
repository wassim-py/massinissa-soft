/**
 * scripts/backup-and-migrate-db.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Complete PostgreSQL Backup & Migration Tool (NeonDB -> Supabase / Oracle)
 *
 * Usage:
 *   1. Backup current DATABASE_URL to backups/neon-full-backup.json:
 *      npx tsx scripts/backup-and-migrate-db.ts --backup
 *
 *   2. Restore/Migrate backup into a target PostgreSQL URL (or current DATABASE_URL):
 *      npx tsx scripts/backup-and-migrate-db.ts --restore
 * ═══════════════════════════════════════════════════════════════════════════
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as pg from "pg";
import { Pool } from "pg";

// Preserve exact PostgreSQL string representations for timestamps and dates
// so local machine timezone (UTC+1) never shifts TIMESTAMP WITHOUT TIME ZONE values!
pg.types.setTypeParser(1114, (val: string) => val); // timestamp without time zone
pg.types.setTypeParser(1184, (val: string) => val); // timestamp with time zone
pg.types.setTypeParser(1082, (val: string) => val); // date

const BACKUP_DIR = path.join(process.cwd(), "backups");
const BACKUP_FILE = path.join(BACKUP_DIR, "neon-full-backup.json");

interface ColumnMeta {
  column_name: string;
  data_type: string;
  udt_name: string;
  column_default: string | null;
}

interface BackupPayload {
  createdAt: string;
  sourceHost: string;
  tableOrder: string[];
  columnsByTable: Record<string, ColumnMeta[]>;
  rowsByTable: Record<string, any[]>;
}

/**
 * Topologically sorts tables based on foreign key dependencies so parent tables
 * are always inserted before child tables.
 */
async function getTopologicalTableOrder(pool: Pool): Promise<string[]> {
  const tablesRes = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC;
  `);

  const allTables = tablesRes.rows.map((r) => r.table_name);

  const fkRes = await pool.query<{
    child_table: string;
    parent_table: string;
  }>(`
    SELECT DISTINCT
      tc.table_name AS child_table,
      ccu.table_name AS parent_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public';
  `);

  const deps = new Map<string, Set<string>>();
  for (const t of allTables) {
    deps.set(t, new Set());
  }
  for (const row of fkRes.rows) {
    if (row.child_table !== row.parent_table && deps.has(row.child_table)) {
      deps.get(row.child_table)!.add(row.parent_table);
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: string[] = [];

  function visit(table: string) {
    if (visited.has(table)) return;
    if (visiting.has(table)) return; // Break circular FK (e.g. Student <-> Family)
    visiting.add(table);
    const parents = deps.get(table) || new Set();
    for (const p of parents) {
      visit(p);
    }
    visiting.delete(table);
    visited.add(table);
    ordered.push(table);
  }

  for (const t of allTables) {
    visit(t);
  }

  return ordered;
}

async function runBackup(overrideSourceUrl?: string) {
  const dbUrl = overrideSourceUrl || process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set in .env");
  }

  const hostMatch = dbUrl.match(/@([^:/?]+)/);
  const sourceHost = hostMatch ? hostMatch[1] : "unknown-host";
  console.log(`\n📦 Connecting to source database (${sourceHost})...`);

  const pool = new Pool({
    connectionString: dbUrl,
    max: 3,
    connectionTimeoutMillis: 15000,
  });

  try {
    const tableOrder = await getTopologicalTableOrder(pool);
    console.log(`Found ${tableOrder.length} tables in public schema.`);

    const columnsByTable: Record<string, ColumnMeta[]> = {};
    const rowsByTable: Record<string, any[]> = {};
    let totalRows = 0;

    for (const table of tableOrder) {
      const colRes = await pool.query<ColumnMeta>(
        `
        SELECT column_name, data_type, udt_name, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position ASC;
      `,
        [table]
      );
      columnsByTable[table] = colRes.rows;

      const dataRes = await pool.query(`SELECT * FROM "${table}"`);
      rowsByTable[table] = dataRes.rows;
      totalRows += dataRes.rows.length;
      console.log(`  ✓ ${table.padEnd(32)} : ${dataRes.rows.length} rows`);
    }

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const payload: BackupPayload = {
      createdAt: new Date().toISOString(),
      sourceHost,
      tableOrder,
      columnsByTable,
      rowsByTable,
    };

    fs.writeFileSync(BACKUP_FILE, JSON.stringify(payload, null, 2), "utf-8");
    const sizeMb = (fs.statSync(BACKUP_FILE).size / (1024 * 1024)).toFixed(2);
    console.log(`\n✅ Backup complete!`);
    console.log(`   • File       : ${BACKUP_FILE}`);
    console.log(`   • Size       : ${sizeMb} MB`);
    console.log(`   • Total Rows : ${totalRows}`);
  } finally {
    await pool.end();
  }
}

async function runRestore() {
  const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!targetUrl) {
    throw new Error("DATABASE_URL is not set in .env");
  }

  if (!fs.existsSync(BACKUP_FILE)) {
    throw new Error(`Backup file not found at ${BACKUP_FILE}. Run with --backup first.`);
  }

  const payload: BackupPayload = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf-8"));
  const hostMatch = targetUrl.match(/@([^:/?]+)/);
  const targetHost = hostMatch ? hostMatch[1] : "unknown-host";

  console.log(`\n🚀 Restoring backup (${payload.createdAt}) into target database (${targetHost})...`);

  const pool = new Pool({
    connectionString: targetUrl,
    max: 3,
    connectionTimeoutMillis: 20000,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Disable triggers/FK checks during bulk load if supported (works on Supabase postgres role)
    let replicaModeEnabled = false;
    try {
      await client.query(`SET LOCAL session_replication_role = 'replica';`);
      replicaModeEnabled = true;
      console.log(`  ℹ️ Enabled session_replication_role = 'replica' for fast bulk import.`);
    } catch {
      console.log(`  ℹ️ Using topological FK ordering for import.`);
    }

    // If circular FK exists (Student.familyId <-> Family.payerStudentId) and replica mode isn't available,
    // we temporarily null out Family.payerStudentId on insert and restore it right after Student is inserted.
    const deferredFamilyPayers: Array<{ id: number; payerStudentId: string }> = [];

    // Clear existing rows in reverse topological order so restore is idempotent
    const existingTablesRes = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `);
    const existingTableSet = new Set(existingTablesRes.rows.map((r) => r.table_name));

    const tablesToRestore = payload.tableOrder.filter(
      (t) => existingTableSet.has(t) && t !== "_prisma_migrations"
    );

    for (const table of [...tablesToRestore].reverse()) {
      await client.query(`DELETE FROM "${table}";`);
    }

    for (const table of tablesToRestore) {
      const rows = payload.rowsByTable[table] || [];
      if (rows.length === 0) {
        console.log(`  - ${table.padEnd(32)} : 0 rows (skipped)`);
        continue;
      }

      const colMeta = payload.columnsByTable[table] || [];
      const colMetaMap = new Map(colMeta.map((c) => [c.column_name, c]));
      const colNames = colMeta.length > 0 ? colMeta.map((c) => c.column_name) : Object.keys(rows[0]);
      const quotedCols = colNames.map((c) => `"${c}"`).join(", ");

      // Insert in batches of 100 rows
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const valueClauses: string[] = [];

        for (const row of batch) {
          const rowPlaceholders: string[] = [];
          for (const col of colNames) {
            let val = row[col];
            const meta = colMetaMap.get(col);
            if (
              !replicaModeEnabled &&
              table === "Family" &&
              col === "payerStudentId" &&
              val !== null &&
              val !== undefined
            ) {
              deferredFamilyPayers.push({ id: row.id, payerStudentId: val });
              val = null;
            } else if (
              typeof val === "string" &&
              val.startsWith("+") &&
              meta &&
              (meta.data_type.includes("timestamp") || meta.data_type === "date")
            ) {
              // Convert JS extended ISO year "+022012-02-05T22:00:00.000Z" -> "22012-02-05 22:00:00.000+00"
              val = val
                .replace(/^\+0*/, "")
                .replace("T", " ")
                .replace(/Z$/, "+00");
            } else if (
              val !== null &&
              val !== undefined &&
              typeof val === "object" &&
              meta &&
              (meta.udt_name === "json" || meta.udt_name === "jsonb")
            ) {
              val = JSON.stringify(val);
            }
            values.push(val);
            rowPlaceholders.push(`$${values.length}`);
          }
          valueClauses.push(`(${rowPlaceholders.join(", ")})`);
        }

        const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES ${valueClauses.join(", ")} ON CONFLICT DO NOTHING;`;
        await client.query(sql, values);
      }

      console.log(`  ✓ ${table.padEnd(32)} : restored ${rows.length} rows`);
    }

    // Restore deferred Family.payerStudentId if replica mode was not used
    if (deferredFamilyPayers.length > 0) {
      for (const item of deferredFamilyPayers) {
        await client.query(
          `UPDATE "Family" SET "payerStudentId" = $1 WHERE id = $2`,
          [item.payerStudentId, item.id]
        );
      }
      console.log(`  ✓ Restored ${deferredFamilyPayers.length} Family.payerStudentId links`);
    }

    // Reset all PostgreSQL auto-increment sequences so future inserts never collide with existing IDs
    for (const table of tablesToRestore) {
      const colMeta = payload.columnsByTable[table] || [];
      for (const col of colMeta) {
        if (col.column_default && col.column_default.includes("nextval(")) {
          await client.query(`
            SELECT setval(
              pg_get_serial_sequence('"${table}"', '${col.column_name}'),
              COALESCE((SELECT MAX("${col.column_name}") FROM "${table}"), 1),
              (SELECT COUNT(*) > 0 FROM "${table}")
            );
          `);
        }
      }
    }
    console.log(`  ✓ Synchronized all PostgreSQL auto-increment sequences!`);

    await client.query("COMMIT");
    console.log(`\n🎉 Migration to ${targetHost} completed successfully!`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function runVerify(sourceUrlOverride?: string) {
  const neonUrl = sourceUrlOverride || process.env.NEON_DATABASE_URL;
  if (!neonUrl) {
    throw new Error("Please set NEON_DATABASE_URL in .env to run --verify or --sync-from-neon");
  }
  const supabaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!supabaseUrl) throw new Error("No Supabase URL in .env");

  const neonPool = new Pool({ connectionString: neonUrl, max: 2 });
  const supaPool = new Pool({
    connectionString: supabaseUrl,
    max: 2,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const tablesRes = await neonPool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC;
    `);

    console.log("\n🔍 Comparing Live NeonDB vs Live Supabase Table Counts:");
    console.log("─".repeat(65));
    console.log(
      `${"Table".padEnd(32)} | ${"NeonDB".padStart(8)} | ${"Supabase".padStart(8)} | Status`
    );
    console.log("─".repeat(65));

    let mismatches = 0;
    for (const { table_name } of tablesRes.rows) {
      if (table_name === "_prisma_migrations") continue;
      const [nRes, sRes] = await Promise.all([
        neonPool.query(`SELECT COUNT(*)::int AS c FROM "${table_name}"`),
        supaPool
          .query(`SELECT COUNT(*)::int AS c FROM "${table_name}"`)
          .catch(() => ({ rows: [{ c: -1 }] })),
      ]);
      const nCount = nRes.rows[0].c;
      const sCount = sRes.rows[0].c;
      const match = nCount === sCount;
      if (!match) mismatches++;
      console.log(
        `${table_name.padEnd(32)} | ${String(nCount).padStart(8)} | ${String(
          sCount
        ).padStart(8)} | ${match ? "✓ OK" : "❌ MISMATCH"}`
      );
    }
    console.log("─".repeat(65));
    console.log(`Total mismatches: ${mismatches}`);

    const [neonLesson, supaLesson] = await Promise.all([
      neonPool.query(`SELECT id, "startsAt", "endsAt" FROM "Lesson" ORDER BY id ASC LIMIT 3`),
      supaPool.query(`SELECT id, "startsAt", "endsAt" FROM "Lesson" ORDER BY id ASC LIMIT 3`),
    ]);
    console.log("\nSample Lesson timestamps (NeonDB):", neonLesson.rows);
    console.log("Sample Lesson timestamps (Supabase):", supaLesson.rows);

    const [neonLedger, supaLedger] = await Promise.all([
      neonPool.query(`SELECT id, date FROM "DailyLedger" ORDER BY id DESC LIMIT 3`),
      supaPool.query(`SELECT id, date FROM "DailyLedger" ORDER BY id DESC LIMIT 3`),
    ]);
    console.log("\nSample DailyLedger dates (NeonDB):", neonLedger.rows);
    console.log("Sample DailyLedger dates (Supabase):", supaLedger.rows);
  } finally {
    await neonPool.end();
    await supaPool.end();
  }
}

async function main() {
  const neonUrl = process.env.NEON_DATABASE_URL;

  if (process.argv.includes("--sync-from-neon")) {
    if (!neonUrl) {
      throw new Error("Please set NEON_DATABASE_URL in .env to run --sync-from-neon");
    }
    await runBackup(neonUrl);
    await runRestore();
    await runVerify(neonUrl);
  } else if (process.argv.includes("--verify")) {
    await runVerify(neonUrl);
  } else if (process.argv.includes("--restore")) {
    await runRestore();
  } else {
    await runBackup();
  }
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message || err);
  process.exit(1);
});
