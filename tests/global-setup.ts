import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import path from "node:path";

/**
 * Provisions an isolated SQLite database for the integration tests.
 *
 * Tests must never touch the development database, so this points
 * DATABASE_URL at its own file and rebuilds the schema from scratch on every
 * run — a stale test DB is a classic source of tests that pass locally and
 * fail in CI.
 */
const TEST_DB_FILE = path.resolve(process.cwd(), "prisma", "test.db");
const TEST_DB_URL = "file:./test.db";

function removeTestDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
    } catch {
      // Windows can still hold a handle to the SQLite file for a moment after
      // the client disconnects. Failing to delete on teardown is harmless —
      // setup deletes it again before the next run, which is what guarantees
      // a clean database. Never fail a green suite on cleanup.
    }
  }
}

export async function setup() {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.AI_PROVIDER = "none";

  removeTestDb();

  // Run Prisma's CLI entrypoint through the current Node binary rather than
  // `npx`. Node 20+ refuses to spawn a .cmd shim without a shell on Windows,
  // and going through a shell would need quoting that breaks on paths
  // containing spaces — which this project path has.
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");

  execFileSync(
    process.execPath,
    [prismaCli, "db", "push", "--skip-generate", "--accept-data-loss"],
    {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    },
  );
}

export async function teardown() {
  removeTestDb();
}
