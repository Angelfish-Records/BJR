// web/lib/exegesis/apiRouteHelpers.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { withCorrelationId } from "@/app/api/_gate";
import type { GatePayload } from "@/app/home/gating/gateTypes";

export type ExegesisApiErr = {
  ok: false;
  error: string;
  gate?: GatePayload;
};

export function jsonExegesisErr(
  correlationId: string,
  status: number,
  body: ExegesisApiErr,
) {
  return withCorrelationId(NextResponse.json(body, { status }), correlationId);
}

export function normString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function bodyRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null
    ? (raw as Record<string, unknown>)
    : null;
}

export async function requireExegesisMemberId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const result = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;

  return result.rows[0]?.id || null;
}