import { GET as getLiveRain } from "../src/app/api/v1/live/rain/route";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

async function main() {
  const response = await getLiveRain(new Request("http://market-lint.local/api/v1/live/rain?limit=5"));
  const result = (await response.json()) as JsonRecord;
  const data = asRecord(result.data);
  const payload = asRecord(data?.payload);
  const guardPreview = asRecord(data?.guardPreview);

  if (!response.ok) throw new Error(`Live Rain preview returned HTTP ${response.status}: ${JSON.stringify(result)}`);
  if (data?.accepted !== true || data?.mode !== "LIVE_PUBLIC_RAIN") throw new Error(`Unexpected live Rain response: ${JSON.stringify(result)}`);
  if (data?.protocol !== "Rain") throw new Error(`Rain protocol label missing: ${JSON.stringify(result)}`);
  if (!payload || typeof payload.externalId !== "string" || typeof payload.title !== "string") throw new Error(`Rain payload missing id/title: ${JSON.stringify(result)}`);
  if (guardPreview?.algorithmVersion !== "guard-v2") throw new Error(`Guard v2 did not run: ${JSON.stringify(result)}`);

  console.log(JSON.stringify({
    ok: true,
    source: data.source,
    externalId: payload.externalId,
    title: payload.title,
    closeTime: payload.closeTime || null,
    decision: guardPreview.decision,
    marketLintScore: guardPreview.marketLintScore,
    algorithmVersion: guardPreview.algorithmVersion,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
