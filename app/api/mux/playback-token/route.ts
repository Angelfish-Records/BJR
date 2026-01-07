// web/app/api/mux/playback-token/route.ts
import 'server-only'

import {NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {sql} from '@vercel/postgres'
import {auth, clerkClient} from '@clerk/nextjs/server'
import Mux from '@mux/mux-node'

import {ensureMemberByClerk} from '@/lib/members'
import {listCurrentEntitlementKeys} from '@/lib/entitlements'
import {ACCESS_ACTIONS, EVENT_SOURCES, ENT, ENTITLEMENTS, deriveTier} from '@/lib/vocab'
import {logAccessDecision, logMemberEvent, newCorrelationId} from '@/lib/events'

type TokenOk = {ok: true; token: string; expiresAt: string}
type TokenDenied = {
  ok: false
  blocked: true
  action: 'signup' | 'subscribe'
  reason: string
}

const ANON_COOKIE = 'anon_id'
const ANON_FREE_TRACKS_PER_DAY = 5 // tune

function isLikelyMuxPlaybackId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,200}$/.test(id)
}

async function getOrCreateAnonId(): Promise<{anonId: string; isNew: boolean}> {
  const jar = await cookies()
  const existing = jar.get(ANON_COOKIE)?.value
  if (existing && existing.length >= 8) return {anonId: existing, isNew: false}

  const anonId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `anon_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`

  return {anonId, isNew: true}
}

function shouldUseSecureCookie(): boolean {
  // On localhost over http, secure cookies won't set.
  return process.env.NODE_ENV === 'production'
}

async function countAnonDistinctPlaysToday(params: {anonId: string}): Promise<number> {
  const {anonId} = params
  const res = await sql`
    select count(distinct (payload->'resource'->>'id'))::int as n
    from member_events
    where member_id is null
      and event_type = 'access_allowed'
      and payload->>'action' = ${ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE}
      and payload->>'anon_id' = ${anonId}
      and occurred_at >= (now() - interval '24 hours')
  `
  return (res.rows[0]?.n as number | undefined) ?? 0
}

function muxClient(): Mux {
  const tokenId = process.env.MUX_SIGNING_KEY_ID
  const tokenSecret = process.env.MUX_SIGNING_KEY_SECRET

  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux signing env vars: MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_SECRET.')
  }

  return new Mux({tokenId, tokenSecret})
}

async function signPlaybackToken(playbackId: string): Promise<{token: string; expiresAt: string}> {
  const client = muxClient()
  const expirationSeconds = 60 * 10
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000)

  const token = await client.jwt.signPlaybackId(playbackId, {
    type: 'video',
    expiration: `${expirationSeconds}s`,
  })

  return {token, expiresAt: expiresAt.toISOString()}
}

export async function POST(req: Request) {
  const correlationId = newCorrelationId()

  let playbackId: string | undefined
  try {
    const body = (await req.json()) as {playbackId?: string}
    playbackId = body.playbackId?.toString().trim()
  } catch {
    // ignore
  }

  if (!playbackId || !isLikelyMuxPlaybackId(playbackId)) {
    return NextResponse.json(
      {ok: false, blocked: true, action: 'signup', reason: 'Missing/invalid playbackId.'} satisfies TokenDenied,
      {status: 400}
    )
  }

  const session = await auth()
  const userId = session.userId ?? null

  // ---------------------------
  // Logged-in path (unlimited if tier !== 'none')
  // ---------------------------
  if (userId) {
    const client = await clerkClient()

    const u = await client.users.getUser(userId)

    const email =
      u.emailAddresses
        ?.find((e: {id: string; emailAddress: string}) => e.id === u.primaryEmailAddressId)
        ?.emailAddress ??
      u.emailAddresses?.[0]?.emailAddress ??
      ''

    if (!email) {
      return NextResponse.json(
        {ok: false, blocked: true, action: 'signup', reason: 'No email on account.'} satisfies TokenDenied,
        {status: 403}
      )
    }

    const {id: memberId} = await ensureMemberByClerk({
      clerkUserId: userId,
      email,
      source: 'clerk',
      sourceDetail: {route: 'api/mux/playback-token'},
      marketingOptIn: true,
    })

    const keys = await listCurrentEntitlementKeys(memberId)
    const tier = deriveTier(keys)

    // Your rule: logged-in “free” (i.e. any non-none tier) is unlimited listening.
    if (tier !== 'none') {
      const {token, expiresAt} = await signPlaybackToken(playbackId)

      await logAccessDecision({
        memberId,
        allowed: true,
        action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
        resource: {kind: 'mux_playback', id: playbackId},
        requiredEntitlements: [ENTITLEMENTS.FREE_MEMBER, ENT.tier('free')],
        matchedEntitlement: null,
        reason: `tier:${tier}`,
        source: EVENT_SOURCES.SERVER,
        correlationId,
      })

      return NextResponse.json({ok: true, token, expiresAt} satisfies TokenOk)
    }

    // Fall through to anon-metering if tier is none.
  }

  // ---------------------------
  // Anonymous / tier-none fallback (metered)
  // ---------------------------
  const {anonId, isNew} = await getOrCreateAnonId()
  const used = await countAnonDistinctPlaysToday({anonId})

  if (used >= ANON_FREE_TRACKS_PER_DAY) {
    await logMemberEvent({
      memberId: null,
      eventType: 'access_denied',
      source: EVENT_SOURCES.SERVER,
      correlationId,
      payload: {
        action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
        anon_id: anonId,
        resource: {kind: 'mux_playback', id: playbackId},
        reason: `anon_free_limit_reached:${ANON_FREE_TRACKS_PER_DAY}`,
      },
    })

    const res = NextResponse.json(
      {
        ok: false,
        blocked: true,
        action: 'signup',
        reason: 'Free listening limit reached. Sign up to keep listening.',
      } satisfies TokenDenied,
      {status: 403}
    )

    if (isNew) {
      res.cookies.set(ANON_COOKIE, anonId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: shouldUseSecureCookie(),
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
    }

    return res
  }

  const {token, expiresAt} = await signPlaybackToken(playbackId)

  await logMemberEvent({
    memberId: null,
    eventType: 'access_allowed',
    source: EVENT_SOURCES.SERVER,
    correlationId,
    payload: {
      action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
      anon_id: anonId,
      resource: {kind: 'mux_playback', id: playbackId},
      required_entitlements: [],
      reason: `anon_meter_ok:${used + 1}/${ANON_FREE_TRACKS_PER_DAY}`,
    },
  })

  const res = NextResponse.json({ok: true, token, expiresAt} satisfies TokenOk)

  if (isNew) {
    res.cookies.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: shouldUseSecureCookie(),
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return res
}
