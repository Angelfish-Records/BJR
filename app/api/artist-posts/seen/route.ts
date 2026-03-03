// web/app/api/artist-posts/seen/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAnonId } from "@/lib/anon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { slug?: string; slugs?: string[]; cap?: number };

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
  const correlationId =
    req.headers.get("x-correlation-id") ?? crypto.randomUUID();

  const { userId } = await auth();

  const cookieRes = NextResponse.json({ ok: true, correlationId }, { status: 200 });

  // keep anon stable + persist cookie if needed
  const anon = ensureAnonId(req, cookieRes);
  void anon.anonId;

  // Signed-in users are not gated; accept call but don’t mutate anon counters
  if (userId) return cookieRes;

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
    return NextResponse.json(
      { ok: false, error: "missing_slug", correlationId },
      { status: 400 },
    );
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

  if (added > 0) {
    const nextList = Array.from(seenSet);
    writeSeenList(cookieRes, nextList);
    setSeenCount(cookieRes, nextSeenCount);
  }

  // Cap reached -> canonical GatePayload (payload-first blocking contract)
  if (cap > 0 && nextSeenCount >= cap) {
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        code: "AUTH_REQUIRED",
        action: "login",
        reason: "You’ve reached the anonymous reading limit.",
        message: "Sign in to keep reading.",
        domain: "journal",
        correlationId,
      },
      { status: 403, headers: cookieRes.headers },
    );
  }

  return NextResponse.json(
    { ok: true, seenCount: nextSeenCount, correlationId },
    { status: 200, headers: cookieRes.headers },
  );
}
