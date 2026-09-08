import { prisma } from "@/lib/db";

export type Freshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";
const FRESH_MS = 2 * 60_000;
const AGING_MS = 10 * 60_000;

export function classifyFreshness(timestamp?: Date | string | null, now = new Date()): Freshness {
  if (!timestamp) return "UNKNOWN";
  const value = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "UNKNOWN";
  const age = Math.max(0, now.getTime() - value.getTime());
  if (age <= FRESH_MS) return "FRESH";
  if (age <= AGING_MS) return "AGING";
  return "STALE";
}

export function freshnessPenalty(status: Freshness) {
  return { FRESH: 0, AGING: 8, STALE: 25, UNKNOWN: 35 }[status];
}

export async function refreshFreshness(now = new Date()) {
  const markets = await prisma.market.findMany({ select: { id: true, lastIngestedAt: true, freshness: true } });
  let changed = 0;
  for (const market of markets) {
    const next = classifyFreshness(market.lastIngestedAt, now);
    if (next !== market.freshness) {
      await prisma.market.update({ where: { id: market.id }, data: { freshness: next } });
      changed += 1;
    }
  }

  const sources = await prisma.dataSourceState.findMany();
  for (const source of sources) {
    const next = classifyFreshness(source.lastSuccessAt, now);
    if (next !== source.freshness) {
      await prisma.dataSourceState.update({ where: { id: source.id }, data: { freshness: next } });
    }
  }
  return { marketsChecked: markets.length, marketsChanged: changed, sourcesChecked: sources.length };
}
