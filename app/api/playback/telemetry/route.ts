// web/app/api/playback/telemetry/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import {
  logPlaybackTelemetryComplete,
  logPlaybackTelemetryPlay,
  logPlaybackTelemetryProgress,
  newCorrelationId,
} from "@/lib/events";
import { EVENT_SOURCES, EVENT_TYPES } from "@/lib/vocab";

type PlaybackTelemetryEvent = "play" | "progress" | "complete";

type PlaybackTelemetryRequest = {
  event?: PlaybackTelemetryEvent;
  recordingId?: string;
  playbackId?: string;
  milestoneKey?: string;
  listenedMs?: number;
  progressMs?: number;
  durationMs?: number | null;
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
  playbackId: string;
  recordingId: string;
  eventType: string;
  milestoneKey: string;
}): Promise<boolean> {
  const { playbackId, recordingId, eventType, milestoneKey } = params;

  const res = await sql<{ inserted: boolean }>`
    insert into anonymous_playback_telemetry_dedupe (
      playback_id,
      recording_id,
      event_type,
      milestone_key
    )
    values (
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

export async function POST(req: NextRequest) {
  const correlationId = newCorrelationId();

  let body: PlaybackTelemetryRequest = {};
  try {
    body = (await req.json()) as PlaybackTelemetryRequest;
  } catch {
    const res = NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

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
    const res = NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  if (event === "progress" && listenedMs <= 0) {
    const res = NextResponse.json(
      { ok: false, error: "invalid_progress" },
      { status: 400 },
    );
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  const { userId } = await auth();
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;

  const eventType =
    event === "play"
      ? EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY
      : event === "progress"
        ? EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS
        : EVENT_TYPES.PLAYBACK_TELEMETRY_COMPLETE;

  const inserted = memberId
    ? await insertDedupeKey({
        memberId,
        playbackId,
        eventType,
        milestoneKey,
      })
    : await insertAnonymousDedupeKey({
        playbackId,
        recordingId,
        eventType,
        milestoneKey,
      });

  if (!inserted) {
    const res = NextResponse.json({ ok: true, deduped: true });
    res.headers.set("x-correlation-id", correlationId);
    return res;
  }

  const occurredAtIso = new Date().toISOString();

  if (event === "play") {
    if (memberId) {
      await upsertPlaybackPlay({
        memberId,
        recordingId,
        occurredAtIso,
      });
    }

    await upsertRecordingPlaybackPlay({
      recordingId,
      occurredAtIso,
    });

    if (memberId) {
      await logPlaybackTelemetryPlay({
        memberId,
        source: EVENT_SOURCES.SERVER,
        correlationId,
        payload: {
          recording_id: recordingId,
          playback_id: playbackId,
          milestone_key: milestoneKey,
          progress_ms: progressMs,
          duration_ms: durationMs,
          clerk_user_id: userId,
        },
      });
    }
  } else if (event === "progress") {
    if (memberId) {
      await upsertPlaybackProgress({
        memberId,
        recordingId,
        listenedMs,
        occurredAtIso,
      });
    }

    await upsertRecordingPlaybackProgress({
      recordingId,
      listenedMs,
      occurredAtIso,
    });

    if (memberId) {
      await logPlaybackTelemetryProgress({
        memberId,
        source: EVENT_SOURCES.SERVER,
        correlationId,
        payload: {
          recording_id: recordingId,
          playback_id: playbackId,
          milestone_key: milestoneKey,
          listened_ms: listenedMs,
          progress_ms: progressMs,
          duration_ms: durationMs,
          clerk_user_id: userId,
        },
      });
    }
  } else {
    if (memberId) {
      await upsertPlaybackComplete({
        memberId,
        recordingId,
        occurredAtIso,
      });
    }

    await upsertRecordingPlaybackComplete({
      recordingId,
      occurredAtIso,
    });

    if (memberId) {
      await logPlaybackTelemetryComplete({
        memberId,
        source: EVENT_SOURCES.SERVER,
        correlationId,
        payload: {
          recording_id: recordingId,
          playback_id: playbackId,
          milestone_key: milestoneKey,
          progress_ms: progressMs,
          duration_ms: durationMs,
          clerk_user_id: userId,
        },
      });
    }
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("x-correlation-id", correlationId);
  return res;
}
