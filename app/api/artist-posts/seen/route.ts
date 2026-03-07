// web/app/api/artist-posts/seen/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAnonId } from "@/lib/anon";
import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
} from "@/app/api/_gate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { slug?: string; slugs?: string[]; cap?: number };

const DOMAIN = "journal" as const;

function readSeenList(req: NextRequest): string[] {
  const raw = req.cookies.get("af_posts_seen_list")?.value ?? "";
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function writeSeenList(res: NextResponse, list: string[]) {
  const trimmed = list.slice(-50);
  res.cookies.set("af_posts_seen_list", JSON.stringify(trimmed), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function getSeenCount(req: NextRequest): number {
  const raw = req.cookies.get("af_posts_seen")?.value ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function setSeenCount(res: NextResponse, n: number) {
  res.cookies.set("af_posts_seen", String(Math.max(0, Math.floor(n))), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const { userId } = await auth();

  // Keep anon stable for both success and blocked responses.
  const anon = ensureAnonId(req);
  void anon.anonId;

  // Signed-in users are not gated; accept call but don’t mutate anon counters.
  if (userId) {
    const res = jsonOk(
      { ok: true, correlationId },
      { correlationId },
    );
    ensureAnonId(req, res);
    return res;
  }

  let json: Body = {};
  try {
    json = (await req.json()) as Body;
  } catch {}

  const capRaw = typeof json.cap === "number" ? json.cap : Number(json.cap);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : 0;

  const incoming: string[] = [];
  const one = (json.slug ?? "").trim();
  if (one) incoming.push(one);

  if (Array.isArray(json.slugs)) {
    for (const s of json.slugs) {
      if (typeof s === "string") {
        const t = s.trim();
        if (t) incoming.push(t);
      }
    }
  }

  const uniq = Array.from(new Set(incoming));
  if (uniq.length === 0) {
    return gateError(req, {
      correlationId,
      status: 400,
      domain: DOMAIN,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing slug.",
      error: "missing_slug",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const seenList = readSeenList(req);
  const seenSet = new Set(seenList);

  let added = 0;
  for (const slug of uniq) {
    if (!seenSet.has(slug)) {
      seenSet.add(slug);
      added += 1;
    }
  }

  const prevSeenCount = getSeenCount(req);
  const nextSeenCount = prevSeenCount + added;

  // Cap reached -> canonical wrapped gate contract.
  if (cap > 0 && nextSeenCount >= cap) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: DOMAIN,
      code: "JOURNAL_READ_CAP_REACHED",
      action: "login",
      message: "Sign in to keep reading.",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const res = jsonOk(
    { ok: true, seenCount: nextSeenCount, correlationId },
    { correlationId },
  );

  if (added > 0) {
    const nextList = Array.from(seenSet);
    writeSeenList(res, nextList);
    setSeenCount(res, nextSeenCount);
  }

  ensureAnonId(req, res);
  return res;
}