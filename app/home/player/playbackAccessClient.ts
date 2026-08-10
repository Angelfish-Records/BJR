// web/app/home/player/playbackAccessClient.ts
"use client";

export const PLAYBACK_ACCESS_ACTIONS = [
  "login",
  "subscribe",
  "buy",
  "wait",
] as const;

export type PlaybackAccessAction = (typeof PLAYBACK_ACCESS_ACTIONS)[number];

export type PlaybackShareTokenAccess = {
  expiresAt: string | null;
  maxRedemptions: number | null;
};

export type PlaybackAccessDecision = {
  forCatalogueId: string;
  allowed: boolean;
  embargoed: boolean;
  releaseAt: string | null;
  code?: string;
  action?: PlaybackAccessAction;
  reason?: string;
  corr: string | null;
  shareTokenAccess: PlaybackShareTokenAccess | null;
  sharePlaybackContext: string | null;
  sharePlaybackScopeId: string | null;
};

export type PlaybackAccessRequest = {
  catalogueId: string;
  shareToken: string | null;
  accessIdentityKey: string;
};

type PlaybackAccessResponse = {
  allowed?: boolean;
  embargoed?: boolean;
  releaseAt?: string | null;
  code?: string | null;
  action?: string | null;
  reason?: string | null;
  shareTokenAccess?: unknown;
  sharePlaybackContext?: unknown;
  sharePlaybackScopeId?: unknown;
};

type CachedPlaybackAccessDecision = {
  decision: PlaybackAccessDecision;
  expiresAtMs: number;
};

const PLAYBACK_ACCESS_CACHE_TTL_MS = 60_000;

const decisionsByKey = new Map<string, CachedPlaybackAccessDecision>();
const inFlightByKey = new Map<string, Promise<PlaybackAccessDecision>>();

function getFreshCachedPlaybackAccessDecision(
  key: string,
): PlaybackAccessDecision | null {
  const cached = decisionsByKey.get(key);

  if (!cached) return null;

  if (cached.expiresAtMs <= Date.now()) {
    decisionsByKey.delete(key);
    return null;
  }

  return cached.decision;
}

function normalizeCatalogueId(value: string): string {
  return value.trim();
}

function normalizeShareToken(value: string | null): string | null {
  const token = (value ?? "").trim();
  return token || null;
}

function playbackAccessKey(request: PlaybackAccessRequest): string {
  const catalogueId = normalizeCatalogueId(request.catalogueId);
  const shareToken = normalizeShareToken(request.shareToken);

  return `${catalogueId}::st=${shareToken ?? ""}::identity=${
    request.accessIdentityKey
  }`;
}

function parseShareTokenAccess(
  value: unknown,
): PlaybackShareTokenAccess | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const hasExpiresAt = Object.hasOwn(raw, "expiresAt");
  const hasMaxRedemptions = Object.hasOwn(raw, "maxRedemptions");

  if (!hasExpiresAt && !hasMaxRedemptions) return null;

  const expiresAtRaw = raw.expiresAt;
  const maxRedemptionsRaw = raw.maxRedemptions;

  let expiresAt: string | null = null;

  if (expiresAtRaw != null) {
    if (
      typeof expiresAtRaw !== "string" ||
      !Number.isFinite(Date.parse(expiresAtRaw))
    ) {
      return null;
    }

    expiresAt = expiresAtRaw;
  }

  let maxRedemptions: number | null = null;

  if (maxRedemptionsRaw != null) {
    if (
      typeof maxRedemptionsRaw !== "number" ||
      !Number.isFinite(maxRedemptionsRaw) ||
      maxRedemptionsRaw < 1
    ) {
      return null;
    }

    maxRedemptions = Math.floor(maxRedemptionsRaw);
  }

  return { expiresAt, maxRedemptions };
}

function parseSharePlaybackContext(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const context = value.trim();

  return context.startsWith("stpc1.") && context.length <= 900 ? context : null;
}

function parseSharePlaybackScopeId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const scopeId = value.trim();

  return /^alb:[^\s]+$/i.test(scopeId) ? scopeId : null;
}

export function isPlaybackAccessAction(
  value: unknown,
): value is PlaybackAccessAction {
  return (
    typeof value === "string" &&
    (PLAYBACK_ACCESS_ACTIONS as readonly string[]).includes(value)
  );
}

export function readPlaybackShareTokenFromLocation(): string | null {
  if (typeof window === "undefined") return null;

  const search = new URLSearchParams(window.location.search);
  const token = (search.get("st") ?? search.get("share") ?? "").trim();

  return token || null;
}

export function getCachedPlaybackAccessDecision(
  request: PlaybackAccessRequest,
): PlaybackAccessDecision | null {
  return getFreshCachedPlaybackAccessDecision(playbackAccessKey(request));
}

export async function fetchPlaybackAccessDecision(
  request: PlaybackAccessRequest,
): Promise<PlaybackAccessDecision> {
  const catalogueId = normalizeCatalogueId(request.catalogueId);

  if (!catalogueId) {
    throw new Error("Playback access requires a catalogue ID.");
  }

  const shareToken = normalizeShareToken(request.shareToken);
  const key = playbackAccessKey({
    catalogueId,
    shareToken,
    accessIdentityKey: request.accessIdentityKey,
  });

  const cached = getFreshCachedPlaybackAccessDecision(key);
  if (cached) return cached;

  const existing = inFlightByKey.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const url = new URL("/api/access/check", window.location.origin);
    url.searchParams.set("albumId", catalogueId);

    if (shareToken) {
      url.searchParams.set("st", shareToken);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const body = (await response.json()) as PlaybackAccessResponse;

    const decision: PlaybackAccessDecision = {
      forCatalogueId: catalogueId,
      allowed: body.allowed !== false,
      embargoed: body.embargoed === true,
      releaseAt: body.releaseAt ?? null,
      code:
        typeof body.code === "string" && body.code.trim()
          ? body.code
          : undefined,
      action: isPlaybackAccessAction(body.action) ? body.action : undefined,
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason
          : undefined,
      corr: response.headers.get("x-correlation-id") ?? null,
      shareTokenAccess: parseShareTokenAccess(body.shareTokenAccess),
      sharePlaybackContext: parseSharePlaybackContext(
        body.sharePlaybackContext,
      ),
      sharePlaybackScopeId: parseSharePlaybackScopeId(
        body.sharePlaybackScopeId,
      ),
    };

    decisionsByKey.set(key, {
      decision,
      expiresAtMs: Date.now() + PLAYBACK_ACCESS_CACHE_TTL_MS,
    });

    return decision;
  })().finally(() => {
    inFlightByKey.delete(key);
  });

  inFlightByKey.set(key, promise);
  return promise;
}
