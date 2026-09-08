import { databaseHealth, prisma } from "@/lib/db";

const required = ["DATABASE_URL", "WEBHOOK_ENCRYPTION_KEY", "WORKER_SECRET", "BOOTSTRAP_SECRET"] as const;
const unsafeFragments = ["development-only", "development-worker", "development-bootstrap", "change-me", "changeme"];

async function main() {
  const issues: string[] = [];
  for (const name of required) {
    const value = process.env[name];
    if (!value) issues.push(`${name} is missing`);
    else if (name !== "DATABASE_URL" && unsafeFragments.some((fragment) => value.toLowerCase().includes(fragment))) issues.push(`${name} still uses a development placeholder`);
  }

  let database = null;
  try { database = await databaseHealth(); } catch (error) { issues.push(`database unavailable: ${error instanceof Error ? error.message : "unknown error"}`); }

  let migrations: Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }> = [];
  if (database?.ok) {
    try {
      migrations = await prisma.$queryRawUnsafe("SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC");
      if (!migrations.length) issues.push("no Prisma migrations are recorded");
      if (migrations.some((migration) => !migration.finished_at && !migration.rolled_back_at)) issues.push("an unfinished Prisma migration exists");
    } catch (error) {
      issues.push(`migration status unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  const sources = database?.ok ? await prisma.dataSourceState.findMany({ where: { source: { in: ["polymarket-gamma", "manifold-v0"] } }, orderBy: { source: "asc" } }) : [];
  for (const sourceName of ["polymarket-gamma", "manifold-v0"]) {
    const source = sources.find((item) => item.source === sourceName);
    if (!source) issues.push(`${sourceName} has not completed ingestion`);
    else if (["STALE", "UNKNOWN"].includes(source.freshness)) issues.push(`${sourceName} freshness is ${source.freshness}`);
    else if (source.consecutiveFailures > 0) issues.push(`${sourceName} has ${source.consecutiveFailures} consecutive ingestion failures`);
  }

  const deadWorkerJobs = database?.ok ? await prisma.workerJob.count({ where: { status: "DEAD_LETTER" } }) : 0;
  const deadWebhooks = database?.ok ? await prisma.webhookDelivery.count({ where: { status: "DEAD_LETTER" } }) : 0;
  if (deadWorkerJobs > 0) issues.push(`${deadWorkerJobs} worker jobs are dead-lettered`);
  if (deadWebhooks > 0) issues.push(`${deadWebhooks} webhook deliveries are dead-lettered`);

  const result = {
    status: issues.length ? "NOT_READY" : "READY",
    database,
    migrations: migrations.map((migration) => ({ name: migration.migration_name, finished: Boolean(migration.finished_at), rolledBack: Boolean(migration.rolled_back_at) })),
    sources: sources.map((source) => ({ source: source.source, freshness: source.freshness, lastSuccessAt: source.lastSuccessAt, consecutiveFailures: source.consecutiveFailures })),
    deadWorkerJobs,
    deadWebhooks,
    issues,
  };
  console.log(JSON.stringify(result, null, 2));
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
