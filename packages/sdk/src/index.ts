export class MarketLint {
  constructor(private options: { baseUrl: string; apiKey?: string }) {}

  private async call(path: string, body?: unknown) {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}`} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`Market Lint API error: ${response.status}`);
    return (await response.json()).data;
  }

  analyze(input: unknown) { return this.call("/api/v1/analyze", input); }
  search(query: string) { return this.call("/api/v1/search", { query }); }
  findDuplicates(input: unknown) { return this.call("/api/v1/duplicates", input); }
  listEvents(limit = 50) { return this.call(`/api/v1/events?limit=${encodeURIComponent(String(limit))}`); }
  getEvent(id: string) { return this.call(`/api/v1/events/${encodeURIComponent(id)}`); }
  getMarket(id: string) { return this.call(`/api/v1/markets/${id}`); }
  guardMarket(input: unknown) { return this.call("/api/v1/guard", input); }
  getMarketIntelligence(marketId: string) { return this.call(`/api/v1/markets/${encodeURIComponent(marketId)}/intelligence`); }
  reviewMarket(marketId: string, mode: "auto" | "ai" | "deterministic" = "auto") { return this.call(`/api/v1/markets/${encodeURIComponent(marketId)}/review`, { mode }); }
  decideMarket(marketId: string, decision: "APPROVE" | "HOLD" | "REJECT", note?: string) { return this.call(`/api/v1/markets/${encodeURIComponent(marketId)}/decision`, { decision, note }); }
  watchMarket(marketId: string, protocolId?: string) { return this.call("/api/v1/watch", { marketId, ...(protocolId ? { protocolId } : {}) }); }
  getMarketHealth(marketId: string) { return this.call(`/api/v1/watch/${marketId}`); }
  getRisks(marketId: string) { return this.call(`/api/v1/watch/${marketId}`); }
  getSignals() { return this.call("/api/v1/signals"); }
  getIncidents(filters: { status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"; severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.severity) params.set("severity", filters.severity);
    if (filters.limit) params.set("limit", String(filters.limit));
    const query = params.toString();
    return this.call(`/api/v1/incidents${query ? `?${query}` : ""}`);
  }
  actOnIncident(incidentId: string, action: "ACKNOWLEDGE" | "RESOLVE" | "REOPEN", note?: string) { return this.call(`/api/v1/incidents/${encodeURIComponent(incidentId)}`, { action, note }); }
  getResolutionReadiness(marketId: string) { return this.call(`/api/v1/markets/${marketId}/resolution-readiness`); }
  getEventDivergence(eventId: string) { return this.call(`/api/v1/events/${encodeURIComponent(eventId)}/divergence`); }
  getConsensus(eventId: string) { return this.call(`/api/v1/events/${encodeURIComponent(eventId)}/consensus`); }
  getConsensusHistory(eventId: string) { return this.getConsensus(eventId); }
  getEventConfidence(eventId: string) { return this.getConsensus(eventId); }
  getProtocolReliability(protocol: string) { return this.call(`/api/v1/protocols/${encodeURIComponent(protocol)}/reputation`); }
  getProtocolReputation(id: string) { return this.getProtocolReliability(id); }
  getEventGraph(id: string) { return this.call(`/api/v1/events/${encodeURIComponent(id)}/graph`); }
  getEventRelationshipReviewQueue(limit = 100) { return this.call(`/api/v1/event-relationships?limit=${encodeURIComponent(String(limit))}`); }
  decideEventRelationship(relationshipId: string, decision: "CONFIRM_SAME_EVENT" | "MARK_RELATED" | "REJECT", note?: string) { return this.call(`/api/v1/event-relationships/${encodeURIComponent(relationshipId)}`, { decision, note }); }
  getEnterpriseUsage() { return this.call("/api/v1/enterprise/usage"); }
  getEnterpriseReadiness() { return this.call("/api/v1/enterprise/readiness"); }
  getTenantPolicy() { return this.call("/api/v1/enterprise/policy"); }
  getWebhookStats() { return this.call("/api/v1/webhooks/stats"); }
  rotateApiKey(id: string) { return this.call("/api/v1/api-keys/rotate", { id }); }
  activatePartnerPilot(pilotId: string) { return this.call(`/api/v1/pilots/${encodeURIComponent(pilotId)}/activate`, {}); }
  getPartnerPilotStatus(pilotId: string) { return this.call(`/api/v1/pilots/${encodeURIComponent(pilotId)}/status`); }
  ingestPartnerMarkets(markets: unknown[], autoWatch = true) { return this.call("/api/v1/partner/markets", { markets, autoWatch }); }
  submitFeedback(input: { targetType: string; targetId: string; label: "USEFUL" | "EXPECTED" | "FALSE_POSITIVE" | "FALSE_NEGATIVE" | "AGREE" | "DISAGREE" | "UNCERTAIN"; comment?: string; algorithmVersion?: string }) { return this.call("/api/v1/feedback", input); }
  createWebhook(url: string, description?: string) { return this.call("/api/v1/webhooks", { url, description }); }
  getPilotMetrics(pilotId: string) { return this.call(`/api/v1/pilots/${encodeURIComponent(pilotId)}/report`); }
  generatePilotReport(pilotId: string) { return this.call(`/api/v1/pilots/${encodeURIComponent(pilotId)}/report?generate=1`); }
  ask(question: string) { return this.call("/api/v1/ask", { question }); }
  getHistory(eventId: string) { return this.call(`/api/v1/feed/events/${eventId}`); }
  resolveMarketId(protocol: string, externalMarketId: string) { return this.call(`/api/v1/resolve-market-id?protocol=${encodeURIComponent(protocol)}&externalMarketId=${encodeURIComponent(externalMarketId)}`); }
}
