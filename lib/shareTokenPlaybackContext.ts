// web/lib/shareTokenPlaybackContext.ts
import "server-only";

import crypto from "crypto";
import { sql } from "@vercel/postgres";
import {
  getRecordingSummaryByRecordingId,
  type RecordingSummary,
} from "@/lib/albums";

const CONTEXT_VERSION = 1;
const CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const RECORDING_SCOPE_CACHE_TTL_MS = 5 * 60 * 1000;

type PlaybackContextPayload = {
  v: number;
  tid: string;
  sid: string;
  binding: string;
  exp: number;
};

type TokenRow = {
  id: string;
  scope_id: string | null;
  telemetry_label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type RecordingScopeCacheValue = {
  scopeId: string | null;
  expiresAtMs: number;
};

export type ResolvedShareTokenPlaybackContext = {
  shareTokenId: string;
  scopeId: string;
  telemetryLabel: string;
};

const recordingScopeCache = new Map<string, RecordingScopeCacheValue>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

function normalizeScopeId(value: string | null | undefined): string | null {
  let normalized = (value ?? "").trim();

  while (normalized.startsWith("alb:")) {
    normalized = normalized.slice(4);
  }

  return normalized ? `alb:${normalized}` : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getSecret(): Buffer | null {
  const raw = process.env.SHARE_TOKEN_PLAYBACK_CONTEXT_SECRET?.trim() ?? "";

  if (raw.length < 32) {
    console.error(
      "SHARE_TOKEN_PLAYBACK_CONTEXT_SECRET is missing or too short",
    );
    return null;
  }

  return Buffer.from(raw, "utf8");
}

function sign(serializedPayload: string, secret: Buffer): string {
  return crypto
    .createHmac("sha256", secret)
    .update(serializedPayload)
    .digest("base64url");
}

function timingSafeEqualText(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function consumerBinding(params: {
  memberId: string | null;
  anonId: string | null;
}): string | null {
  const memberId = (params.memberId ?? "").trim();

  const consumerKey = memberId
    ? `member:${memberId}`
    : (() => {
        const anonId = (params.anonId ?? "").trim();
        return anonId ? `anon:${anonId}` : "";
      })();

  if (!consumerKey) return null;

  return crypto.createHash("sha256").update(consumerKey).digest("base64url");
}

function parseContext(
  value: string | null | undefined,
): PlaybackContextPayload | null {
  const context = (value ?? "").trim();
  if (!context) return null;

  const [prefix, encodedPayload, signature, extra] = context.split(".");

  if (
    prefix !== "stpc1" ||
    !encodedPayload ||
    !signature ||
    extra !== undefined
  ) {
    return null;
  }

  const secret = getSecret();
  if (!secret) return null;

  const expectedSignature = sign(encodedPayload, secret);
  if (!timingSafeEqualText(signature, expectedSignature)) return null;

  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const value = JSON.parse(raw) as unknown;
    const payload = asRecord(value);

    if (!payload) return null;
    if (payload.v !== CONTEXT_VERSION) return null;
    if (typeof payload.tid !== "string" || !isUuid(payload.tid)) return null;
    if (typeof payload.sid !== "string") return null;
    if (typeof payload.binding !== "string" || !payload.binding) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }

    const scopeId = normalizeScopeId(payload.sid);
    if (!scopeId) return null;
    if (payload.exp <= Date.now()) return null;

    return {
      v: CONTEXT_VERSION,
      tid: payload.tid,
      sid: scopeId,
      binding: payload.binding,
      exp: Math.floor(payload.exp),
    };
  } catch {
    return null;
  }
}

function scopeFromSummary(summary: RecordingSummary | null): string | null {
  return normalizeScopeId(asTrimmedString(summary?.albumCatalogueId));
}

async function getRecordingScopeId(
  recordingId: string,
): Promise<string | null> {
  const cached = recordingScopeCache.get(recordingId);

  if (cached && cached.expiresAtMs > Date.now()) {
    return cached.scopeId;
  }

  const summary = await getRecordingSummaryByRecordingId(recordingId);
  const scopeId = scopeFromSummary(summary);

  recordingScopeCache.set(recordingId, {
    scopeId,
    expiresAtMs: Date.now() + RECORDING_SCOPE_CACHE_TTL_MS,
  });

  return scopeId;
}

export function issueShareTokenPlaybackContext(params: {
  shareTokenId: string;
  scopeId: string;
  tokenExpiresAt: string | null;
  memberId: string | null;
  anonId: string | null;
}): string | null {
  const secret = getSecret();
  if (!secret) return null;

  if (!isUuid(params.shareTokenId)) return null;

  const scopeId = normalizeScopeId(params.scopeId);
  if (!scopeId) return null;

  const binding = consumerBinding({
    memberId: params.memberId,
    anonId: params.anonId,
  });

  if (!binding) return null;

  const now = Date.now();
  const rollingExpiry = now + CONTEXT_TTL_MS;

  const tokenExpiryMs = params.tokenExpiresAt
    ? Date.parse(params.tokenExpiresAt)
    : NaN;

  const expiryMs = Number.isFinite(tokenExpiryMs)
    ? Math.min(rollingExpiry, tokenExpiryMs)
    : rollingExpiry;

  if (expiryMs <= now) return null;

  const payload: PlaybackContextPayload = {
    v: CONTEXT_VERSION,
    tid: params.shareTokenId,
    sid: scopeId,
    binding,
    exp: expiryMs,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );

  return `stpc1.${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export async function resolveShareTokenPlaybackContext(params: {
  context: string | null;
  scopeId: string | null;
  memberId: string | null;
  anonId: string | null;
  recordingId: string;
}): Promise<ResolvedShareTokenPlaybackContext | null> {
  const payload = parseContext(params.context);
  if (!payload) return null;

  const expectedScopeId = normalizeScopeId(params.scopeId);
  if (!expectedScopeId || payload.sid !== expectedScopeId) return null;

  const expectedBinding = consumerBinding({
    memberId: params.memberId,
    anonId: params.anonId,
  });

  if (
    !expectedBinding ||
    !timingSafeEqualText(payload.binding, expectedBinding)
  ) {
    return null;
  }

  const recordingScopeId = await getRecordingScopeId(params.recordingId);

  if (!recordingScopeId || recordingScopeId !== expectedScopeId) {
    return null;
  }

  const result = await sql<TokenRow>`
    select
      id,
      scope_id,
      telemetry_label,
      expires_at,
      revoked_at
    from share_tokens
    where id = ${payload.tid}::uuid
    limit 1
  `;

  const token = result.rows[0];
  if (!token) return null;

  const tokenScopeId = normalizeScopeId(token.scope_id);
  if (tokenScopeId !== expectedScopeId) return null;
  if (token.revoked_at) return null;

  const tokenExpiryMs = token.expires_at ? Date.parse(token.expires_at) : NaN;

  if (Number.isFinite(tokenExpiryMs) && tokenExpiryMs <= Date.now()) {
    return null;
  }

  const telemetryLabel = asTrimmedString(token.telemetry_label);
  if (!telemetryLabel || telemetryLabel.length > 120) return null;

  return {
    shareTokenId: token.id,
    scopeId: expectedScopeId,
    telemetryLabel,
  };
}

export async function recordShareTokenPlaybackEvent(params: {
  shareTokenId: string;
  telemetryLabel: string;
  scopeId: string;
  audience: "member" | "anonymous";
  memberId: string | null;
  recordingId: string;
  playbackId: string;
  eventType: string;
  milestoneKey: string;
  listenedMs: number;
  progressMs: number;
  durationMs: number | null;
  occurredAtIso: string;
}): Promise<void> {
  try {
    await sql`
      insert into share_token_playback_events (
        share_token_id,
        telemetry_label,
        scope_id,
        audience,
        member_id,
        recording_id,
        playback_id,
        event_type,
        milestone_key,
        listened_ms,
        progress_ms,
        duration_ms,
        occurred_at
      )
      values (
        ${params.shareTokenId}::uuid,
        ${params.telemetryLabel},
        ${params.scopeId},
        ${params.audience},
        ${params.memberId}::uuid,
        ${params.recordingId},
        ${params.playbackId},
        ${params.eventType},
        ${params.milestoneKey},
        ${params.listenedMs},
        ${params.progressMs},
        ${params.durationMs},
        ${params.occurredAtIso}::timestamptz
      )
      on conflict do nothing
    `;
  } catch (error) {
    console.error("share-token playback telemetry insert failed", {
      shareTokenId: params.shareTokenId,
      recordingId: params.recordingId,
      playbackId: params.playbackId,
      eventType: params.eventType,
      error,
    });
  }
}
