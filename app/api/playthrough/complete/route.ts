// web/app/api/playthrough/complete/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {logMemberEvent, newCorrelationId} from '@/lib/events'
import {EVENT_SOURCES} from '@/lib/vocab'

const ANON_COOKIE = 'af_anon'
const COMPLETE_THRESHOLD = 0.9

async function getMemberIdByClerkUserId(userId: string): Promise<string | null> {
  if (!userId) return null
  const r = await sql<{id: string}>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  return (r.rows?.[0]?.id as string | undefined) ?? null
}

export async function POST(req: Request) {
  const correlationId = newCorrelationId()

  let trackId = ''
  let playbackId = ''
  let pct = 0

  try {
    const body = (await req.json()) as {trackId?: string; playbackId?: string; pct?: number}

    trackId = (body.trackId ?? '').toString().trim()
    playbackId = (body.playbackId ?? '').toString().trim()
    pct = typeof body.pct === 'number' && Number.isFinite(body.pct) ? body.pct : 0
  } catch {}

  if (!trackId || !playbackId) {
    return NextResponse.json({ok: false}, {status: 400})
  }

  // Only count near-full listens
  if (pct < COMPLETE_THRESHOLD) {
    return NextResponse.json({ok: true, ignored: true})
  }

  const {userId} = await auth()
  const jar = await cookies()
  const anonId = jar.get(ANON_COOKIE)?.value ?? null

  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null

  await logMemberEvent({
    memberId, // ✅ now filled when logged in
    eventType: 'track_play_completed',
    source: EVENT_SOURCES.SERVER,
    correlationId,
    payload: {
      track_id: trackId,
      playback_id: playbackId,
      pct,
      anon_id: anonId,
      clerk_user_id: userId,
    },
  })

  return NextResponse.json({ok: true})
}
