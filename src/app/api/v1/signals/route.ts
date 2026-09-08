import { ok } from "@/lib/api"; import { signals } from "@/lib/network"; export async function GET(){return ok(signals())}
