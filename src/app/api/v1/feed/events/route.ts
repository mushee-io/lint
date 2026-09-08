import { ok } from "@/lib/api"; import { events } from "@/lib/graph"; import { feed } from "@/lib/network"; export async function GET(){return ok(events.map(e=>feed(e.id)))}
