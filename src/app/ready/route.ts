import { databaseHealth, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await databaseHealth();
    await Promise.all([prisma.market.count(), prisma.dataSourceState.count(), prisma.workerJob.count()]);
    return Response.json({ status: "ready", mode: "persistent", database, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json({ status: "not_ready", mode: "persistent", error: error instanceof Error ? error.message : "Unknown readiness error", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
