import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureAnonId } from "@/lib/anon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { slug?: string; slugs?: string[]; cap?: number };

type SeenResponse = {
  ok: true;
  seenCount: number;
  cap: number | null;
  capReached: boolean;
};

const SEEN_COUNT_COOKIE = "af_posts_seen";
const SEEN_LIST_COOKIE = "af_posts_seen_list";
const MAX_SEEN_LIST = 50;

function readSeenList(req: NextRequest): string[] {
  const raw = req.cookies.get(SEEN_LIST_COOKIE)?.value ?? "";
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(-MAX_SEEN_LIST);
  } catch {
    return [];
  }
}

function writeSeenList(res: NextResponse, list: string[]) {
  res.cookies.set(SEEN_LIST_COOKIE, JSON.stringify(list.slice(-MAX_SEEN_LIST)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function getSeenCount(req: NextRequest): number {
  const raw = req.cookies.get(SEEN_COUNT_COOKIE)?.value ?? "0";
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function setSeenCount(res: NextResponse, n: number) {
  res.cookies.set(SEEN_COUNT_COOKIE, String(Math.max(0, Math.floor(n))), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function parseCap(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseIncomingSlugs(body: Body): string[] {
  const values: string[] = [];

  const slug = body.slug?.trim();
  if (slug) values.push(slug);

  if (Array.isArray(body.slugs)) {
    for (const item of body.slugs) {
      const trimmed = item.trim();
      if (trimmed) values.push(trimmed);
    }
  }

  return Array.from(new Set(values));
}

async function readBody(req: NextRequest): Promise<Body> {
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Body;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  const body = await readBody(req);
  const cap = parseCap(body.cap);

  if (userId) {
    const res = NextResponse.json<SeenResponse>(
      {
        ok: true,
        seenCount: 0,
        cap,
        capReached: false,
      },
      { status: 200 },
    );

    ensureAnonId(req, res);
    return res;
  }

  const incomingSlugs = parseIncomingSlugs(body);
  const previousSeenList = readSeenList(req);
  const seenSet = new Set(previousSeenList);

  let added = 0;

  for (const slug of incomingSlugs) {
    if (!seenSet.has(slug)) {
      seenSet.add(slug);
      added += 1;
    }
  }

  const previousSeenCount = getSeenCount(req);
  const nextSeenCount = previousSeenCount + added;
  const capReached = cap !== null && nextSeenCount >= cap;

  const res = NextResponse.json<SeenResponse>(
    {
      ok: true,
      seenCount: nextSeenCount,
      cap,
      capReached,
    },
    { status: 200 },
  );

  if (added > 0) {
    writeSeenList(res, Array.from(seenSet));
    setSeenCount(res, nextSeenCount);
  }

  ensureAnonId(req, res);
  return res;
}