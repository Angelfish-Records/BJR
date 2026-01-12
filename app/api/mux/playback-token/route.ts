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

async function countAnonDistinctCompletedPlaysToday(params: {anonId: string}): Promise<number> {
  const {anonId} = params
  const res = await sql`
    select count(distinct (payload->>'track_id'))::int as n
    from member_events
    where payload->>'anon_id' = ${anonId}
      and event_type = 'track_play_completed'
      and occurred_at >= (now() - interval '24 hours')
  `
  return (res.rows[0]?.n as number | undefined) ?? 0
}

function muxClient(): Mux {
  const tokenId = process.env.MUX_TOKEN_ID
  const tokenSecret = process.env.MUX_TOKEN_SECRET

  if (!tokenId || !tokenSecret) {
    throw new Error('Missing Mux API env vars: MUX_TOKEN_ID and MUX_TOKEN_SECRET.')
  }

  return new Mux({tokenId, tokenSecret})
}


async function signPlaybackToken(playbackId: string): Promise<{token: string; expiresAt: string}> {
  const client = muxClient()

  const keyId = process.env.MUX_SIGNING_KEY_ID
  const keySecret =
    process.env.MUX_SIGNING_KEY_SECRET || process.env.MUX_SIGNING_PRIVATE_KEY

  if (!keyId || !keySecret) {
    throw new Error('Missing Mux signing env vars: MUX_SIGNING_KEY_ID and MUX_SIGNING_KEY_SECRET.')
  }

  const expirationSeconds = 60 * 10
  const expiresAt = new Date(Date.now() + expirationSeconds * 1000)

  const token = await client.jwt.signPlaybackId(playbackId, {
    type: 'video',
    expiration: `${expirationSeconds}s`,
    keyId,          // <-- critical
    keySecret,      // <-- critical
  })

  return {token, expiresAt: expiresAt.toISOString()}
}


export {POST} from '../token/route'

