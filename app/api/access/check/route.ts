// web/app/api/access/check/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { checkAccess } from "@/lib/access";
import { ACCESS_ACTIONS, ENTITLEMENTS } from "@/lib/vocab";
import { ensureAnonId, persistAnonId } from "@/lib/anon";
import {
  countAnonDistinctCompletedTracks,
  newCorrelationId,
} from "@/lib/events";
import {
  ANON_PLAYBACK_POLICY,
  hasReachedAnonPlaybackCap,
} from "@/lib/anonPlaybackPolicy";
import {
  redeemShareTokenForMember,
  type ShareTokenAccessSummary,
  validateShareToken,
} from "@/lib/shareTokens";
import { issueShareTokenPlaybackContext } from "@/lib/shareTokenPlaybackContext";
import {
  getAlbumPolicyByAlbumId,
  isEmbargoed,
  type AlbumPolicy,
  type TierName,
} from "@/lib/albumPolicy";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";

type Action = "login" | "subscribe" | "buy" | "wait" | null;

async function getMemberIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  if (!userId) return null;
  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  return (r.rows?.[0]?.id as string | undefined) ?? null;
}

function tierAtOrAbove(min: TierName) {
  const order: TierName[] = ["friend", "patron", "partner"];
  const idx = order.indexOf(min);
  const allowed = idx >= 0 ? order.slice(idx) : order;
  return allowed.map((t) => `tier_${t}`);
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  while (s.startsWith("alb:")) s = s.slice(4);
  return s.trim();
}

async function readAdminDebugCookie(): Promise<{
  tier?: string;
  force?: string;
} | null> {
  if (process.env.ADMIN_DEBUG_ACCESS_OVERRIDES !== "1") return null;

  const c = await cookies();
  const raw = c.get("af_dbg")?.value ?? "";
  if (!raw) return null;

  try {
    const o = JSON.parse(raw) as { tier?: string; force?: string };
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

function baseJson<T extends Record<string, unknown>>(
  body: T,
  opts: { correlationId: string; status?: number; anonId?: string },
) {
  const res = NextResponse.json(body, { status: opts.status ?? 200 });
  // ✅ micro-cache to absorb double-invokes / fast remounts
  // safe because access state doesn't change multiple times per second.
  res.headers.set(
    "Cache-Control",
    "private, max-age=2, stale-while-revalidate=20",
  );
  res.headers.set("Vary", "Cookie");
  res.headers.set("x-correlation-id", opts.correlationId);
  if (opts.anonId) persistAnonId(res, opts.anonId);
  return res;
}

/**
 * Important: always persist the exact anonId that was used for logic (no double-mint).
 */
function anonJsonWithId<T extends Record<string, unknown>>(
  anonId: string,
  body: T,
  opts: { correlationId: string; status?: number },
) {
  const res = NextResponse.json(body, { status: opts.status ?? 200 });
  persistAnonId(res, anonId);
  res.headers.set(
    "Cache-Control",
    "private, max-age=2, stale-while-revalidate=20",
  );
  res.headers.set("Vary", "Cookie");
  res.headers.set("x-correlation-id", opts.correlationId);
  return res;
}

type RedeemedState = { ok: true } | { ok: false; code: string } | null;

type MemberShareState = {
  redeemed: RedeemedState;
  shareTokenAllowsAccess: boolean;
  shareTokenAccess: ShareTokenAccessSummary | null;
  sharePlaybackContext: string | null;
};

type AccessRequestContext = {
  albumId: string;
  albumScopeId: string;
  shareToken: string;
  correlationId: string;
};

async function resolveAnonymousAccess(
  req: NextRequest,
  context: AccessRequestContext,
): Promise<NextResponse> {
  const { albumId, albumScopeId, shareToken, correlationId } = context;
  const { anonId } = ensureAnonId(req);

  const policy = await getAlbumPolicyByAlbumId(albumId);
  const releaseAt = policy?.releaseAt ?? null;
  const embargoed = isEmbargoed(policy);

  if (embargoed && !shareToken) {
    return anonJsonWithId(
      anonId,
      {
        ok: true,
        allowed: false,
        embargoed: true,
        releaseAt,
        code: "EMBARGO",
        action: "wait" satisfies Action,
        reason: "This album is not released yet.",
        correlationId,
        redeemed: null,
      },
      { correlationId },
    );
  }

  if (shareToken) {
    const validation = await validateShareToken({
      token: shareToken,
      expectedScopeId: albumScopeId,
      anonId,
      resourceKind: "album",
      resourceId: albumScopeId,
      action: "access",
    });

    if (!validation.ok) {
      return anonJsonWithId(
        anonId,
        {
          ok: true,
          allowed: false,
          embargoed,
          releaseAt,
          code: validation.code,
          action: "login" as const,
          reason:
            validation.code === "CAP_REACHED"
              ? "Share link cap reached."
              : "Invalid or expired share token.",
          correlationId,
          redeemed: { ok: false, code: validation.code },
        },
        { correlationId },
      );
    }

    const sharePlaybackContext = validation.telemetryLabel
      ? issueShareTokenPlaybackContext({
          shareTokenId: validation.tokenId,
          scopeId: albumScopeId,
          tokenExpiresAt: validation.shareTokenAccess.expiresAt,
          memberId: null,
          anonId,
        })
      : null;

    return anonJsonWithId(
      anonId,
      {
        ok: true,
        allowed: true,
        embargoed: false,
        releaseAt,
        code: null,
        action: null,
        reason: null,
        correlationId,
        redeemed: { ok: true },
        shareTokenAccess: validation.shareTokenAccess,
        sharePlaybackContext,
        sharePlaybackScopeId: sharePlaybackContext ? albumScopeId : null,
      },
      { correlationId },
    );
  }

  const distinctCompleted = await countAnonDistinctCompletedTracks({
    anonId,
    sinceDays: ANON_PLAYBACK_POLICY.windowDays,
  });

  const cap = {
    used: distinctCompleted,
    max: ANON_PLAYBACK_POLICY.distinctTrackCap,
    windowDays: ANON_PLAYBACK_POLICY.windowDays,
  };

  if (
    hasReachedAnonPlaybackCap({
      distinctCompletedTracks: distinctCompleted,
    })
  ) {
    return anonJsonWithId(
      anonId,
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt,
        code: "ANON_CAP_REACHED",
        action: "login" as const,
        reason: "Enter your email address to continue listening.",
        correlationId,
        redeemed: null,
        cap,
      },
      { correlationId },
    );
  }

  return anonJsonWithId(
    anonId,
    {
      ok: true,
      allowed: true,
      embargoed: false,
      releaseAt,
      code: null,
      action: null,
      reason: null,
      correlationId,
      redeemed: null,
      cap,
    },
    { correlationId },
  );
}

async function resolveAdminDebugOverride(
  memberId: string,
  correlationId: string,
): Promise<NextResponse | null> {
  const debug = await readAdminDebugCookie();
  if (!debug) return null;

  const isAdmin = (
    await checkAccess(
      memberId,
      { kind: "global", required: [ENTITLEMENTS.ADMIN] },
      { log: false },
    )
  ).allowed;

  if (!isAdmin) return null;

  const force = String(debug.force ?? "none");

  switch (force) {
    case "AUTH_REQUIRED":
      return baseJson(
        {
          ok: true,
          allowed: false,
          embargoed: false,
          releaseAt: null,
          code: "AUTH_REQUIRED",
          action: "login",
          reason: "Sign in required",
          correlationId,
          redeemed: null,
        },
        { correlationId },
      );

    case "ENTITLEMENT_REQUIRED":
      return baseJson(
        {
          ok: true,
          allowed: false,
          embargoed: false,
          releaseAt: null,
          code: "ENTITLEMENT_REQUIRED",
          action: "subscribe",
          reason: "Entitlement required",
          correlationId,
          redeemed: null,
        },
        { correlationId },
      );

    case "ANON_CAP_REACHED":
      return baseJson(
        {
          ok: true,
          allowed: false,
          embargoed: false,
          releaseAt: null,
          code: "ANON_CAP_REACHED",
          action: "login",
          reason: "Anon cap reached",
          correlationId,
          redeemed: null,
        },
        { correlationId },
      );

    case "EMBARGOED":
      return baseJson(
        {
          ok: true,
          allowed: false,
          embargoed: true,
          releaseAt: new Date().toISOString(),
          code: "EMBARGOED",
          action: "wait",
          reason: "Embargoed",
          correlationId,
          redeemed: null,
        },
        { correlationId },
      );

    default:
      return null;
  }
}

async function resolveMemberShareState(params: {
  memberId: string;
  albumScopeId: string;
  shareToken: string;
}): Promise<MemberShareState> {
  if (!params.shareToken) {
    return {
      redeemed: null,
      shareTokenAllowsAccess: false,
      shareTokenAccess: null,
      sharePlaybackContext: null,
    };
  }

  const redemption = await redeemShareTokenForMember({
    token: params.shareToken,
    memberId: params.memberId,
    expectedScopeId: params.albumScopeId,
    resourceKind: "album",
    resourceId: params.albumScopeId,
    action: "redeem",
  });

  if (!redemption.ok) {
    return {
      redeemed: { ok: false, code: redemption.code },
      shareTokenAllowsAccess: false,
      shareTokenAccess: null,
      sharePlaybackContext: null,
    };
  }

  const sharePlaybackContext = redemption.telemetryLabel
    ? issueShareTokenPlaybackContext({
        shareTokenId: redemption.tokenId,
        scopeId: params.albumScopeId,
        tokenExpiresAt: redemption.shareTokenAccess.expiresAt,
        memberId: params.memberId,
        anonId: null,
      })
    : null;

  return {
    redeemed: { ok: true },
    shareTokenAllowsAccess: true,
    shareTokenAccess: redemption.shareTokenAccess,
    sharePlaybackContext,
  };
}

async function resolveMemberEmbargoGate(params: {
  memberId: string;
  albumScopeId: string;
  policy: AlbumPolicy | null;
  embargoed: boolean;
  releaseAt: string | null;
  shareTokenAllowsAccess: boolean;
  correlationId: string;
  redeemed: RedeemedState;
}): Promise<NextResponse | null> {
  if (!params.embargoed || params.shareTokenAllowsAccess) {
    return null;
  }

  const shareGrant = await checkAccess(
    params.memberId,
    {
      kind: "album",
      albumScopeId: params.albumScopeId,
      required: [ENTITLEMENTS.ALBUM_SHARE_GRANT],
    },
    {
      log: true,
      action: ACCESS_ACTIONS.ACCESS_CHECK,
      correlationId: params.correlationId,
    },
  );

  if (shareGrant.allowed) {
    return null;
  }

  const { policy } = params;

  if (policy?.earlyAccessEnabled && policy.earlyAccessTiers.length > 0) {
    const keys = await listCurrentEntitlementKeys(params.memberId);
    const keySet = new Set(keys);
    const allowedTierKeys = policy.earlyAccessTiers.map(
      (tier) => `tier_${tier}`,
    );

    if (allowedTierKeys.some((key) => keySet.has(key))) {
      return null;
    }

    return baseJson(
      {
        ok: true,
        allowed: false,
        embargoed: true,
        releaseAt: params.releaseAt,
        code: "EMBARGO",
        action: "subscribe" satisfies Action,
        reason: "This album is not released yet. Upgrade for early access.",
        correlationId: params.correlationId,
        redeemed: params.redeemed,
      },
      { correlationId: params.correlationId },
    );
  }

  return baseJson(
    {
      ok: true,
      allowed: false,
      embargoed: true,
      releaseAt: params.releaseAt,
      code: "EMBARGO",
      action: "wait" satisfies Action,
      reason: "This album is not released yet.",
      correlationId: params.correlationId,
      redeemed: params.redeemed,
    },
    { correlationId: params.correlationId },
  );
}

async function resolveMemberTierGate(params: {
  memberId: string;
  policy: AlbumPolicy | null;
  releaseAt: string | null;
  correlationId: string;
  redeemed: RedeemedState;
}): Promise<NextResponse | null> {
  const minTier = params.policy?.minTierForPlayback;

  if (!minTier) {
    return null;
  }

  const keys = await listCurrentEntitlementKeys(params.memberId);
  const keySet = new Set(keys);
  const requiredTierKeys = tierAtOrAbove(minTier);

  if (requiredTierKeys.some((key) => keySet.has(key))) {
    return null;
  }

  return baseJson(
    {
      ok: true,
      allowed: false,
      embargoed: false,
      releaseAt: params.releaseAt,
      code: "TIER_REQUIRED",
      action: "subscribe" satisfies Action,
      reason: `This album requires ${minTier} tier or higher.`,
      correlationId: params.correlationId,
      redeemed: params.redeemed,
    },
    { correlationId: params.correlationId },
  );
}

async function resolveMemberAccess(params: {
  memberId: string;
  albumId: string;
  albumScopeId: string;
  correlationId: string;
  shareState: MemberShareState;
}): Promise<NextResponse> {
  const policy = await getAlbumPolicyByAlbumId(params.albumId);
  const releaseAt = policy?.releaseAt ?? null;
  const embargoed = isEmbargoed(policy);

  const embargoResponse = await resolveMemberEmbargoGate({
    memberId: params.memberId,
    albumScopeId: params.albumScopeId,
    policy,
    embargoed,
    releaseAt,
    shareTokenAllowsAccess: params.shareState.shareTokenAllowsAccess,
    correlationId: params.correlationId,
    redeemed: params.shareState.redeemed,
  });

  if (embargoResponse) {
    return embargoResponse;
  }

  const tierResponse = await resolveMemberTierGate({
    memberId: params.memberId,
    policy,
    releaseAt,
    correlationId: params.correlationId,
    redeemed: params.shareState.redeemed,
  });

  if (tierResponse) {
    return tierResponse;
  }

  const decision = await checkAccess(
    params.memberId,
    {
      kind: "album",
      albumScopeId: params.albumScopeId,
      required: [ENTITLEMENTS.PLAY_ALBUM],
    },
    {
      log: true,
      action: ACCESS_ACTIONS.ACCESS_CHECK,
      correlationId: params.correlationId,
    },
  );

  const allowed = Boolean(
    decision.allowed || params.shareState.shareTokenAllowsAccess,
  );

  return baseJson(
    {
      ok: true,
      allowed,
      embargoed: embargoed && !allowed,
      releaseAt,
      code: allowed ? null : "NO_ENTITLEMENT",
      action: allowed ? null : ("subscribe" satisfies Action),
      reason: allowed ? null : "reason" in decision ? decision.reason : null,
      correlationId: params.correlationId,
      redeemed: params.shareState.redeemed,
      shareTokenAccess:
        allowed && params.shareState.shareTokenAllowsAccess
          ? params.shareState.shareTokenAccess
          : null,
      sharePlaybackContext:
        allowed && params.shareState.shareTokenAllowsAccess
          ? params.shareState.sharePlaybackContext
          : null,
      sharePlaybackScopeId:
        allowed &&
        params.shareState.shareTokenAllowsAccess &&
        params.shareState.sharePlaybackContext
          ? params.albumScopeId
          : null,
    },
    { correlationId: params.correlationId },
  );
}

export async function GET(req: NextRequest) {
  const correlationId = newCorrelationId();
  const { userId } = await auth();

  const url = new URL(req.url);
  const albumId = normalizeAlbumId(
    (url.searchParams.get("albumId") ?? "").trim(),
  );
  const shareToken = (
    url.searchParams.get("st") ??
    url.searchParams.get("share") ??
    ""
  ).trim();

  if (!albumId) {
    return baseJson(
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt: null,
        code: "INVALID_REQUEST",
        action: null,
        reason: "Missing albumId",
        correlationId,
        redeemed: null,
      },
      { correlationId },
    );
  }

  const albumScopeId = `alb:${albumId}`;

  if (!userId) {
    return resolveAnonymousAccess(req, {
      albumId,
      albumScopeId,
      shareToken,
      correlationId,
    });
  }

  const memberId = await getMemberIdByClerkUserId(userId);

  if (!memberId) {
    const anonForAuthed = shareToken ? ensureAnonId(req).anonId : undefined;

    return baseJson(
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt: null,
        code: "PROVISIONING",
        action: "wait" satisfies Action,
        reason: "Member profile is still being created",
        correlationId,
        redeemed: null,
      },
      { correlationId, anonId: anonForAuthed },
    );
  }

  const debugResponse = await resolveAdminDebugOverride(
    memberId,
    correlationId,
  );

  if (debugResponse) {
    return debugResponse;
  }

  const shareState = await resolveMemberShareState({
    memberId,
    albumScopeId,
    shareToken,
  });

  return resolveMemberAccess({
    memberId,
    albumId,
    albumScopeId,
    correlationId,
    shareState,
  });
}
