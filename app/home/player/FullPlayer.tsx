'use client'

import React from 'react'
import {usePlayer, PlayerTrack} from './PlayerState'

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function IconCircleBtn(props: {
  label: string
  onClick?: () => void
  disabled?: boolean
  size?: number
  children: React.ReactNode
}) {
  const {label, onClick, disabled, size = 44, children} = props
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.92)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 0.9,
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  )
}

function PlayPauseBig({playing}: {playing: boolean}) {
  return playing ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.6" y="5" width="4.2" height="14" rx="1.3" />
      <rect x="13.2" y="5" width="4.2" height="14" rx="1.3" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 11l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 4h10a1.5 1.5 0 0 1 1.5 1.5V21l-6-3-6 3V5.5A1.5 1.5 0 0 1 7 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 8a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 14a3 3 0 1 0-2.9-3.7A3 3 0 0 0 6 14Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 22a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 22Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M8.7 11.2l5-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.7 12.8l5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="17.5" cy="12" r="1.6" />
    </svg>
  )
}

export default function FullPlayer() {
  const p = usePlayer()

// ---- Load album + tracks from Sanity via server route ----
const [albumInfo, setAlbumInfo] = React.useState<{
  title: string
  artist?: string
  year?: number
  description?: string
} | null>(null)

React.useEffect(() => {
  let cancelled = false

  async function load() {
    try {
      // IMPORTANT: set this to your test album slug in Sanity
      const slug = 'test-album' // <- CHANGE ME

      const res = await fetch(`/api/albums?slug=${encodeURIComponent(slug)}`, {cache: 'no-store'})
      const data = (await res.json()) as {
        album: {title: string; artist?: string; year?: number; description?: string} | null
        tracks: Array<{
          id: string
          title?: string
          artist?: string
          durationMs?: number
          muxPlaybackId?: string
        }>
      }

      if (cancelled) return

      setAlbumInfo(data.album)

      const tracks: PlayerTrack[] = (data.tracks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist ?? data.album?.artist,
        durationMs: t.durationMs,
        // NOTE: PlayerTrack must include muxPlaybackId for AudioEngine
        muxPlaybackId: t.muxPlaybackId,
      })) as unknown as PlayerTrack[] // only needed if your PlayerTrack type doesn’t yet include muxPlaybackId

      if (tracks.length > 0) p.setQueue(tracks)
    } catch (err) {
      if (cancelled) return
      p.setBlocked(err instanceof Error ? err.message : 'Failed to load album.')
    }
  }

  void load()
  return () => {
    cancelled = true
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])


  // ---- Fake progress until we wire a real audio element ----
  React.useEffect(() => {
    if (p.status !== 'playing') return
    const t = window.setInterval(() => p.tick(250), 250)
    return () => window.clearInterval(t)
  }, [p.status, p])

  const albumArtist = albumInfo?.artist ?? p.current?.artist ?? '—'
const albumTitle = albumInfo?.title ?? '—'
const albumMeta = albumInfo?.year ? `Album · ${albumInfo.year}` : 'Album'
const albumDesc =
  albumInfo?.description ??
  'This is placeholder copy. Soon: pull album description from Sanity and clamp to 2–3 lines.'


  const cur = p.current
  const dur = cur?.durationMs ?? 0
  const pos = clamp(p.positionMs, 0, dur > 0 ? dur : p.positionMs)

  const playing = p.status === 'playing'
  const canPlay = Boolean(cur ?? p.queue[0])

  const onTogglePlay = () => {
    if (playing) p.pause()
    else p.play()
  }

  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 18,
      }}
    >
      {/* Header / hero */}
      <div style={{display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 10}}>
        <div style={{fontSize: 12, opacity: 0.75}}>{albumArtist}</div>

        {/* Artwork (placeholder) */}
        <div
          style={{
            width: 210,
            height: 210,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.14)',
            background:
              'radial-gradient(120px 120px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))',
            boxShadow: '0 22px 60px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        />

        <div style={{fontSize: 22, fontWeight: 650, letterSpacing: 0.2, opacity: 0.96}}>{albumTitle}</div>
        <div style={{fontSize: 12, opacity: 0.7}}>{albumMeta}</div>
        
        <div style={{maxWidth: 540, fontSize: 12, opacity: 0.62, lineHeight: 1.45}}>
          {albumDesc}
        </div>

        {/* Controls row (like reference) */}
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 8}}>
          <IconCircleBtn label="Download" onClick={() => {}}>
            <DownloadIcon />
          </IconCircleBtn>

          <IconCircleBtn label="Save" onClick={() => {}}>
            <BookmarkIcon />
          </IconCircleBtn>

          <button
            type="button"
            onClick={canPlay ? onTogglePlay : undefined}
            disabled={!canPlay}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play'}
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(245,245,245,0.95)',
              color: 'rgba(0,0,0,0.92)',
              display: 'grid',
              placeItems: 'center',
              cursor: canPlay ? 'pointer' : 'default',
              opacity: canPlay ? 0.98 : 0.55,
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
            }}
          >
            <PlayPauseBig playing={playing} />
          </button>

          <IconCircleBtn label="Share" onClick={() => {}}>
            <ShareIcon />
          </IconCircleBtn>

          <IconCircleBtn label="More" onClick={() => {}}>
            <MoreIcon />
          </IconCircleBtn>
        </div>

        {/* Seek (optional; reference screenshot doesn’t show it, but you’ll want it) */}
        <div style={{width: '100%', maxWidth: 560, marginTop: 10}}>
          <input
            aria-label="Seek"
            type="range"
            min={0}
            max={Math.max(1, dur)}
            value={Math.min(Math.max(0, pos), Math.max(1, dur))}
            onChange={(e) => p.seek(Number(e.target.value))}
            style={{
              width: '100%',
              height: 18,
              margin: 0,
              background: 'transparent',
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
          />
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.65, marginTop: 6}}>
            <span>{fmtTime(pos)}</span>
            <span>{fmtTime(dur)}</span>
          </div>
        </div>

        <style>{`
          input[aria-label="Seek"]::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.18);
          }
          input[aria-label="Seek"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 10px;
            height: 10px;
            border-radius: 999px;
            margin-top: -3px;
            background: color-mix(in srgb, var(--accent) 75%, white 10%);
            box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
          }
          input[aria-label="Seek"]::-moz-range-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.18);
          }
          input[aria-label="Seek"]::-moz-range-thumb {
            width: 10px;
            height: 10px;
            border: 0;
            border-radius: 999px;
            background: color-mix(in srgb, var(--accent) 75%, white 10%);
            box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
          }
        `}</style>
      </div>

      {/* Tracklist */}
      <div style={{marginTop: 18}}>
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.10)',
            paddingTop: 14,
          }}
        >
          {p.queue.map((t, i) => {
            const isCur = p.current?.id === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => p.play(t)}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  padding: '12px 10px',
                  borderRadius: 14,
                  border: isCur ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.00)',
                  background: isCur ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: 'rgba(255,255,255,0.92)',
                  cursor: 'pointer',
                }}
              >
                <div style={{fontSize: 12, opacity: 0.7}}>{i + 1}</div>

                <div style={{minWidth: 0}}>
                  <div
                    style={{
                      fontSize: 13,
                      opacity: 0.92,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.title ?? t.id}
                  </div>
                  <div style={{fontSize: 12, opacity: 0.6}}>
                    {/* Placeholder “plays” to mimic reference; replace with real data or remove */}
                    {isCur ? (playing ? 'Now playing' : 'Selected') : '—'}
                  </div>
                </div>

                <div style={{fontSize: 12, opacity: 0.7}}>{fmtTime(t.durationMs ?? 0)}</div>
              </button>
            )
          })}
        </div>

        {p.lastError ? (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(0,0,0,0.22)',
              padding: '10px 12px',
              fontSize: 12,
              opacity: 0.85,
              lineHeight: 1.45,
            }}
          >
            {p.lastError}
          </div>
        ) : null}
      </div>
    </div>
  )
}
