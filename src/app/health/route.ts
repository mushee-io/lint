import { NextResponse } from "next/server"; export async function GET(){return NextResponse.json({status:"ok",service:"market-lint",timestamp:new Date().toISOString()})}
