// web/app/api/downloads/album/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { getAlbumOffer } from "../../../../lib/albumOffers";
import { findEntitlement } from "../../../../lib/entitlements";
import { signGetObjectUrl, assertObjectExists } from "../../../../lib/r2";
import { normalizeEmail } from "../../../../lib/members";

export const runtime = "nodejs";

// ---- tuning knobs (safe defaults) ----
const MEMBER_COOLDOWN_SECONDS = 10; // same user + same asset
const IP_WINDOW_SECONDS = 30; // rolling window
const IP_MAX_HITS_PER_WINDOW = 20; // generous; only trips on obvious automation
const R2_EXISTENCE_CACHE_SECONDS = 6 * 60 * 60; // 6 hours

type JsonError = { ok: false; error: string; detail?: unknown };
type JsonOk = {
  ok: true;
  url: string;
  albumSlug: string;
  asset: { id: string; label: string; filename: string };
};
type JsonBody = JsonOk | JsonError;

function json(status: number, body: JsonBody, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

async function resolveMemberId(params: {
  userId: string | null;
  email: string | null;
}): Promise<string | null> {
  const { userId, email } = params;

  if (userId) {
    const r = await sql<{ id: string }>`
      select id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `;
    const id = r.rows[0]?.id ?? null;
    if (id) return id;
  }

  if (email) {
    const r = await sql<{ id: string }>`
      select id
      from members
      where email = ${email}
      limit 1
    `;
    const id = r.rows[0]?.id ?? null;
    if (id) return id;
  }

  return null;
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const rip = req.headers.get("x-real-ip")?.trim();
  return rip || null;
}

// ---- Throttles / caches (require small tables) ----

async function checkMemberCooldown(params: {
  memberId: string;
  albumSlug: string;
  assetId: string;
}): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const { memberId, albumSlug, assetId } = params;

  const prev = await sql<{ last_at: Date }>`
    select last_at
    from download_throttle_member
    where member_id = ${memberId}
      and album_slug = ${albumSlug}
      and asset_id = ${assetId}
    limit 1
  `;

  const lastAt: Date | null = prev.rows[0]?.last_at ?? null;
  if (lastAt) {
    const ms = Date.now() - lastAt.getTime();
    if (ms < MEMBER_COOLDOWN_SECONDS * 1000) {
      const retry = Math.ceil(
        (MEMBER_COOLDOWN_SECONDS * 1000 - ms) / 1000,
      );
      return { ok: false, retryAfterSeconds: retry };
    }
  }

  await sql`
    insert into download_throttle_member (member_id, album_slug, asset_id, last_at)
    values (${memberId}, ${albumSlug}, ${assetId}, now())
    on conflict (member_id, album_slug, asset_id)
    do update set last_at = excluded.last_at
  `;

  return { ok: true };
}

async function checkIpThrottle(
  ip: string | null,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  if (!ip) return { ok: true };

  const windowStartSeconds =
    Math.floor(Date.now() / 1000 / IP_WINDOW_SECONDS) * IP_WINDOW_SECONDS;

  const r = await sql<{ hits: number }>`
    insert into download_throttle_ip (ip, window_start, hits)
    values (${ip}, to_timestamp(${windowStartSeconds}), 1)
    on conflict (ip, window_start)
    do update set hits = download_throttle_ip.hits + 1
    returning hits
  `;

  const hits = Number(r.rows[0]?.hits ?? 1);
  if (hits > IP_MAX_HITS_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: IP_WINDOW_SECONDS };
  }

  return { ok: true };
}

async function assertR2ExistsCached(r2Key: string): Promise<void> {
  const cached = await sql<{ verified_at: Date }>`
    select verified_at
    from r2_object_presence_cache
    where r2_key = ${r2Key}
    limit 1
  `;

  const verifiedAt: Date | null = cached.rows[0]?.verified_at ?? null;
  if (verifiedAt) {
    const ms = Date.now() - verifiedAt.getTime();
    if (ms < R2_EXISTENCE_CACHE_SECONDS * 1000) return;
  }

  await assertObjectExists(r2Key);

  await sql`
    insert into r2_object_presence_cache (r2_key, verified_at)
    values (${r2Key}, now())
    on conflict (r2_key)
    do update set verified_at = excluded.verified_at
  `;
}

type DownloadRequestBody = { albumSlug?: unknown; assetId?: unknown };

function parseBody(value: unknown): DownloadRequestBody | null {
  if (!value || typeof value !== "object") return null;
  // We only care about these two keys; keep it permissive.
  const v = value as Record<string, unknown>;
  return { albumSlug: v.albumSlug, assetId: v.assetId };
}

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const body = parseBody(raw);

  const albumSlug = (body?.albumSlug ?? "").toString().trim().toLowerCase();
  const assetId = (body?.assetId ?? "bundle_zip")
    .toString()
    .trim()
    .toLowerCase();

  if (!albumSlug) return json(400, { ok: false, error: "Missing albumSlug" });

  const offer = getAlbumOffer(albumSlug);
  if (!offer) return json(400, { ok: false, error: "Unknown albumSlug" });

  // v1 policy: downloads require an authenticated session
  const { userId } = await auth();
  if (!userId) return json(401, { ok: false, error: "Sign in required" });

  // Best-effort IP throttle (very generous; only trips on obvious automation)
  const ipGate = await checkIpThrottle(getClientIp(req));
  if (!ipGate.ok) {
    return json(
      429,
      {
        ok: false,
        error: `Too many requests. Please wait ${ipGate.retryAfterSeconds}s.`,
      },
      { "Retry-After": String(ipGate.retryAfterSeconds) },
    );
  }

  const user = await currentUser();
  const emailRaw =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const email = emailRaw ? normalizeEmail(emailRaw) : null;

  const memberId = await resolveMemberId({ userId, email });
  if (!memberId) return json(404, { ok: false, error: "Member not found" });

  const match = await findEntitlement(memberId, offer.entitlementKey, null, {
    allowGlobalFallback: true,
  });
  if (!match) return json(403, { ok: false, error: "Not entitled" });

  const asset = offer.assets.find((a) => a.id === assetId) ?? null;
  if (!asset) return json(400, { ok: false, error: "Unknown assetId" });

  // Primary protection: per-member per-asset cooldown
  const memberGate = await checkMemberCooldown({
    memberId,
    albumSlug: offer.albumSlug,
    assetId: asset.id,
  });
  if (!memberGate.ok) {
    return json(
      429,
      {
        ok: false,
        error: `Please wait ${memberGate.retryAfterSeconds}s and try again.`,
      },
      { "Retry-After": String(memberGate.retryAfterSeconds) },
    );
  }

  // Existence check, cached so it can’t be abused to force repeated HEAD calls
  try {
    await assertR2ExistsCached(asset.r2Key);
  } catch (err: unknown) {
    const detail =
      process.env.NODE_ENV !== "production"
        ? {
            attemptedKey: asset.r2Key,
            bucket: process.env.R2_BUCKET ?? null,
            endpoint: process.env.R2_ENDPOINT ?? null,
            err: err instanceof Error ? err.message : String(err),
          }
        : undefined;

    return json(500, {
      ok: false,
      error: "Download not available (missing object)",
      ...(detail ? { detail } : {}),
    });
  }

  const url = await signGetObjectUrl({
    key: asset.r2Key,
    expiresInSeconds: 90,
    responseContentType: asset.contentType,
    responseContentDispositionFilename: asset.filename,
  });

  return json(200, {
    ok: true,
    url,
    albumSlug: offer.albumSlug,
    asset: { id: asset.id, label: asset.label, filename: asset.filename },
  });
}
