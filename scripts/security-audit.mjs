import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" });
let report;
try {
  report = JSON.parse(result.stdout || "{}");
} catch {
  console.error(result.stdout || result.stderr || "npm audit did not return JSON");
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const exceptions = new Set(["prisma", "@prisma/config", "deepmerge-ts", "mysql2"]);
const blocking = [];
const acknowledged = [];

for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const severity = String(vulnerability?.severity ?? "unknown");
  if (severity === "critical" || (severity === "high" && !exceptions.has(name))) {
    blocking.push({ name, severity, via: vulnerability?.via });
  } else if ((severity === "high" || severity === "moderate" || severity === "low") && exceptions.has(name)) {
    acknowledged.push({ name, severity });
  }
}

if (acknowledged.length) {
  console.warn("Acknowledged Prisma CLI dependency advisories (build/migration tooling, not request-path runtime):");
  for (const item of acknowledged) console.warn(`- ${item.name}: ${item.severity}`);
  console.warn("These exceptions must be removed when a patched stable Prisma release is available.");
}

if (blocking.length) {
  console.error("Blocking production dependency advisories detected:");
  console.error(JSON.stringify(blocking, null, 2));
  process.exit(1);
}

console.log("Production dependency audit gate passed: no unapproved high/critical advisories.");
