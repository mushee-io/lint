import crypto from "node:crypto";

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function configuredSecretMatches(request: Request, envName: "WORKER_SECRET" | "BOOTSTRAP_SECRET", headerName: string) {
  const expected = process.env[envName];
  const provided = request.headers.get(headerName) ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(expected && provided && constantTimeEqual(expected, provided));
}
