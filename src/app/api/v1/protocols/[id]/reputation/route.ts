import { ok } from "@/lib/api"; import { reputation } from "@/lib/network"; export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){return ok(reputation((await params).id))}
