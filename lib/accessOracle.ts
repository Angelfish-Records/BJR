// web/lib/accessOracle.ts
import "server-only";
import { checkAccess } from "@/lib/access";
import {
  getAlbumPolicyByAlbumId,
  isEmbargoed,
  type AlbumPolicy,
  type TierName,
} from "@/lib/albumPolicy";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import {
  ACCESS_ACTIONS,
  ENTITLEMENTS,
  SCOPE_CATALOGUE,
  type AccessAction,
} from "@/lib/vocab";

export type AccessOracleCode =
  | "OK"
  | "AUTH_REQUIRED"
  | "PROVISIONING"
  | "INVALID_REQUEST"
  | "EMBARGO"
  | "TIER_REQUIRED"
  | "ENTITLEMENT_REQUIRED";

export type AccessOracleAction = "login" | "subscribe" | "buy" | "wait" | null;

export type AlbumPlaybackOracleParams = {
  memberId: string | null;
  albumId: string;
  correlationId: string;
  action?: AccessAction | string;
  shareTokenAllowsPlayback?: boolean;
};

export type AlbumPlaybackOracleDecision =
  | {
      ok: true;
      allowed: true;
      code: "OK";
      action: null;
      albumId: string;
      albumScopeId: string;
      embargoed: boolean;
      releaseAt: string | null;
      requiredTier: TierName | null;
      correlationId: string;
    }
  | {
      ok: true;
      allowed: false;
      code: Exclude<AccessOracleCode, "OK">;
      action: AccessOracleAction;
      reason: string;
      albumId: string;
      albumScopeId: string;
      embargoed: boolean;
      releaseAt: string | null;
      requiredTier: TierName | null;
      correlationId: string;
    };

function tierKey(t: TierName): string {
  if (t === "partner") return ENTITLEMENTS.TIER_PARTNER;
  if (t === "patron") return ENTITLEMENTS.TIER_PATRON;
  return ENTITLEMENTS.TIER_FRIEND;
}

function tierAtOrAbove(min: TierName): string[] {
  const order: TierName[] = ["friend", "patron", "partner"];
  const idx = order.indexOf(min);
  const allowed = idx >= 0 ? order.slice(idx) : order;
  return allowed.map(tierKey);
}

function safeParseReleaseAt(
  releaseAt: string | null | undefined,
): string | null {
  const s = typeof releaseAt === "string" ? releaseAt.trim() : "";
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return s;
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  while (s.startsWith("alb:")) s = s.slice(4);
  return s.trim();
}

type DeniedAlbumPlaybackOracleDecision = Extract<
  AlbumPlaybackOracleDecision,
  { allowed: false }
>;

type OracleContext = {
  albumId: string;
  albumScopeId: string;
  policy: AlbumPolicy | null;
  releaseAt: string | null;
  embargoed: boolean;
  memberId: string | null;
  shareTokenAllowsPlayback: boolean;
  entitlementKeys: ReadonlySet<string>;
  correlationId: string;
  action: string;
};

function invalidAlbumDecision(
  correlationId: string,
): DeniedAlbumPlaybackOracleDecision {
  return {
    ok: true,
    allowed: false,
    code: "INVALID_REQUEST",
    action: null,
    reason: "Missing albumId.",
    albumId: "",
    albumScopeId: "",
    embargoed: false,
    releaseAt: null,
    requiredTier: null,
    correlationId,
  };
}

function deniedDecision(
  context: OracleContext,
  input: {
    code: Exclude<AccessOracleCode, "OK">;
    action: AccessOracleAction;
    reason: string;
    requiredTier: TierName | null;
  },
): DeniedAlbumPlaybackOracleDecision {
  return {
    ok: true,
    allowed: false,
    code: input.code,
    action: input.action,
    reason: input.reason,
    albumId: context.albumId,
    albumScopeId: context.albumScopeId,
    embargoed: context.embargoed,
    releaseAt: context.releaseAt,
    requiredTier: input.requiredTier,
    correlationId: context.correlationId,
  };
}

function allowedDecision(context: OracleContext): AlbumPlaybackOracleDecision {
  return {
    ok: true,
    allowed: true,
    code: "OK",
    action: null,
    albumId: context.albumId,
    albumScopeId: context.albumScopeId,
    embargoed: context.embargoed,
    releaseAt: context.releaseAt,
    requiredTier: context.policy?.minTierForPlayback ?? null,
    correlationId: context.correlationId,
  };
}

function hasAnyEntitlementKey(
  entitlementKeys: ReadonlySet<string>,
  requiredKeys: readonly string[],
): boolean {
  return requiredKeys.some((key) => entitlementKeys.has(key));
}

async function createOracleContext(
  params: AlbumPlaybackOracleParams,
  albumId: string,
  albumScopeId: string,
): Promise<OracleContext> {
  const policy = await getAlbumPolicyByAlbumId(albumId);

  const memberId =
    typeof params.memberId === "string" && params.memberId.trim().length > 0
      ? params.memberId
      : null;

  const entitlementKeys = memberId
    ? await listCurrentEntitlementKeys(memberId)
    : [];

  return {
    albumId,
    albumScopeId,
    policy,
    releaseAt: safeParseReleaseAt(policy?.releaseAt ?? null),
    embargoed: isEmbargoed(policy),
    memberId,
    shareTokenAllowsPlayback: params.shareTokenAllowsPlayback === true,
    entitlementKeys: new Set(entitlementKeys),
    correlationId: params.correlationId,
    action: params.action ?? ACCESS_ACTIONS.ACCESS_CHECK,
  };
}

async function hasMemberEmbargoOverride(
  context: OracleContext,
): Promise<boolean> {
  if (!context.memberId) {
    return false;
  }

  const decision = await checkAccess(
    context.memberId,
    {
      kind: "album",
      albumScopeId: context.albumScopeId,
      required: [ENTITLEMENTS.ALBUM_SHARE_GRANT],
    },
    {
      log: true,
      action: context.action,
      correlationId: context.correlationId,
    },
  );

  return decision.allowed;
}

/**
 * ALBUM_SHARE_GRANT and validated bearer share tokens are embargo overrides.
 * They do not bypass minTierForPlayback.
 */
async function resolveEmbargoDecision(
  context: OracleContext,
): Promise<DeniedAlbumPlaybackOracleDecision | null> {
  if (!context.embargoed) {
    return null;
  }

  const memberOverrideAllowed = await hasMemberEmbargoOverride(context);

  if (context.shareTokenAllowsPlayback || memberOverrideAllowed) {
    return null;
  }

  const earlyAccessTiers = context.policy?.earlyAccessEnabled
    ? context.policy.earlyAccessTiers
    : [];

  if (earlyAccessTiers.length === 0) {
    return deniedDecision(context, {
      code: "EMBARGO",
      action: "wait",
      reason: "This album is not released yet.",
      requiredTier: null,
    });
  }

  const allowedTierKeys = earlyAccessTiers.map(tierKey);

  if (hasAnyEntitlementKey(context.entitlementKeys, allowedTierKeys)) {
    return null;
  }

  return deniedDecision(context, {
    code: "EMBARGO",
    action: "subscribe",
    reason: "This album is not released yet. Upgrade for early access.",
    requiredTier: null,
  });
}

function resolveMinimumTierDecision(
  context: OracleContext,
): DeniedAlbumPlaybackOracleDecision | null {
  const minTier = context.policy?.minTierForPlayback ?? null;

  if (!minTier) {
    return null;
  }

  const requiredTierKeys = tierAtOrAbove(minTier);

  if (hasAnyEntitlementKey(context.entitlementKeys, requiredTierKeys)) {
    return null;
  }

  return deniedDecision(context, {
    code: "TIER_REQUIRED",
    action: "subscribe",
    reason: `This album requires ${minTier} tier or higher.`,
    requiredTier: minTier,
  });
}

/**
 * A validated bearer share token may satisfy ordinary playback permission.
 * ALBUM_SHARE_GRANT does not replace PLAY_ALBUM.
 */
async function resolvePlaybackEntitlementDecision(
  context: OracleContext,
): Promise<DeniedAlbumPlaybackOracleDecision | null> {
  if (context.shareTokenAllowsPlayback || !context.memberId) {
    return null;
  }

  const decision = await checkAccess(
    context.memberId,
    context.albumScopeId === SCOPE_CATALOGUE
      ? {
          kind: "global",
          scopeId: SCOPE_CATALOGUE,
          required: [ENTITLEMENTS.PLAY_ALBUM],
        }
      : {
          kind: "album",
          albumScopeId: context.albumScopeId,
          required: [ENTITLEMENTS.PLAY_ALBUM],
        },
    {
      log: true,
      action: context.action,
      correlationId: context.correlationId,
    },
  );

  if (decision.allowed) {
    return null;
  }

  return deniedDecision(context, {
    code: "ENTITLEMENT_REQUIRED",
    action: "subscribe",
    reason: "You do not have access to play this album.",
    requiredTier: context.policy?.minTierForPlayback ?? null,
  });
}

export async function decideAlbumPlaybackAccess(
  params: AlbumPlaybackOracleParams,
): Promise<AlbumPlaybackOracleDecision> {
  const albumId = normalizeAlbumId(params.albumId);

  if (!albumId) {
    return invalidAlbumDecision(params.correlationId);
  }

  const albumScopeId =
    albumId === SCOPE_CATALOGUE ? SCOPE_CATALOGUE : `alb:${albumId}`;

  const context = await createOracleContext(params, albumId, albumScopeId);

  const embargoDecision = await resolveEmbargoDecision(context);

  if (embargoDecision) {
    return embargoDecision;
  }

  const tierDecision = resolveMinimumTierDecision(context);

  if (tierDecision) {
    return tierDecision;
  }

  const entitlementDecision = await resolvePlaybackEntitlementDecision(context);

  if (entitlementDecision) {
    return entitlementDecision;
  }

  return allowedDecision(context);
}
