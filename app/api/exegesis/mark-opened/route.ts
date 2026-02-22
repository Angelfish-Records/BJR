// web/app/api/exegesis/mark-opened/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { ensureAnonId } from "@/lib/anon";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  anonId: string;   // cookie anon id (also used as session id here)
  opened: boolean;
  count: number;
  limit: number;
};

type ApiErr = { ok: false; error: string };

function norm(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function isGroupKeyV1(groupKey: string): boolean {
  const g = norm(groupKey);
  if (!g.startsWith("lk:")) return false;
  const lk = g.slice(3).trim();
  if (!lk) return false;
  if (lk.length > 200) return false;
  return true;
}

const ANON_LIMIT = 8;

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const res = NextResponse.json<ApiErr>(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
    ensureAnonId(req, res);
    return res;
  }

  const b =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  if (!b) {
    const res = NextResponse.json<ApiErr>(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
    ensureAnonId(req, res);
    return res;
  }

  const trackId = norm(b.trackId);
  const groupKey = norm(b.groupKey);

  if (!trackId) {
    const res = NextResponse.json<ApiErr>(
      { ok: false, error: "Missing trackId." },
      { status: 400 },
    );
    ensureAnonId(req, res);
    return res;
  }

  if (!groupKey || !isGroupKeyV1(groupKey)) {
    const res = NextResponse.json<ApiErr>(
      { ok: false, error: "Invalid groupKey." },
      { status: 400 },
    );
    ensureAnonId(req, res);
    return res;
  }

  // Prepare a response so we can persist the anon cookie if newly minted.
  const baseRes = NextResponse.json<ApiOk>(
    { ok: true, anonId: "pending", opened: false, count: 0, limit: ANON_LIMIT },
    { status: 200 },
  );
  const { anonId } = ensureAnonId(req, baseRes);

  // In this v1 scheme, we simply use anonId as sessionId.
  const sessionId = anonId;

  try {
    // Ensure session row exists (schema has anon_exegesis_sessions(id, anon_id))
    await sql`
      insert into anon_exegesis_sessions (id, anon_id)
      values (${sessionId}, ${anonId})
      on conflict (id) do nothing
    `;

    const ins = await sql<{ inserted: boolean }>`
      with inserted as (
        insert into anon_exegesis_thread_opens (session_id, track_id, group_key)
        values (${sessionId}, ${trackId}, ${groupKey})
        on conflict (session_id, track_id, group_key) do nothing
        returning 1
      )
      select exists(select 1 from inserted) as inserted
    `;
    const opened = Boolean(ins.rows?.[0]?.inserted);

    const countRes = await sql<{ n: number }>`
      select count(*)::int as n
      from anon_exegesis_thread_opens
      where session_id = ${sessionId}
    `;
    const n = Number(countRes.rows?.[0]?.n ?? 0);

    return NextResponse.json<ApiOk>(
      { ok: true, anonId, opened, count: n, limit: ANON_LIMIT },
      { status: 200, headers: baseRes.headers },
    );
  } catch (e: unknown) {
    return NextResponse.json<ApiErr>(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error." },
      { status: 500, headers: baseRes.headers },
    );
  }
}