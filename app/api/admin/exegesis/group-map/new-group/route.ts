//web/app/api/admin/exegesis/group-map/new-group/route.ts
import "server-only";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  await requireAdminMemberId();
  const canonicalGroupKey = `g:${crypto.randomUUID()}`; // v2 canonical
  return NextResponse.json({ ok: true, canonicalGroupKey }, { status: 200 });
}
