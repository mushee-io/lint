import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

export const EVENT_GRAPH_VERSION = "event-graph-v2";
export const CONFIRMED_SAME_EVENT = "SAME_EVENT_CONFIRMED";
export const REVIEW_RELATIONSHIP_TYPES = ["POSSIBLE_SAME_EVENT"] as const;

export type RelationshipDecision = "CONFIRM_SAME_EVENT" | "MARK_RELATED" | "REJECT";

export async function getConfirmedEventClusterIds(eventId: string) {
  const seen = new Set<string>([eventId]);
  const queue = [eventId];

  while (queue.length) {
    const current = queue.shift()!;
    const edges = await prisma.eventRelationship.findMany({
      where: {
        relationshipType: CONFIRMED_SAME_EVENT,
        OR: [{ sourceEventId: current }, { targetEventId: current }],
      },
      select: { sourceEventId: true, targetEventId: true },
    });
    for (const edge of edges) {
      const neighbor = edge.sourceEventId === current ? edge.targetEventId : edge.sourceEventId;
      if (!seen.has(neighbor)) {
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [...seen];
}

export async function getPersistentEventGraph(eventId: string) {
  const event = await prisma.canonicalEvent.findUnique({
    where: { id: eventId },
    include: {
      markets: {
        orderBy: { lastIngestedAt: "desc" },
        select: {
          id: true,
          externalId: true,
          protocolName: true,
          title: true,
          status: true,
          freshness: true,
          liquidity: true,
          volume: true,
          lastIngestedAt: true,
        },
      },
      consensusSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!event) return null;

  const relationships = await prisma.eventRelationship.findMany({
    where: { OR: [{ sourceEventId: eventId }, { targetEventId: eventId }] },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
  });
  const neighborIds = [...new Set(relationships.flatMap((edge) => [edge.sourceEventId, edge.targetEventId]).filter((id) => id !== eventId))];
  const neighbors = neighborIds.length ? await prisma.canonicalEvent.findMany({
    where: { id: { in: neighborIds } },
    include: {
      markets: {
        orderBy: { lastIngestedAt: "desc" },
        select: {
          id: true,
          externalId: true,
          protocolName: true,
          title: true,
          status: true,
          freshness: true,
          liquidity: true,
          volume: true,
          lastIngestedAt: true,
        },
      },
    },
  }) : [];

  const confirmedClusterIds = await getConfirmedEventClusterIds(eventId);
  const clusterMarkets = confirmedClusterIds.length > 1 ? await prisma.market.findMany({
    where: { canonicalEventId: { in: confirmedClusterIds } },
    select: { id: true, protocolName: true },
  }) : event.markets.map((market) => ({ id: market.id, protocolName: market.protocolName }));

  return {
    version: EVENT_GRAPH_VERSION,
    rootEvent: {
      id: event.id,
      title: event.title,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
      markets: event.markets,
      latestConsensus: event.consensusSnapshots.at(0) ?? null,
    },
    nodes: [
      { id: event.id, title: event.title, description: event.description, marketCount: event.markets.length, root: true },
      ...neighbors.map((neighbor) => ({ id: neighbor.id, title: neighbor.title, description: neighbor.description, marketCount: neighbor.markets.length, root: false })),
    ],
    edges: relationships.map((edge) => ({
      id: edge.id,
      sourceEventId: edge.sourceEventId,
      targetEventId: edge.targetEventId,
      relationshipType: edge.relationshipType,
      confidence: edge.confidence,
      reason: edge.reason,
      createdAt: edge.createdAt.toISOString(),
      reviewRequired: edge.relationshipType === "POSSIBLE_SAME_EVENT",
    })),
    confirmedCluster: {
      eventIds: confirmedClusterIds,
      marketCount: clusterMarkets.length,
      protocols: [...new Set(clusterMarkets.map((market) => market.protocolName))],
    },
  };
}

export async function listRelationshipReviewQueue(limit = 100) {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250);
  const relationships = await prisma.eventRelationship.findMany({
    where: { relationshipType: { in: [...REVIEW_RELATIONSHIP_TYPES] } },
    orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    take: safeLimit,
  });
  if (!relationships.length) return [];

  const eventIds = [...new Set(relationships.flatMap((edge) => [edge.sourceEventId, edge.targetEventId]))];
  const events = await prisma.canonicalEvent.findMany({
    where: { id: { in: eventIds } },
    include: { markets: { select: { id: true, protocolName: true, title: true } } },
  });
  const byId = new Map(events.map((event) => [event.id, event]));

  return relationships.map((relationship) => ({
    ...relationship,
    sourceEvent: byId.get(relationship.sourceEventId) ?? null,
    targetEvent: byId.get(relationship.targetEventId) ?? null,
  }));
}

export async function decideEventRelationship(input: {
  relationshipId: string;
  decision: RelationshipDecision;
  organizationId: string;
  actorType: string;
  actorId?: string | null;
  note?: string | null;
}) {
  const relationship = await prisma.eventRelationship.findUnique({ where: { id: input.relationshipId } });
  if (!relationship) return null;

  const nextType = input.decision === "CONFIRM_SAME_EVENT"
    ? CONFIRMED_SAME_EVENT
    : input.decision === "MARK_RELATED"
      ? "RELATED_EVENT"
      : "REJECTED";
  const note = input.note?.trim().slice(0, 2_000) || null;

  const [updated] = await prisma.$transaction([
    prisma.eventRelationship.update({
      where: { id: relationship.id },
      data: {
        relationshipType: nextType,
        confidence: input.decision === "CONFIRM_SAME_EVENT" ? Math.max(relationship.confidence, 0.99) : relationship.confidence,
        reason: note ? `${relationship.reason} Operator note: ${note}` : relationship.reason,
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: `EVENT_RELATIONSHIP_${input.decision}`,
        resourceType: "EventRelationship",
        resourceId: relationship.id,
        metadata: {
          sourceEventId: relationship.sourceEventId,
          targetEventId: relationship.targetEventId,
          previousType: relationship.relationshipType,
          nextType,
          confidence: relationship.confidence,
          note,
          graphVersion: EVENT_GRAPH_VERSION,
        } as Prisma.InputJsonValue,
      },
    }),
    prisma.consensusSnapshot.deleteMany({
      where: { canonicalEventId: { in: [relationship.sourceEventId, relationship.targetEventId] } },
    }),
  ]);

  return updated;
}
