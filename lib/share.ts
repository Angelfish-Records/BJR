// web/lib/share.ts

export type ShareMethod = 'native' | 'copy' | 'sheet'

export type ShareTarget =
  | {
      type: 'album'
      albumSlug: string
      albumId?: string
      title: string
      text: string
      url: string
    }
  | {
      type: 'track'
      albumSlug: string
      albumId?: string
      trackId: string
      trackTitle: string
      title: string
      text: string
      url: string
    }

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, '')
}

export function getOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return stripTrailingSlash(explicitOrigin)
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  const env = process.env.NEXT_PUBLIC_SITE_URL
  if (env) return stripTrailingSlash(env)
  return '' // last resort: relative URLs (fine for copy, not for OG previews)
}

function addUtm(u: URL, method: ShareMethod, targetType: 'album' | 'track') {
  u.searchParams.set('utm_source', 'share')
  u.searchParams.set('utm_medium', method)
  u.searchParams.set('utm_campaign', targetType)
  return u
}

export function buildShareTarget(input: {
  type: 'album' | 'track'
  methodHint?: ShareMethod
  origin?: string
  album: { slug: string; title: string; artistName?: string; id?: string }
  track?: { id: string; title: string }
}): ShareTarget {
  const origin = getOrigin(input.origin)
  const method = input.methodHint ?? 'copy'

  const artist = input.album.artistName?.trim()
  const albumTitle = input.album.title?.trim() || 'Album'
  const basePath = `/albums/${encodeURIComponent(input.album.slug)}`
  const baseAbs = origin ? `${origin}${basePath}` : basePath

  if (input.type === 'album') {
    const url = origin
      ? addUtm(new URL(baseAbs), method, 'album').toString()
      : baseAbs

    const title = artist ? `${artist} — ${albumTitle}` : albumTitle
    const text = artist ? `Listen to ${albumTitle} by ${artist}` : `Listen to ${albumTitle}`

    return {
      type: 'album',
      albumSlug: input.album.slug,
      albumId: input.album.id,
      title,
      text,
      url,
    }
  }

  if (!input.track) throw new Error('buildShareTarget(track) requires track')

  const trackTitle = input.track.title?.trim() || 'Track'
  const abs = origin ? new URL(baseAbs) : null
  if (abs) {
    abs.searchParams.set('t', input.track.id)
    addUtm(abs, method, 'track')
  }

  const url = abs ? abs.toString() : `${baseAbs}?t=${encodeURIComponent(input.track.id)}`

  const title = artist
    ? `${trackTitle} — ${albumTitle} — ${artist}`
    : `${trackTitle} — ${albumTitle}`

  const text = artist
    ? `Listen to “${trackTitle}” on ${albumTitle} by ${artist}`
    : `Listen to “${trackTitle}” on ${albumTitle}`

  return {
    type: 'track',
    albumSlug: input.album.slug,
    albumId: input.album.id,
    trackId: input.track.id,
    trackTitle,
    title,
    text,
    url,
  }
}

export type ShareResult =
  | { ok: true; method: 'native' | 'copy'; url: string }
  | { ok: false; reason: 'clipboard_unavailable' | 'failed'; url: string }

export async function performShare(target: ShareTarget): Promise<ShareResult> {
  const url = target.url

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    const nav = navigator as Navigator & {
      share?: (data: {title?: string; text?: string; url?: string}) => Promise<void>
    }

    if (typeof nav.share === 'function') {
      try {
        await nav.share({title: target.title, text: target.text, url})
        return {ok: true, method: 'native', url}
      } catch {
        // user cancel or failure -> fall through to copy
      }
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return {ok: true, method: 'copy', url}
    }
    return {ok: false, reason: 'clipboard_unavailable', url}
  } catch {
    return {ok: false, reason: 'failed', url}
  }
}

