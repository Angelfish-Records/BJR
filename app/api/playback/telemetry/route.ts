// web/app/api/playback/telemetry/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import {
  countAnonDistinctCompletedTracks,
  logPlaybackTelemetryComplete,
  logPlaybackTelemetryPlay,
  logPlaybackTelemetryProgress,
  newCorrelationId,
} from "@/lib/events";
import { EVENT_SOURCES, EVENT_TYPES } from "@/lib/vocab";
import {
  runPlaybackAutoBadgeAwardsForMember,
  type NewlyAwardedBadge,
} from "@/lib/badgeAutoAward";
import { markOverlayAnnouncedForAwardedBadges } from "@/lib/badgeAwardAnnouncementServer";
import { ensureAnonId, persistAnonId } from "@/lib/anon";
import {
  ANON_PLAYBACK_POLICY,
  hasReachedAnonPlaybackCap,
} from "@/lib/anonPlaybackPolicy";
import {
  recordShareTokenPlaybackEvent,
  resolveShareTokenPlaybackContext,
} from "@/lib/shareTokenPlaybackContext";

type PlaybackTelemetryEvent = "play" | "progress" | "complete";

const QUALIFIED_COMPLETION_RATIO = 0.9;

type PlaybackTelemetryRequest = {
  event?: PlaybackTelemetryEvent;
  recordingId?: string;
  playbackId?: string;
  milestoneKey?: string;
  listenedMs?: number;
  progressMs?: number;
  durationMs?: number | null;
  albumScopeId?: string | null;
  sharePlaybackContext?: string | null;
};

type MemberRow = {
  id: string;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asFiniteNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.floor(value);
}

async function getMemberIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  if (!userId) return null;

  const res = await sql<MemberRow>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;

  return res.rows[0]?.id ?? null;
}

async function insertDedupeKey(params: {
  memberId: string;
  playbackId: string;
  eventType: string;
  milestoneKey: string;
}): Promise<boolean> {
  const { memberId, playbackId, eventType, milestoneKey } = params;

  const res = await sql<{ inserted: boolean }>`
    insert into member_playback_telemetry_dedupe (
      member_id,
      playback_id,
      event_type,
      milestone_key
    )
    values (
      ${memberId}::uuid,
      ${playbackId},
      ${eventType},
      ${milestoneKey}
    )
    on conflict do nothing
    returning true as inserted
  `;

  return res.rows[0]?.inserted === true;
}

async function insertAnonymousDedupeKey(params: {
  anonId: string;
  playbackId: string;
  recordingId: string;
  eventType: string;
  milestoneKey: string;
}): Promise<boolean> {
  const { anonId, playbackId, recordingId, eventType, milestoneKey } = params;

  const res = await sql<{ inserted: boolean }>`
    insert into anonymous_playback_telemetry_dedupe (
      anon_id,
      playback_id,
      recording_id,
      event_type,
      milestone_key
    )
    values (
      ${anonId},
      ${playbackId},
      ${recordingId},
      ${eventType},
      ${milestoneKey}
    )
    on conflict do nothing
    returning true as inserted
  `;

  return res.rows[0]?.inserted === true;
}

async function upsertPlaybackPlay(params: {
  memberId: string;
  recordingId: string;
  occurredAtIso: string;
}): Promise<void> {
  const { memberId, recordingId, occurredAtIso } = params;

  await sql`
    insert into member_track_listen_stats (
      member_id,
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      ${recordingId},
      0,
      0,
      1,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id, recording_id)
    do update set
      play_count = member_track_listen_stats.play_count + 1,
      first_listened_at = coalesce(
        member_track_listen_stats.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_track_listen_stats.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;

  await sql`
    insert into member_listen_totals (
      member_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      0,
      0,
      1,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id)
    do update set
      play_count = member_listen_totals.play_count + 1,
      first_listened_at = coalesce(
        member_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

async function upsertPlaybackProgress(params: {
  memberId: string;
  recordingId: string;
  listenedMs: number;
  occurredAtIso: string;
}): Promise<void> {
  const { memberId, recordingId, listenedMs, occurredAtIso } = params;

  await sql`
    insert into member_track_listen_stats (
      member_id,
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      ${recordingId},
      ${listenedMs},
      1,
      0,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id, recording_id)
    do update set
      listened_ms = member_track_listen_stats.listened_ms + ${listenedMs},
      credited_progress_count = member_track_listen_stats.credited_progress_count + 1,
      first_listened_at = coalesce(
        member_track_listen_stats.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_track_listen_stats.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;

  await sql`
    insert into member_listen_totals (
      member_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      ${listenedMs},
      1,
      0,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id)
    do update set
      listened_ms = member_listen_totals.listened_ms + ${listenedMs},
      credited_progress_count = member_listen_totals.credited_progress_count + 1,
      first_listened_at = coalesce(
        member_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

async function upsertRecordingPlaybackPlay(params: {
  recordingId: string;
  occurredAtIso: string;
}): Promise<void> {
  const { recordingId, occurredAtIso } = params;

  await sql`
    insert into recording_listen_totals (
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${recordingId},
      0,
      0,
      1,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (recording_id)
    do update set
      play_count = recording_listen_totals.play_count + 1,
      first_listened_at = coalesce(
        recording_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(recording_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

async function upsertRecordingPlaybackProgress(params: {
  recordingId: string;
  listenedMs: number;
  occurredAtIso: string;
}): Promise<void> {
  const { recordingId, listenedMs, occurredAtIso } = params;

  await sql`
    insert into recording_listen_totals (
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${recordingId},
      ${listenedMs},
      1,
      0,
      0,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (recording_id)
    do update set
      listened_ms = recording_listen_totals.listened_ms + ${listenedMs},
      credited_progress_count = recording_listen_totals.credited_progress_count + 1,
      first_listened_at = coalesce(
        recording_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(recording_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

async function upsertRecordingPlaybackComplete(params: {
  recordingId: string;
  occurredAtIso: string;
}): Promise<void> {
  const { recordingId, occurredAtIso } = params;

  await sql`
    insert into recording_listen_totals (
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${recordingId},
      0,
      0,
      0,
      1,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (recording_id)
    do update set
      completed_count = recording_listen_totals.completed_count + 1,
      first_listened_at = coalesce(
        recording_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(recording_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

async function upsertPlaybackComplete(params: {
  memberId: string;
  recordingId: string;
  occurredAtIso: string;
}): Promise<void> {
  const { memberId, recordingId, occurredAtIso } = params;

  await sql`
    insert into member_track_listen_stats (
      member_id,
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      ${recordingId},
      0,
      0,
      0,
      1,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id, recording_id)
    do update set
      completed_count = member_track_listen_stats.completed_count + 1,
      first_listened_at = coalesce(
        member_track_listen_stats.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_track_listen_stats.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;

  await sql`
    insert into member_listen_totals (
      member_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      first_listened_at,
      last_listened_at,
      created_at,
      updated_at
    )
    values (
      ${memberId}::uuid,
      0,
      0,
      0,
      1,
      ${occurredAtIso}::timestamptz,
      ${occurredAtIso}::timestamptz,
      now(),
      now()
    )
    on conflict (member_id)
    do update set
      completed_count = member_listen_totals.completed_count + 1,
      first_listened_at = coalesce(
        member_listen_totals.first_listened_at,
        ${occurredAtIso}::timestamptz
      ),
      last_listened_at = greatest(
        coalesce(member_listen_totals.last_listened_at, ${occurredAtIso}::timestamptz),
        ${occurredAtIso}::timestamptz
      ),
      updated_at = now()
  `;
}

type NormalizedPlaybackTelemetry = {
  event: PlaybackTelemetryEvent;
  recordingId: string;
  playbackId: string;
  milestoneKey: string;
  listenedMs: number;
  progressMs: number;
  durationMs: number | null;
  albumScopeId: string | null;
  sharePlaybackContext: string | null;
};

type TelemetryProcessingParams = NormalizedPlaybackTelemetry & {
  memberId: string | null;
  userId: string | null;
  correlationId: string;
  occurredAtIso: string;
};

type AnonymousPlaybackCapState = {
  anonymousCapReached: boolean;
  cap: {
    used: number;
    max: number;
    windowDays: number;
  };
};

function isQualifiedCompletion(
  telemetry: NormalizedPlaybackTelemetry,
): boolean {
  if (telemetry.event !== "complete") return true;

  const durationMs = telemetry.durationMs ?? 0;

  return (
    durationMs > 0 &&
    telemetry.progressMs / durationMs >= QUALIFIED_COMPLETION_RATIO
  );
}

async function resolveAnonymousPlaybackCapState(params: {
  memberId: string | null;
  hasShareAttribution: boolean;
  telemetry: NormalizedPlaybackTelemetry;
  anonId: string;
}): Promise<AnonymousPlaybackCapState | null> {
  if (
    params.memberId ||
    params.hasShareAttribution ||
    params.telemetry.event !== "complete"
  ) {
    return null;
  }

  const used = await countAnonDistinctCompletedTracks({
    anonId: params.anonId,
    sinceDays: ANON_PLAYBACK_POLICY.windowDays,
  });

  return {
    anonymousCapReached: hasReachedAnonPlaybackCap({
      distinctCompletedTracks: used,
    }),
    cap: {
      used,
      max: ANON_PLAYBACK_POLICY.distinctTrackCap,
      windowDays: ANON_PLAYBACK_POLICY.windowDays,
    },
  };
}

function telemetryResponse(
  body: Record<string, unknown>,
  status: number,
  correlationId: string,
): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("x-correlation-id", correlationId);
  return response;
}

function telemetryResponseWithAnon(
  body: Record<string, unknown>,
  status: number,
  correlationId: string,
  anonId: string,
  isNewAnonId: boolean,
): NextResponse {
  const response = telemetryResponse(body, status, correlationId);

  if (isNewAnonId) {
    persistAnonId(response, anonId);
  }

  return response;
}

async function readPlaybackTelemetryRequest(
  req: NextRequest,
): Promise<PlaybackTelemetryRequest | null> {
  try {
    return (await req.json()) as PlaybackTelemetryRequest;
  } catch {
    return null;
  }
}

function normalizePlaybackTelemetryRequest(
  body: PlaybackTelemetryRequest,
):
  | { ok: true; value: NormalizedPlaybackTelemetry }
  | { ok: false; error: "invalid_request" | "invalid_progress" } {
  const event = body.event;
  const recordingId = asTrimmedString(body.recordingId);
  const playbackId = asTrimmedString(body.playbackId);
  const milestoneKey = asTrimmedString(body.milestoneKey);
  const listenedMs = asFiniteNonNegativeInt(body.listenedMs);
  const progressMs = asFiniteNonNegativeInt(body.progressMs);
  const durationMs =
    body.durationMs == null ? null : asFiniteNonNegativeInt(body.durationMs);

  if (
    (event !== "play" && event !== "progress" && event !== "complete") ||
    !recordingId ||
    !playbackId ||
    !milestoneKey
  ) {
    return { ok: false, error: "invalid_request" };
  }

  if (event === "progress" && listenedMs <= 0) {
    return { ok: false, error: "invalid_progress" };
  }

  return {
    ok: true,
    value: {
      event,
      recordingId,
      playbackId,
      milestoneKey,
      listenedMs,
      progressMs,
      durationMs,
      albumScopeId: asTrimmedString(body.albumScopeId) || null,
      sharePlaybackContext: asTrimmedString(body.sharePlaybackContext) || null,
    },
  };
}

const TELEMETRY_EVENT_TYPES: Record<PlaybackTelemetryEvent, string> = {
  play: EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY,
  progress: EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS,
  complete: EVENT_TYPES.PLAYBACK_TELEMETRY_COMPLETE,
};

async function insertTelemetryDedupe(params: {
  memberId: string | null;
  anonId: string;
  recordingId: string;
  playbackId: string;
  eventType: string;
  milestoneKey: string;
}): Promise<boolean> {
  if (params.memberId) {
    return insertDedupeKey({
      memberId: params.memberId,
      playbackId: params.playbackId,
      eventType: params.eventType,
      milestoneKey: params.milestoneKey,
    });
  }

  return insertAnonymousDedupeKey({
    anonId: params.anonId,
    playbackId: params.playbackId,
    recordingId: params.recordingId,
    eventType: params.eventType,
    milestoneKey: params.milestoneKey,
  });
}

async function recordShareAttribution(params: {
  shareAttribution: Awaited<
    ReturnType<typeof resolveShareTokenPlaybackContext>
  >;
  memberId: string | null;
  telemetry: NormalizedPlaybackTelemetry;
  eventType: string;
  occurredAtIso: string;
}): Promise<boolean> {
  if (!params.shareAttribution) return true;

  try {
    await recordShareTokenPlaybackEvent({
      shareTokenId: params.shareAttribution.shareTokenId,
      telemetryLabel: params.shareAttribution.telemetryLabel,
      scopeId: params.shareAttribution.scopeId,
      audience: params.memberId ? "member" : "anonymous",
      memberId: params.memberId,
      recordingId: params.telemetry.recordingId,
      playbackId: params.telemetry.playbackId,
      eventType: params.eventType,
      milestoneKey: params.telemetry.milestoneKey,
      listenedMs: params.telemetry.listenedMs,
      progressMs: params.telemetry.progressMs,
      durationMs: params.telemetry.durationMs,
      occurredAtIso: params.occurredAtIso,
    });
    return true;
  } catch {
    return false;
  }
}

function memberTelemetryPayload(
  params: TelemetryProcessingParams,
): Record<string, unknown> {
  return {
    recording_id: params.recordingId,
    playback_id: params.playbackId,
    milestone_key: params.milestoneKey,
    progress_ms: params.progressMs,
    duration_ms: params.durationMs,
    clerk_user_id: params.userId,
  };
}

function memberProgressTelemetryPayload(
  params: TelemetryProcessingParams,
): Record<string, unknown> {
  return {
    recording_id: params.recordingId,
    playback_id: params.playbackId,
    milestone_key: params.milestoneKey,
    listened_ms: params.listenedMs,
    progress_ms: params.progressMs,
    duration_ms: params.durationMs,
    clerk_user_id: params.userId,
  };
}

async function processPlayTelemetry(
  params: TelemetryProcessingParams,
): Promise<NewlyAwardedBadge[]> {
  await Promise.all([
    params.memberId
      ? upsertPlaybackPlay({
          memberId: params.memberId,
          recordingId: params.recordingId,
          occurredAtIso: params.occurredAtIso,
        })
      : Promise.resolve(),
    upsertRecordingPlaybackPlay({
      recordingId: params.recordingId,
      occurredAtIso: params.occurredAtIso,
    }),
  ]);

  if (!params.memberId) return [];

  const newlyAwardedBadges = await runPlaybackAutoBadgeAwardsForMember({
    memberId: params.memberId,
    recordingId: params.recordingId,
    event: "play",
    grantedBy: "system",
    correlationId: params.correlationId,
  });

  await logPlaybackTelemetryPlay({
    memberId: params.memberId,
    source: EVENT_SOURCES.SERVER,
    correlationId: params.correlationId,
    payload: memberTelemetryPayload(params),
  });

  return newlyAwardedBadges;
}

async function processProgressTelemetry(
  params: TelemetryProcessingParams,
): Promise<NewlyAwardedBadge[]> {
  await Promise.all([
    params.memberId
      ? upsertPlaybackProgress({
          memberId: params.memberId,
          recordingId: params.recordingId,
          listenedMs: params.listenedMs,
          occurredAtIso: params.occurredAtIso,
        })
      : Promise.resolve(),
    upsertRecordingPlaybackProgress({
      recordingId: params.recordingId,
      listenedMs: params.listenedMs,
      occurredAtIso: params.occurredAtIso,
    }),
  ]);

  if (!params.memberId) return [];

  const newlyAwardedBadges = await runPlaybackAutoBadgeAwardsForMember({
    memberId: params.memberId,
    recordingId: params.recordingId,
    event: "progress",
    grantedBy: "system",
    correlationId: params.correlationId,
  });

  await logPlaybackTelemetryProgress({
    memberId: params.memberId,
    source: EVENT_SOURCES.SERVER,
    correlationId: params.correlationId,
    payload: memberProgressTelemetryPayload(params),
  });

  return newlyAwardedBadges;
}

async function processCompleteTelemetry(
  params: TelemetryProcessingParams,
): Promise<NewlyAwardedBadge[]> {
  await Promise.all([
    params.memberId
      ? upsertPlaybackComplete({
          memberId: params.memberId,
          recordingId: params.recordingId,
          occurredAtIso: params.occurredAtIso,
        })
      : Promise.resolve(),
    upsertRecordingPlaybackComplete({
      recordingId: params.recordingId,
      occurredAtIso: params.occurredAtIso,
    }),
  ]);

  if (!params.memberId) return [];

  const newlyAwardedBadges = await runPlaybackAutoBadgeAwardsForMember({
    memberId: params.memberId,
    recordingId: params.recordingId,
    event: "complete",
    grantedBy: "system",
    correlationId: params.correlationId,
  });

  await logPlaybackTelemetryComplete({
    memberId: params.memberId,
    source: EVENT_SOURCES.SERVER,
    correlationId: params.correlationId,
    payload: memberTelemetryPayload(params),
  });

  return newlyAwardedBadges;
}

async function processTelemetryEvent(
  params: TelemetryProcessingParams,
): Promise<NewlyAwardedBadge[]> {
  if (params.event === "play") {
    return processPlayTelemetry(params);
  }

  if (params.event === "progress") {
    return processProgressTelemetry(params);
  }

  return processCompleteTelemetry(params);
}

export async function POST(req: NextRequest) {
  const correlationId = newCorrelationId();
  const body = await readPlaybackTelemetryRequest(req);

  if (!body) {
    return telemetryResponse(
      { ok: false, error: "invalid_json" },
      400,
      correlationId,
    );
  }

  const normalized = normalizePlaybackTelemetryRequest(body);

  if (!normalized.ok) {
    return telemetryResponse(
      { ok: false, error: normalized.error },
      400,
      correlationId,
    );
  }

  const telemetry = normalized.value;

  if (!isQualifiedCompletion(telemetry)) {
    return telemetryResponse(
      {
        ok: true,
        ignored: true,
        reason: "completion_below_threshold",
      },
      200,
      correlationId,
    );
  }

  const { userId } = await auth();
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;
  const { anonId, isNew: isNewAnonId } = ensureAnonId(req);

  const shareAttribution = await resolveShareTokenPlaybackContext({
    context: telemetry.sharePlaybackContext,
    scopeId: telemetry.albumScopeId,
    memberId,
    anonId,
    recordingId: telemetry.recordingId,
  });

  const eventType = TELEMETRY_EVENT_TYPES[telemetry.event];
  const occurredAtIso = new Date().toISOString();

  const shareWriteSucceeded = await recordShareAttribution({
    shareAttribution,
    memberId,
    telemetry,
    eventType,
    occurredAtIso,
  });

  if (!shareWriteSucceeded) {
    return telemetryResponseWithAnon(
      { ok: false, error: "share_attribution_write_failed" },
      503,
      correlationId,
      anonId,
      isNewAnonId,
    );
  }

  const inserted = await insertTelemetryDedupe({
    memberId,
    anonId,
    recordingId: telemetry.recordingId,
    playbackId: telemetry.playbackId,
    eventType,
    milestoneKey: telemetry.milestoneKey,
  });

  if (!inserted) {
    const anonymousCapState = await resolveAnonymousPlaybackCapState({
      memberId,
      hasShareAttribution: shareAttribution !== null,
      telemetry,
      anonId,
    });

    return telemetryResponseWithAnon(
      {
        ok: true,
        deduped: true,
        ...(anonymousCapState ?? {}),
      },
      200,
      correlationId,
      anonId,
      isNewAnonId,
    );
  }

  const newlyAwardedBadges = await processTelemetryEvent({
    ...telemetry,
    memberId,
    userId,
    correlationId,
    occurredAtIso,
  });

  if (memberId && newlyAwardedBadges.length > 0) {
    await markOverlayAnnouncedForAwardedBadges({
      memberId,
      badges: newlyAwardedBadges,
    });
  }

  const anonymousCapState = await resolveAnonymousPlaybackCapState({
    memberId,
    hasShareAttribution: shareAttribution !== null,
    telemetry,
    anonId,
  });

  return telemetryResponseWithAnon(
    {
      ok: true,
      newlyAwardedBadges,
      ...(anonymousCapState ?? {}),
    },
    200,
    correlationId,
    anonId,
    isNewAnonId,
  );
}
