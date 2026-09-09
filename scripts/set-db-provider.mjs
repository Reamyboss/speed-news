#!/usr/bin/env node
/**
 * Prisma requires the datasource provider to be a compile-time literal, so it
 * cannot be driven by an env var directly. This script rewrites just the
 * `provider` line inside the `datasource db { ... }` block so the same schema
 * powers SQLite locally (zero infrastructure) and PostgreSQL in production.
 *
 * The schema itself is deliberately portable: no native enums, no scalar
 * lists, no Json columns. Those constraints are enforced in TypeScript/Zod
 * instead, which keeps dev, CI and production on one identical schema file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const SUPPORTED = new Set(["sqlite", "postgresql"]);

function detectProvider() {
  const explicit = (process.env.DATABASE_PROVIDER || "").trim().toLowerCase();
  if (explicit) {
    if (!SUPPORTED.has(explicit)) {
      throw new Error(
        `DATABASE_PROVIDER="${explicit}" is not supported. Use one of: ${[...SUPPORTED].join(", ")}`,
      );
    }
    return explicit;
  }
  // Infer from the connection string so a plain Postgres URL "just works".
  const url = (process.env.DATABASE_URL || "").trim();
  if (/^postgres(ql)?:\/\//i.test(url)) return "postgresql";
  if (url.startsWith("file:")) return "sqlite";
  return "sqlite";
}

const provider = detectProvider();
const original = readFileSync(SCHEMA, "utf8");

const datasourceBlock = /datasource\s+db\s*\{[\s\S]*?\}/;
const match = original.match(datasourceBlock);
if (!match) {
  console.error("[db:provider] Could not find a `datasource db { ... }` block in prisma/schema.prisma");
  process.exit(1);
}

const updatedBlock = match[0].replace(
  /provider\s*=\s*"[^"]*"/,
  `provider = "${provider}"`,
);
const next = original.replace(datasourceBlock, updatedBlock);

if (next !== original) {
  writeFileSync(SCHEMA, next);
  console.log(`[db:provider] schema.prisma datasource provider -> ${provider}`);
} else {
  console.log(`[db:provider] schema.prisma already set to ${provider}`);
}
