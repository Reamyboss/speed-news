import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorisation on the pipeline trigger.
 *
 * This endpoint causes outbound fetches and AI spend, so an unauthenticated
 * caller must never be able to fire it in production. These tests exist
 * because an earlier version accepted the presence of an `x-vercel-cron`
 * header as proof of origin — a header any client can set — which made the
 * secret decorative.
 *
 * The route reads config at module load, so each case re-imports it with a
 * fresh module registry after setting the environment.
 */

const ORIGINAL_ENV = { ...process.env };

/**
 * Next types NODE_ENV as read-only, so tests assign through a widened view of
 * process.env rather than the named property.
 */
function setEnv(values: Record<string, string | undefined>) {
  const env = process.env as Record<string, string | undefined>;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

async function loadRoute(env: Record<string, string | undefined>) {
  vi.resetModules();
  setEnv(env);
  return import("../src/app/api/cron/pipeline/route");
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/cron/pipeline", { headers });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV } as NodeJS.ProcessEnv;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV } as NodeJS.ProcessEnv;
  vi.resetModules();
});

describe("cron trigger authorisation", () => {
  it("rejects a caller who only asserts the Vercel cron header", async () => {
    const { GET } = await loadRoute({
      NODE_ENV: "production",
      CRON_SECRET: "a-sufficiently-long-secret",
    });
    // curl -H 'x-vercel-cron: 1' is all this used to take.
    const response = await GET(request({ "x-vercel-cron": "1" }) as never);
    expect(response.status).toBe(401);
  });

  it("rejects a wrong bearer token", async () => {
    const { GET } = await loadRoute({
      NODE_ENV: "production",
      CRON_SECRET: "a-sufficiently-long-secret",
    });
    const response = await GET(request({ authorization: "Bearer wrong" }) as never);
    expect(response.status).toBe(401);
  });

  it("rejects a request with no credential at all", async () => {
    const { GET } = await loadRoute({
      NODE_ENV: "production",
      CRON_SECRET: "a-sufficiently-long-secret",
    });
    const response = await GET(request() as never);
    expect(response.status).toBe(401);
  });

  it("refuses to run in production when no secret is configured", async () => {
    const { GET } = await loadRoute({ NODE_ENV: "production", CRON_SECRET: "" });
    // Default-open would let anyone force outbound fetches and AI spend.
    const response = await GET(request() as never);
    expect(response.status).toBe(401);
  });

  it("rejects a token that is a prefix of the secret", async () => {
    const { GET } = await loadRoute({
      NODE_ENV: "production",
      CRON_SECRET: "a-sufficiently-long-secret",
    });
    const response = await GET(request({ authorization: "Bearer a-suffic" }) as never);
    expect(response.status).toBe(401);
  });
});

describe("production configuration checks", () => {
  it("flags a missing CRON_SECRET as a blocker", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "", DATABASE_URL: "postgresql://user:pass@host:5432/db" });
    const { productionConfigIssues } = await import("../src/lib/env");
    const issues = productionConfigIssues();
    expect(issues.some((i) => i.level === "blocker" && /CRON_SECRET/.test(i.message))).toBe(true);
  });

  it("flags a short CRON_SECRET as guessable", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "short", DATABASE_URL: "postgresql://user:pass@host:5432/db" });
    const { productionConfigIssues } = await import("../src/lib/env");
    expect(productionConfigIssues().some((i) => /guessable/.test(i.message))).toBe(true);
  });

  it("flags SQLite in production, where instances share no filesystem", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "a-sufficiently-long-secret", DATABASE_URL: "file:./dev.db" });
    const { productionConfigIssues } = await import("../src/lib/env");
    expect(
      productionConfigIssues().some((i) => i.level === "blocker" && /SQLite/.test(i.message)),
    ).toBe(true);
  });

  it("treats an AI provider configured but keyless as a warning, not a blocker", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "a-sufficiently-long-secret", DATABASE_URL: "postgresql://user:pass@host:5432/db", NEXT_PUBLIC_SITE_URL: "https://example.com" });
    // The suite as a whole runs with AI_PROVIDER=none (tests/global-setup.ts),
    // so opt back in here to exercise the misconfiguration path.
    setEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: undefined });
    const { productionConfigIssues } = await import("../src/lib/env");
    const issues = productionConfigIssues();
    // Running without AI is a supported mode — the site is complete without it.
    expect(issues.every((i) => i.level !== "blocker")).toBe(true);
    expect(issues.some((i) => i.level === "warning" && /ANTHROPIC_API_KEY/.test(i.message))).toBe(
      true,
    );
  });

  it("says nothing about AI when the operator has explicitly opted out", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "a-sufficiently-long-secret", DATABASE_URL: "postgresql://user:pass@host:5432/db", NEXT_PUBLIC_SITE_URL: "https://example.com", AI_PROVIDER: "none", ANTHROPIC_API_KEY: undefined });
    const { productionConfigIssues } = await import("../src/lib/env");
    // AI_PROVIDER=none is a decision, not an oversight. Warning about it would
    // train operators to ignore this list.
    expect(productionConfigIssues()).toEqual([]);
  });

  it("reports nothing when production is configured correctly", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "production", CRON_SECRET: "a-sufficiently-long-secret", DATABASE_URL: "postgresql://user:pass@host:5432/db", NEXT_PUBLIC_SITE_URL: "https://example.com", ANTHROPIC_API_KEY: "sk-ant-test" });
    const { productionConfigIssues } = await import("../src/lib/env");
    expect(productionConfigIssues()).toEqual([]);
  });

  it("stays silent outside production", async () => {
    vi.resetModules();
    setEnv({ NODE_ENV: "development", CRON_SECRET: "", DATABASE_URL: "file:./dev.db" });
    const { productionConfigIssues } = await import("../src/lib/env");
    expect(productionConfigIssues()).toEqual([]);
  });
});
