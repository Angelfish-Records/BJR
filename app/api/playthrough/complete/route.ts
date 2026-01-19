// web/app/api/playthrough/complete/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {logMemberEvent, newCorrelationId} from '@/lib/events'
import {EVENT_SOURCES} from '@/lib/vocab'
import {ensureAnonId} from '@/lib/anon'

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

export async function POST(req: NextRequest) {
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
    const res = NextResponse.json({ok: false}, {status: 400})
    res.headers.set('x-correlation-id', correlationId)
    return res
  }

  if (pct < COMPLETE_THRESHOLD) {
    const res = NextResponse.json({ok: true, ignored: true})
    res.headers.set('x-correlation-id', correlationId)
    return res
  }

  const res = NextResponse.json({ok: true})
  res.headers.set('x-correlation-id', correlationId)

  // Ensure anon id (cap enforcement depends on this being stable)
  const {anonId} = ensureAnonId(req, res)

  const {userId} = await auth()
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null

  await logMemberEvent({
    memberId,
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

  return res
}
