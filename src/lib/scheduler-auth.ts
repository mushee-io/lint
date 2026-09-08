import crypto from "node:crypto";
import { configuredSecretMatches } from "@/lib/internal-auth";

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "market-lint-scheduler";
const ALLOWED_WORKFLOWS = new Set([
  "mushee-io/lint/.github/workflows/production-scheduler.yml@refs/heads/master",
  "mushee-io/lint/.github/workflows/validation-snapshot.yml@refs/heads/master",
]);

type GitHubClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  ref?: string;
  workflow_ref?: string;
};

type CachedJwks = {
  expiresAt: number;
  keys: Array<JsonWebKey & { kid?: string; alg?: string }>;
};

let cachedJwks: CachedJwks | null = null;

function decodeJson<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

async function getJwks() {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;
  const response = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub OIDC JWKS unavailable (${response.status})`);
  const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("GitHub OIDC JWKS contained no keys");
  cachedJwks = { keys: body.keys, expiresAt: Date.now() + 10 * 60_000 };
  return body.keys;
}

function audienceMatches(audience: string | string[] | undefined) {
  return Array.isArray(audience) ? audience.includes(GITHUB_OIDC_AUDIENCE) : audience === GITHUB_OIDC_AUDIENCE;
}

export function validateGitHubSchedulerClaims(claims: GitHubClaims, nowSeconds = Math.floor(Date.now() / 1000)) {
  const skew = 30;
  if (claims.iss !== GITHUB_OIDC_ISSUER) return false;
  if (!audienceMatches(claims.aud)) return false;
  if (claims.repository !== "mushee-io/lint") return false;
  if (claims.ref !== "refs/heads/master") return false;
  if (!claims.workflow_ref || !ALLOWED_WORKFLOWS.has(claims.workflow_ref)) return false;
  if (!claims.exp || claims.exp < nowSeconds - skew) return false;
  if (claims.nbf && claims.nbf > nowSeconds + skew) return false;
  return true;
}

async function verifyGitHubOidc(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) return false;

  const keys = await getJwks();
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) return false;

  const key = await crypto.webcrypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.webcrypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(encodedSignature, "base64url"),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!validSignature) return false;

  return validateGitHubSchedulerClaims(decodeJson<GitHubClaims>(encodedPayload));
}

export async function authorizeSchedulerRequest(request: Request) {
  if (configuredSecretMatches(request, "WORKER_SECRET", "x-worker-secret")) {
    return { ok: true as const, actor: "worker-secret" as const };
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || token === auth) return { ok: false as const, actor: "none" as const };

  try {
    const ok = await verifyGitHubOidc(token);
    return ok ? { ok: true as const, actor: "github-oidc" as const } : { ok: false as const, actor: "github-oidc" as const };
  } catch {
    return { ok: false as const, actor: "github-oidc" as const };
  }
}
