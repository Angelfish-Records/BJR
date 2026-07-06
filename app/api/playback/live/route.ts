import "server-only";

import { NextRequest, NextResponse } from "next/server";
import {
  clampActiveListenerWindowSeconds,
  getSiteActiveListenerCount,
} from "@/lib/playbackLive";

function parseWindowSeconds(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;

  return Math.floor(parsed);
}

export async function GET(req: NextRequest) {
  const requestedWindowSeconds = parseWindowSeconds(
    req.nextUrl.searchParams.get("windowSeconds"),
  );

  const windowSeconds =
    requestedWindowSeconds == null
      ? clampActiveListenerWindowSeconds()
      : clampActiveListenerWindowSeconds(requestedWindowSeconds);

  const activeListeners = await getSiteActiveListenerCount(windowSeconds);

  const res = NextResponse.json({
    ok: true,
    activeListeners,
    windowSeconds,
    generatedAt: new Date().toISOString(),
  });

  res.headers.set(
    "Cache-Control",
    "public, max-age=5, s-maxage=15, stale-while-revalidate=45",
  );

  return res;
}
