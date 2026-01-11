// web/app/home/player/FullPlayer.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from '@/lib/types'
import {deriveShareContext, shareAlbum, shareTrack} from './share'
import {PatternRing} from './VisualizerPattern'

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
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
        transform: 'translateZ(0)',
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
      <path d="M16 8a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 8Z" stroke="currentColor" strokeWidth="2" />
      <path d="M6 14a3 3 0 1 0-2.9-3.7A3 3 0 0 0 6 14Z" stroke="currentColor" strokeWidth="2" />
      <path d="M16 22a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 22Z" stroke="currentColor" strokeWidth="2" />
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

function NowPlayingPip() {
  return (
    <span className="afEq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

export default function FullPlayer(props: {
  albumSlug: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  onSelectAlbum?: (slug: string) => void
  isBrowsingAlbum?: boolean
}) {
  const p = usePlayer()
  const {albumSlug, album, tracks, albums, onSelectAlbum, isBrowsingAlbum = false} = props

  const albumTitle = album?.title ?? '—'
  const albumDesc = album?.description ?? 'This is placeholder copy. Soon: pull album description from Sanity.'
  const browseAlbums = albums.filter((a) => a.id !== album?.id)

  const playingish = p.status === 'playing' || p.status === 'loading' || p.intent === 'play'

  const isThisAlbumActive = Boolean(album?.id && p.queueContextId === album.id)
  const currentIsInBrowsedAlbum = Boolean(p.current && tracks.some((t) => t.id === p.current!.id))
  const playingThisAlbum = playingish && (isThisAlbumActive || currentIsInBrowsedAlbum)

  const canPlay = tracks.length > 0

  const [playLock, setPlayLock] = React.useState(false)
  const lockPlayFor = (ms: number) => {
    setPlayLock(true)
    window.setTimeout(() => setPlayLock(false), ms)
  }

  const prefetchTrack = (t?: PlayerTrack) => {
    const playbackId = t?.muxPlaybackId
    if (!playbackId) return
    window.dispatchEvent(new CustomEvent('af:prefetch-token', {detail: {playbackId}}))
  }

  const prefetchAlbumArt = (url?: string | null) => {
    if (!url) return
    try {
      const img = new Image()
      img.src = url
    } catch {}
  }

  const onTogglePlay = () => {
    lockPlayFor(120)

    if (playingThisAlbum) {
      p.setIntent('pause')
      window.dispatchEvent(new Event('af:pause-intent'))
      p.pause()
      return
    }

    const firstTrack = tracks[0]
    if (!firstTrack) return

    p.setQueue(tracks, {
      contextId: album?.id,
      artworkUrl: album?.artworkUrl ?? null,
      contextSlug: props.albumSlug,
      contextTitle: album?.title ?? undefined,
      contextArtist: album?.artist ?? undefined,
    })
    p.setIntent('play')
    p.play(firstTrack)
    window.dispatchEvent(new Event('af:play-intent'))
  }

  const getDurMs = (t: PlayerTrack) => {
    return p.durationById?.[t.id] ?? t.durationMs
  }

  const renderDur = (t: PlayerTrack) => {
    const ms = getDurMs(t) ?? 0
    return ms > 0 ? fmtTime(ms) : '—'
  }

  const shareCtx = deriveShareContext({
    albumSlug,
    album,
    queueArtist: p.queueContextArtist,
  })

  const [selectedTrackId, setSelectedTrackId] = React.useState<string | null>(null)

  const isCoarsePointer = (() => {
    if (typeof window === 'undefined') return false
    try {
      return window.matchMedia?.('(pointer: coarse)').matches ?? false
    } catch {
      return 'ontouchstart' in window
    }
  })()


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
      <div style={{display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 10}}>


        <div
          style={{
            width: 334,
            height: 334,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.14)',
            background: album?.artworkUrl
              ? `url(${album.artworkUrl}) center/cover no-repeat`
              : 'radial-gradient(120px 120px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))',
            boxShadow: '0 22px 60px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        />

        <div style={{fontSize: 22, fontWeight: 650, letterSpacing: 0.2, opacity: 0.96}}>{albumTitle}</div>
        <div style={{maxWidth: 540, fontSize: 12, opacity: 0.62, lineHeight: 1.45}}>{albumDesc}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginTop: 8}}>
          <IconCircleBtn label="Download" onClick={() => {}}>
            <DownloadIcon />
          </IconCircleBtn>

          <IconCircleBtn label="Save" onClick={() => {}}>
            <BookmarkIcon />
          </IconCircleBtn>

          {/* Big play button + patterned border ring */}
          <div style={{position: 'relative', width: 64, height: 64}}>
            <button
              type="button"
              onClick={canPlay && !playLock ? onTogglePlay : undefined}
              onMouseEnter={() => prefetchTrack(tracks[0])}
              onFocus={() => prefetchTrack(tracks[0])}
              disabled={!canPlay || playLock}
              aria-label={playingThisAlbum ? 'Pause' : 'Play'}
              title={playingThisAlbum ? 'Pause' : 'Play'}
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
                boxShadow: playingThisAlbum ? '0 18px 50px rgba(0,0,0,0.35)' : '0 18px 50px rgba(0,0,0,0.30)',
                transform: 'translateZ(0)',
                position: 'relative',
                zIndex: 2,
              }}
            >
              <PlayPauseBig playing={playingThisAlbum} />
            </button>

            {/* subtle visualizer ring */}
            <div style={{position: 'absolute', inset: -5, borderRadius: 999, zIndex: 1}}>
              <PatternRing size={74} thickness={7} opacity={0.45} seed={913} />
            </div>
          </div>

          <IconCircleBtn
            label="Share"
            onClick={() => {
              void shareAlbum(shareCtx)
            }}
          >
            <ShareIcon />
          </IconCircleBtn>

          <IconCircleBtn label="More" onClick={() => {}}>
            <MoreIcon />
          </IconCircleBtn>
        </div>

        {p.status === 'blocked' && p.lastError ? (
          <div style={{fontSize: 12, opacity: 0.75, marginTop: 4}}>Playback error</div>
        ) : null}
      </div>

      <div style={{marginTop: 18}}>
        <div style={{borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 14}}>
  {tracks.map((t, i) => {
    const isCur = p.current?.id === t.id
    const isSelected = selectedTrackId === t.id
    const isPending = p.pendingTrackId === t.id
    const shimmerTitle = isPending || (isCur && p.status === 'loading')

    const titleColor = isCur
      ? 'color-mix(in srgb, var(--accent) 72%, rgba(255,255,255,0.92))'
      : 'rgba(255,255,255,0.92)'

    const subColor = isCur
      ? 'color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.70))'
      : 'rgba(255,255,255,0.70)'

    const baseBg = isSelected ? 'rgba(255,255,255,0.14)' : 'transparent'
    const restBg = isCur && !isSelected ? 'transparent' : baseBg


    return (
      <button
        key={t.id}
        type="button"
        onMouseEnter={(e) => {
          prefetchTrack(t)
          // Hover styling (desktop only). Don't override selected/current.
          if (!isCoarsePointer && !isSelected && !isCur) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }
        }}
        onMouseLeave={(e) => {
          // Restore deterministic state bg
          e.currentTarget.style.background = restBg
        }}
        onFocus={() => prefetchTrack(t)}
        onClick={() => {
          // always keep queue context “armed” for this album
          p.setQueue(tracks, {
            contextId: album?.id,
            artworkUrl: album?.artworkUrl ?? null,
            contextSlug: props.albumSlug,
            contextTitle: album?.title ?? undefined,
            contextArtist: album?.artist ?? undefined,
          })

          // mobile (coarse pointer) = single tap plays
          if (isCoarsePointer) {
            p.setIntent('play')
            p.play(t)
            window.dispatchEvent(new Event('af:play-intent'))
            return
          }

          // desktop = single click selects only
          setSelectedTrackId(t.id)
        }}
        onDoubleClick={() => {
          // desktop double click = play
          if (isCoarsePointer) return
          p.setIntent('play')
          p.play(t)
          window.dispatchEvent(new Event('af:play-intent'))
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          void shareTrack(shareCtx, t)
        }}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '34px minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          padding: '12px 10px',
          borderRadius: 14,

          // Spotify-like: no borders
          border: '1px solid rgba(255,255,255,0.00)',

          // State background:
          // - current: transparent
          // - selected: solid-ish grey
          // - hover: applied transiently via mouse enter
          background: restBg,

          cursor: 'pointer',
          transform: 'translateZ(0)',
          transition: 'background 120ms ease',
        }}
      >
        <div
          style={{
            fontSize: 12,
            opacity: 0.9,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: subColor,
          }}
        >
          {isCur ? <NowPlayingPip /> : <span style={{width: 16, display: 'inline-block'}} />}
          <span>{i + 1}</span>
        </div>

        <div style={{minWidth: 0}}>
          <div
            className={shimmerTitle ? 'afShimmerText' : undefined}
            data-reason={isCur && p.status === 'loading' ? p.loadingReason ?? '' : ''}
            style={{
              fontSize: 13,
              opacity: 1,
              color: titleColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'opacity 160ms ease, color 160ms ease',
            }}
          >
            {t.title ?? t.id}
          </div>
        </div>

        <div style={{fontSize: 12, opacity: 0.85, color: subColor}}>{renderDur(t)}</div>
      </button>
    )
  })}
</div>


        {browseAlbums.length ? (
          <div style={{marginTop: 18}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12}}>
              <div style={{fontSize: 12, opacity: 0.7, marginBottom: 10}}>Browse albums</div>
              {isBrowsingAlbum ? <div style={{fontSize: 12, opacity: 0.55}}>Loading…</div> : null}
            </div>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12}}>
              {browseAlbums.map((a) => {
                const isActive = album?.id === a.id
                const disabled = !onSelectAlbum || isBrowsingAlbum || isActive

                return (
                  <button
  key={a.id}
  type="button"
  disabled={disabled}
  onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
    prefetchAlbumArt(a.coverUrl)
    if (disabled) return
    e.currentTarget.style.transform = 'translateZ(0) translateY(-1px)'
    e.currentTarget.style.boxShadow = '0 16px 38px rgba(0,0,0,0.22)'
  }}
  onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.transform = 'translateZ(0)'
    e.currentTarget.style.boxShadow = disabled ? 'none' : '0 14px 34px rgba(0,0,0,0.18)'
  }}
  onFocus={() => prefetchAlbumArt(a.coverUrl)}
  onClick={() => onSelectAlbum?.(a.slug)}
  style={{
    display: 'grid',
    gridTemplateRows: 'auto auto',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    border: 'none',
    background: isActive
      ? 'color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,0.05))'
      : 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.92)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    textAlign: 'center',
    boxShadow: disabled ? 'none' : '0 14px 34px rgba(0,0,0,0.18)',
    transform: 'translateZ(0)',
    transition:
      'transform 140ms ease, border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
  }}
>
  {/* full-width cover */}
  <div
    style={{
      width: '100%',
      aspectRatio: '1 / 1',
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.14)',
      background: a.coverUrl
        ? `url(${a.coverUrl}) center/cover no-repeat`
        : 'radial-gradient(60px 60px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
      overflow: 'hidden',
    }}
  />

  {/* title below */}
  <div style={{minWidth: 0}}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 650,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {a.title}
    </div>
    <div
      style={{
        marginTop: 4,
        fontSize: 12,
        opacity: 0.68,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {a.artist ?? ''}
    </div>
  </div>
</button>

                )
              })}
            </div>
          </div>
        ) : null}

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

      <style>{`
        @keyframes afShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .afShimmerText {
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.55) 0%,
            rgba(255,255,255,0.95) 45%,
            rgba(255,255,255,0.55) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: afShimmer 1.1s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .afShimmerText {
            animation: none;
            color: rgba(255,255,255,0.92);
            background: none;
          }
        }

                .afEq{
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: flex-end;
          gap: 2px;
          color: color-mix(in srgb, var(--accent) 72%, rgba(255,255,255,0.92));
        }
        .afEq i{
          display: block;
          width: 3px;
          height: 6px;
          background: currentColor;
          border-radius: 2px;
          animation: afEq 900ms ease-in-out infinite;
          opacity: 0.9;
        }
        .afEq i:nth-child(2){ animation-delay: 120ms; height: 10px; }
        .afEq i:nth-child(3){ animation-delay: 240ms; height: 8px; }

        @keyframes afEq{
          0%,100%{ transform: scaleY(0.55); }
          50%{ transform: scaleY(1.35); }
        }

        @media (prefers-reduced-motion: reduce){
          .afEq i{ animation: none; }
        }

      `}</style>
    </div>
  )
}
