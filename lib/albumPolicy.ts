import 'server-only'
import {client} from '@/sanity/lib/client'

export type TierName = 'friend' | 'patron' | 'partner'

export type TracklistVisibility = 'full' | 'titles_only' | 'hidden'

export type AlbumPolicy = {
  // Public page visibility (album card/page can exist even if not playable)
  publicPageVisible: boolean

  // Release timing: if now < releaseAt => embargo mode for the public.
  releaseAt: string | null // ISO string from Sanity

  // Early access during embargo
  earlyAccessEnabled: boolean
  earlyAccessTiers: TierName[] // tiers that can bypass embargo

  // Post-release gating (or always-on gating)
  minTierForPlayback: TierName | null

  // Tracklist visibility control
  tracklistVisibility: TracklistVisibility
  minTierForTracklist: TierName | null
}

type PolicyDoc = {
  publicPageVisible?: boolean
  releaseAt?: string
  earlyAccessEnabled?: boolean
  earlyAccessTiers?: TierName[]
  minTierForPlayback?: TierName
  tracklistVisibility?: TracklistVisibility
  minTierForTracklist?: TierName
}

export async function getAlbumPolicyByAlbumId(albumId: string): Promise<AlbumPolicy | null> {
  const id = (albumId ?? '').trim()
  if (!id) return null

  // Transitional: accept catalogId OR Sanity _id (so your test IDs work).
  const q = `
    *[_type == "album" && (catalogId == $albumId || _id == $albumId)][0]{
      publicPageVisible,
      releaseAt,
      earlyAccessEnabled,
      earlyAccessTiers,
      minTierForPlayback,
      tracklistVisibility,
      minTierForTracklist
    }
  `

  const doc = await client.fetch<PolicyDoc | null>(q, {albumId: id})
  if (!doc) return null

  return {
    publicPageVisible: doc.publicPageVisible !== false,
    releaseAt: typeof doc.releaseAt === 'string' && doc.releaseAt.trim() ? doc.releaseAt.trim() : null,
    earlyAccessEnabled: doc.earlyAccessEnabled === true,
    earlyAccessTiers: Array.isArray(doc.earlyAccessTiers) ? doc.earlyAccessTiers : [],
    minTierForPlayback: doc.minTierForPlayback ?? null,
    tracklistVisibility: doc.tracklistVisibility ?? 'full',
    minTierForTracklist: doc.minTierForTracklist ?? null,
  }
}

export function isEmbargoed(policy: AlbumPolicy | null, nowMs = Date.now()): boolean {
  if (!policy?.releaseAt) return false
  const t = Date.parse(policy.releaseAt)
  if (!Number.isFinite(t)) return false
  return nowMs < t
}
