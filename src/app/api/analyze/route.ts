import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { IntelligenceReport } from "@/lib/report";
import { scoreMarket } from "@/lib/market-score";
import { findPublicDuplicates } from "@/lib/public-markets";

function parseOutcomes(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function deterministicReport(market: Record<string, unknown>, duplicateRisk: string, duplicateCount: number): IntelligenceReport {
  const outcomes = parseOutcomes(market.outcomes);
  const score = scoreMarket({
    title: String(market.title ?? ""),
    description: typeof market.description === "string" ? market.description : "",
    outcomes,
    resolutionSource: typeof market.source === "string" ? market.source : "",
    resolutionTime: typeof market.resolution === "string" ? market.resolution : "",
  });
  const notes: string[] = [];
  const improvements: string[] = [];
  if (score.clarity < 75) { notes.push("The market wording leaves material interpretation risk."); improvements.push("Rewrite the proposition so one objective observation determines YES or NO."); }
  if (score.outcomeCompleteness < 75) { notes.push("The supplied outcomes are incomplete or underspecified."); improvements.push("List mutually exclusive, exhaustive settlement outcomes."); }
  if (score.resolutionQuality < 75 || score.settlementAmbiguity < 75) { notes.push("Settlement criteria are not sufficiently explicit for a low-dispute resolution."); improvements.push("Define the exact metric, observation time, edge cases, and settlement procedure."); }
  if (score.sourceReliability < 75) { notes.push("The resolution source is missing or weakly specified."); improvements.push("Name a primary authoritative resolution source and a fallback hierarchy."); }
  if (duplicateRisk !== "LOW") { notes.push(`${duplicateCount} similar live public market${duplicateCount === 1 ? "" : "s"} were found; duplicate risk is ${duplicateRisk}.`); improvements.push("Compare the proposed market with the live matches before listing to avoid duplicated or conflicting contracts."); }
  if (!notes.length) notes.push("No major deterministic construction issue was found in the supplied wording.");
  if (!improvements.length) improvements.push("Preserve the current wording and settlement evidence in the final market specification.");
  const source = typeof market.source === "string" && market.source.trim() ? market.source.trim() : null;
  return {
    qualityScore: score.overall,
    summary: score.overall >= 82 ? "The supplied market is comparatively well specified. Review the live duplicate evidence before publishing." : score.overall >= 60 ? "The market is usable but still contains construction or settlement risk worth fixing before launch." : "The market needs material clarification before it is suitable for a low-dispute listing.",
    ambiguityNotes: notes,
    suggestedImprovements: improvements,
    resolutionSources: source ? [source] : ["No authoritative source was supplied. Add a primary source and explicit fallback precedence."],
  };
}

export async function POST(request: Request) {
  const market = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!market?.title) return NextResponse.json({ error: "A market title is required." }, { status: 400 });

  let duplicateRisk = "UNAVAILABLE";
  let duplicateCount = 0;
  let duplicateEvidence: unknown = null;
  try {
    const duplicates = await findPublicDuplicates({ title: String(market.title), description: typeof market.description === "string" ? market.description : undefined });
    duplicateRisk = duplicates.duplicateRisk;
    duplicateCount = duplicates.possibleDuplicates.length;
    duplicateEvidence = duplicates;
  } catch (error) {
    duplicateEvidence = { mode: "LIVE_PUBLIC_DATA_UNAVAILABLE", error: error instanceof Error ? error.message : "Public sources unavailable" };
  }

  const fallback = deterministicReport(market, duplicateRisk, duplicateCount);
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ report: fallback, duplicateEvidence, mode: "deterministic" });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.MARKET_LINT_AI_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are Market Lint. Return JSON with qualityScore (0-100), summary, ambiguityNotes, suggestedImprovements, resolutionSources. Ground the review in the supplied market and deterministic evidence. Do not invent sources, markets, facts, or live data." },
        { role: "user", content: JSON.stringify({ market, deterministicReport: fallback, duplicateEvidence }) },
      ],
    });
    const report = JSON.parse(completion.choices[0].message.content ?? "{}") as IntelligenceReport;
    return NextResponse.json({ report: { ...report, qualityScore: fallback.qualityScore }, duplicateEvidence, mode: "ai-grounded" });
  } catch (error) {
    return NextResponse.json({ report: fallback, duplicateEvidence, mode: "deterministic-fallback", providerError: error instanceof Error ? error.message : "AI provider unavailable" });
  }
}
