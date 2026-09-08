import "dotenv/config";
import { prisma } from "@/lib/db";
import { runNextJob, scheduleRecurringJobs } from "@/lib/jobs";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  while (!stopping) {
    await scheduleRecurringJobs();
    const result = await runNextJob();
    if (!result) await sleep(2_000);
  }
}

main()
  .catch((error) => {
    console.error("Market Lint worker failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
