export type GuardDecision = "ALLOW" | "REVIEW" | "BLOCK";
export type GuardRisk = "LOW" | "MEDIUM" | "HIGH";
export type GuardCheckStatus = "PASS" | "WARN" | "FAIL";

export type GuardInput = {
  title: string;
  description?: string;
  outcomes?: string[];
  resolutionSource?: string;
  closeTime?: string;
};

export type GuardDuplicateCandidate = {
  id: string;
  title: string;
  protocol: string;
  similarity: number;
};

export type GuardCheck = {
  code: string;
  label: string;
  status: GuardCheckStatus;
  score: number;
  weight: number;
  message: string;
  suggestion?: string;
  evidence?: Record<string, unknown>;
};

export type GuardEvaluationResult = {
  decision: GuardDecision;
  marketLintScore: number;
  confidence: number;
  risks: {
    duplicate: GuardRisk;
    ambiguity: GuardRisk;
    resolution: GuardRisk;
    manipulation: GuardRisk;
  };
  checks: GuardCheck[];
  reasons: string[];
  warnings: string[];
  suggestions: string[];
  evidence: {
    duplicateCandidates: GuardDuplicateCandidate[];
    sourceReliability: number;
    failedChecks: string[];
    warningChecks: string[];
  };
  algorithmVersion: "guard-v2";
};

const SUBJECTIVE_TERMS = [
  "best",
  "better",
  "worst",
  "worse",
  "good",
  "bad",
  "successful",
  "major",
  "significant",
  "popular",
  "important",
  "soon",
  "likely",
  "acceptable",
  "impressive",
  "meaningful",
];

const VAGUE_TIME_TERMS = ["soon", "eventually", "in the near future", "this period", "later"];
const MEASURABLE_TERMS = /\b(reach|exceed|above|below|at least|at most|win|lose|elected|resign|launch|release|close|open|approve|reject|pass|fail|occur|happen|trade|price|vote|score|receive|announce)\b/i;
const DATE_IN_TITLE = /\b(20\d{2}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|before|after|by)\b/i;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskFromScore(score: number): GuardRisk {
  if (score < 50) return "HIGH";
  if (score < 75) return "MEDIUM";
  return "LOW";
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function containsAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.filter((term) => lower.includes(term));
}

function checkTitle(input: GuardInput): GuardCheck {
  const title = normalize(input.title);
  const subjective = containsAny(title, SUBJECTIVE_TERMS);
  let score = 100;
  if (title.length < 15) score -= 45;
  if (title.length > 220) score -= 25;
  if (!/[?]$/.test(title) && !/^(will|does|do|is|are|has|have|can|could|would|who|what|when)\b/i.test(title)) score -= 15;
  if (subjective.length) score -= Math.min(45, subjective.length * 18);
  score = clamp(score);
  const status: GuardCheckStatus = score < 50 ? "FAIL" : score < 80 ? "WARN" : "PASS";
  return {
    code: "TITLE_CLARITY",
    label: "Title clarity",
    status,
    score,
    weight: 20,
    message: subjective.length
      ? `The title contains subjective wording: ${subjective.join(", ")}.`
      : score >= 80
        ? "The market question is concise and structurally clear."
        : "The market question needs clearer, more objective wording.",
    suggestion: status === "PASS" ? undefined : "Rewrite the title as one objective yes/no question with a measurable condition.",
    evidence: { length: title.length, subjectiveTerms: subjective },
  };
}

function checkDeadline(input: GuardInput, now: Date): GuardCheck {
  const raw = input.closeTime?.trim();
  if (!raw) {
    const titleHasTime = DATE_IN_TITLE.test(input.title);
    return {
      code: "DEADLINE",
      label: "Observation deadline",
      status: "FAIL",
      score: titleHasTime ? 40 : 15,
      weight: 15,
      message: titleHasTime
        ? "The title mentions a time condition, but no machine-readable closeTime was supplied."
        : "No explicit observation deadline was supplied.",
      suggestion: "Provide closeTime as an ISO-8601 UTC timestamp and state the deadline in the market wording.",
      evidence: { closeTime: null, titleHasTime },
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return {
      code: "DEADLINE",
      label: "Observation deadline",
      status: "FAIL",
      score: 0,
      weight: 15,
      message: "closeTime is not a valid ISO-8601 timestamp.",
      suggestion: "Use an unambiguous ISO-8601 timestamp such as 2026-12-31T23:59:59Z.",
      evidence: { closeTime: raw },
    };
  }

  if (parsed.getTime() <= now.getTime()) {
    return {
      code: "DEADLINE",
      label: "Observation deadline",
      status: "FAIL",
      score: 0,
      weight: 15,
      message: "The supplied closeTime is in the past.",
      suggestion: "Set a future observation deadline or mark the market as historical instead of listing it as open.",
      evidence: { closeTime: parsed.toISOString(), now: now.toISOString() },
    };
  }

  const vague = containsAny(`${input.title} ${input.description ?? ""}`, VAGUE_TIME_TERMS);
  return {
    code: "DEADLINE",
    label: "Observation deadline",
    status: vague.length ? "WARN" : "PASS",
    score: vague.length ? 72 : 100,
    weight: 15,
    message: vague.length ? "A valid deadline exists, but the human-readable wording contains vague time language." : "A future machine-readable observation deadline is present.",
    suggestion: vague.length ? "Replace vague time wording with the exact date/time used by closeTime." : undefined,
    evidence: { closeTime: parsed.toISOString(), vagueTerms: vague },
  };
}

function assessSource(raw?: string) {
  if (!raw?.trim()) return { score: 0, reliability: 0, reason: "missing", host: null as string | null };
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    const privateHost = host === "localhost" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (privateHost) return { score: 0, reliability: 5, reason: "private-host", host };
    if (url.protocol !== "https:") return { score: 35, reliability: 35, reason: "not-https", host };
    const highAuthority = host.endsWith(".gov") || host.includes("reuters.com") || host.includes("apnews.com") || host.includes("sec.gov") || host.includes("federalreserve.gov");
    const marketData = host.includes("coinbase.com") || host.includes("kraken.com") || host.includes("binance.com") || host.includes("coingecko.com");
    const reliability = highAuthority ? 95 : marketData ? 86 : 76;
    return { score: reliability, reliability, reason: "public-https", host };
  } catch {
    return { score: 0, reliability: 0, reason: "invalid-url", host: null as string | null };
  }
}

function checkResolutionSource(input: GuardInput): GuardCheck & { sourceReliability: number } {
  const source = assessSource(input.resolutionSource);
  const status: GuardCheckStatus = source.score < 40 ? "FAIL" : source.score < 75 ? "WARN" : "PASS";
  const message = source.reason === "missing"
    ? "No resolution source was supplied."
    : source.reason === "invalid-url"
      ? "The resolution source is not a valid URL."
      : source.reason === "private-host"
        ? "The resolution source points to a private or local host."
        : source.reason === "not-https"
          ? "The resolution source is public but does not use HTTPS."
          : "The resolution source is a public HTTPS endpoint.";
  return {
    code: "RESOLUTION_SOURCE",
    label: "Resolution source",
    status,
    score: source.score,
    weight: 20,
    message,
    suggestion: status === "PASS" ? undefined : "Provide a stable public HTTPS source that independently determines the market outcome.",
    evidence: { host: source.host, reason: source.reason },
    sourceReliability: source.reliability,
  };
}

function checkOutcomes(input: GuardInput): GuardCheck {
  const outcomes = (input.outcomes ?? []).map((item) => normalize(String(item))).filter(Boolean);
  const deduped = new Set(outcomes.map((item) => item.toLowerCase()));
  if (outcomes.length < 2) {
    return {
      code: "OUTCOMES",
      label: "Outcome completeness",
      status: "FAIL",
      score: 20,
      weight: 10,
      message: "At least two explicit outcomes are required.",
      suggestion: "Supply the complete outcome set. For a binary market use [\"YES\", \"NO\"].",
      evidence: { outcomes },
    };
  }
  if (deduped.size !== outcomes.length) {
    return {
      code: "OUTCOMES",
      label: "Outcome completeness",
      status: "FAIL",
      score: 25,
      weight: 10,
      message: "The outcome set contains duplicate values.",
      suggestion: "Remove duplicate outcomes and ensure every possible settlement result is represented once.",
      evidence: { outcomes },
    };
  }
  const binary = outcomes.length === 2 && deduped.has("yes") && deduped.has("no");
  return {
    code: "OUTCOMES",
    label: "Outcome completeness",
    status: "PASS",
    score: binary ? 100 : 88,
    weight: 10,
    message: binary ? "A complete binary YES/NO outcome set is present." : "Multiple unique outcomes are present.",
    evidence: { outcomes, binary },
  };
}

function checkResolvability(input: GuardInput): GuardCheck {
  const text = `${input.title} ${input.description ?? ""}`;
  const subjective = containsAny(text, SUBJECTIVE_TERMS);
  const measurable = MEASURABLE_TERMS.test(text) || /\b\d+(?:\.\d+)?%?\b/.test(text);
  let score = 100;
  if (!measurable) score -= 35;
  if (subjective.length) score -= Math.min(55, subjective.length * 20);
  score = clamp(score);
  const status: GuardCheckStatus = score < 50 ? "FAIL" : score < 80 ? "WARN" : "PASS";
  return {
    code: "RESOLVABILITY",
    label: "Objective resolvability",
    status,
    score,
    weight: 20,
    message: status === "PASS" ? "The outcome condition is objectively observable." : "The outcome condition may require subjective interpretation.",
    suggestion: status === "PASS" ? undefined : "Define an observable event, numeric threshold, named authority, and exact treatment of edge cases.",
    evidence: { measurableConditionDetected: measurable, subjectiveTerms: subjective },
  };
}

function checkSettlementCriteria(input: GuardInput): GuardCheck {
  const description = normalize(input.description ?? "");
  if (!description) {
    return {
      code: "SETTLEMENT_CRITERIA",
      label: "Settlement criteria",
      status: "WARN",
      score: 50,
      weight: 10,
      message: "No settlement description was supplied.",
      suggestion: "Add settlement rules covering the observation source, cutoff time, edge cases, postponements, and invalidation conditions.",
      evidence: { descriptionLength: 0 },
    };
  }
  const ruleTerms = /\b(resolve|resolution|settle|settlement|according to|source|if|otherwise|deadline|cutoff)\b/i.test(description);
  const score = clamp(55 + (description.length >= 80 ? 25 : 0) + (ruleTerms ? 20 : 0));
  const status: GuardCheckStatus = score < 70 ? "WARN" : "PASS";
  return {
    code: "SETTLEMENT_CRITERIA",
    label: "Settlement criteria",
    status,
    score,
    weight: 10,
    message: status === "PASS" ? "Settlement instructions provide useful resolution context." : "The settlement description is too thin for reliable dispute handling.",
    suggestion: status === "PASS" ? undefined : "Expand the description with explicit settlement and edge-case rules.",
    evidence: { descriptionLength: description.length, ruleLanguageDetected: ruleTerms },
  };
}

function checkDuplicates(duplicates: GuardDuplicateCandidate[]): GuardCheck {
  const best = duplicates[0];
  if (!best) {
    return {
      code: "DUPLICATE_MARKET",
      label: "Duplicate market",
      status: "PASS",
      score: 100,
      weight: 5,
      message: "No materially similar persisted market was found.",
      evidence: { candidateCount: 0 },
    };
  }
  const score = clamp(100 - best.similarity * 100);
  const status: GuardCheckStatus = best.similarity >= 0.75 ? "FAIL" : best.similarity >= 0.45 ? "WARN" : "PASS";
  return {
    code: "DUPLICATE_MARKET",
    label: "Duplicate market",
    status,
    score,
    weight: 5,
    message: status === "PASS" ? "Similar markets exist but are below the review threshold." : `A persisted market is ${Math.round(best.similarity * 100)}% similar to this title.`,
    suggestion: status === "PASS" ? undefined : "Compare the candidate's entity, threshold, deadline, and settlement source before creating another market.",
    evidence: { candidateCount: duplicates.length, topCandidate: best },
  };
}

function manipulationRisk(input: GuardInput) {
  const text = `${input.title} ${input.description ?? ""}`.toLowerCase();
  const selfReferential = /\b(this market|market price|prediction market odds|our token|our protocol)\b/.test(text);
  const lowLiquidityAsset = /\bmemecoin|meme coin|microcap|micro-cap\b/.test(text);
  if (selfReferential) return "HIGH" as const;
  if (lowLiquidityAsset) return "MEDIUM" as const;
  return "LOW" as const;
}

export function evaluateGuard(input: GuardInput, duplicateCandidates: GuardDuplicateCandidate[] = [], now = new Date()): GuardEvaluationResult {
  const source = checkResolutionSource(input);
  const checks: GuardCheck[] = [
    checkTitle(input),
    checkDeadline(input, now),
    source,
    checkOutcomes(input),
    checkResolvability(input),
    checkSettlementCriteria(input),
    checkDuplicates(duplicateCandidates),
  ];

  const weightTotal = checks.reduce((sum, check) => sum + check.weight, 0);
  const marketLintScore = clamp(checks.reduce((sum, check) => sum + check.score * check.weight, 0) / weightTotal);
  const failedChecks = checks.filter((check) => check.status === "FAIL");
  const warningChecks = checks.filter((check) => check.status === "WARN");
  const criticalFailure = failedChecks.some((check) => check.code === "DEADLINE" && check.score === 0)
    || (failedChecks.some((check) => check.code === "RESOLUTION_SOURCE") && failedChecks.some((check) => check.code === "RESOLVABILITY"));

  let decision: GuardDecision;
  if (criticalFailure || marketLintScore < 45 || failedChecks.length >= 3) decision = "BLOCK";
  else if (failedChecks.length > 0 || warningChecks.length > 0 || marketLintScore < 82) decision = "REVIEW";
  else decision = "ALLOW";

  const duplicateScore = checks.find((check) => check.code === "DUPLICATE_MARKET")?.score ?? 100;
  const ambiguityScore = Math.round(((checks.find((check) => check.code === "TITLE_CLARITY")?.score ?? 0) + (checks.find((check) => check.code === "RESOLVABILITY")?.score ?? 0) + (checks.find((check) => check.code === "SETTLEMENT_CRITERIA")?.score ?? 0)) / 3);
  const resolutionScore = Math.round((source.score + (checks.find((check) => check.code === "DEADLINE")?.score ?? 0)) / 2);
  const manipulation = manipulationRisk(input);
  const suggestions = unique(checks.map((check) => check.suggestion).filter((value): value is string => Boolean(value)));
  const warnings = checks.filter((check) => check.status !== "PASS").map((check) => check.message);
  const reasons = decision === "ALLOW"
    ? ["All mandatory Guard checks passed and the market exceeds the automatic-listing threshold."]
    : checks.filter((check) => check.status === "FAIL").map((check) => `${check.label}: ${check.message}`).concat(
        warningChecks.map((check) => `${check.label}: ${check.message}`),
      ).slice(0, 8);
  const confidence = clamp(100 - warningChecks.length * 5 - (duplicateCandidates.length ? 3 : 0));

  return {
    decision,
    marketLintScore,
    confidence,
    risks: {
      duplicate: riskFromScore(duplicateScore),
      ambiguity: riskFromScore(ambiguityScore),
      resolution: riskFromScore(resolutionScore),
      manipulation,
    },
    checks,
    reasons,
    warnings,
    suggestions,
    evidence: {
      duplicateCandidates,
      sourceReliability: source.sourceReliability,
      failedChecks: failedChecks.map((check) => check.code),
      warningChecks: warningChecks.map((check) => check.code),
    },
    algorithmVersion: "guard-v2",
  };
}
