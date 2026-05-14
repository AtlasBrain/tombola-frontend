// src/app/api/r/_ops/check/route.ts — Returns { allowed } for operator wallet check.

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/raas/operator-auth";

export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ allowed: false });
  return NextResponse.json({ allowed: isOperator(wallet) });
}
