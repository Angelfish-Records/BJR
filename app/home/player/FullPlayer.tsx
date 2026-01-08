// web/app/home/player/FullPlayer.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from './PlayerState'

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
      <path
        d="M8 11l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export default function FullPlayer(props: {
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  onSelectAlbum?: (slug: string) => void
  isBrowsingAlbum?: boolean
}) {
  const p = usePlayer()
  const {album, tracks, albums, onSelectAlbum, isBrowsingAlbum = false} = props

  const albumArtist = album?.artist ?? '—'
  const albumTitle = album?.title ?? '—'
  const albumMeta = album?.year ? `Album · ${album.year}` : 'Album'
  const albumDesc =
    album?.description ?? 'This is placeholder copy. Soon: pull album description from Sanity.'
  const browseAlbums = albums.filter((a) => a.id !== album?.id)

  const playing = p.status === 'playing'
  // This album is “the playback context” if it set the current queue.
const isThisAlbumActive = Boolean(album?.id && p.queueContextId === album.id)

// If you want an extra fallback (useful while you’re still wiring IDs), you can also treat it as active
// if the current track id exists in the browsed album's track list:
const currentIsInBrowsedAlbum = Boolean(p.current && tracks.some(t => t.id === p.current!.id))

const playingThisAlbum = playing && (isThisAlbumActive || currentIsInBrowsedAlbum)
  const canPlay = tracks.length > 0

  const onTogglePlay = () => {
  // If THIS album is the active one and it’s playing, pause.
  if (playingThisAlbum) {
    window.dispatchEvent(new Event('af:pause-intent'))
    p.pause()
    return
  }

  // Otherwise: explicit context switch to THIS album, then play.
  const firstTrack = tracks[0] ?? p.queue[0] ?? p.current
  if (!firstTrack) return

  p.setQueue(tracks, {contextId: album?.id})   // NEW: claim playback context for this album
  p.play(firstTrack)
  window.dispatchEvent(new Event('af:play-intent'))
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
      <div style={{display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 10}}>
        <div style={{fontSize: 12, opacity: 0.75}}>{albumArtist}</div>

        <div
  style={{
    width: 210,
    height: 210,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.14)',
    background: album?.artworkUrl
      ? `url(${album.artworkUrl}) center/cover no-repeat`
      : 'radial-gradient(120px 120px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))',
    boxShadow: '0 22px 60px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  }}
/>


        <div style={{fontSize: 22, fontWeight: 650, letterSpacing: 0.2, opacity: 0.96}}>
          {albumTitle}
        </div>
        <div style={{fontSize: 12, opacity: 0.7}}>{albumMeta}</div>

        <div style={{maxWidth: 540, fontSize: 12, opacity: 0.62, lineHeight: 1.45}}>
          {albumDesc}
        </div>

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
              boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
            }}
          >
            <PlayPauseBig playing={playingThisAlbum} />
          </button>

          <IconCircleBtn label="Share" onClick={() => {}}>
            <ShareIcon />
          </IconCircleBtn>

          <IconCircleBtn label="More" onClick={() => {}}>
            <MoreIcon />
          </IconCircleBtn>
        </div>
      </div>

      {/* Tracklist (BROWSED album) */}
      <div style={{marginTop: 18}}>
        <div style={{borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 14}}>
          {tracks.map((t, i) => {
            const isCur = p.current?.id === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  // Explicit playback change: this is allowed.
                  p.setQueue(tracks, {contextId: album?.id})
                  p.play(t)
                  window.dispatchEvent(new Event('af:play-intent'))

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
                    {isCur ? (p.status === 'playing' ? 'Now playing' : 'Selected') : ''}
                  </div>
                </div>
                <div style={{fontSize: 12, opacity: 0.7}}>{fmtTime(t.durationMs ?? 0)}</div>
              </button>
            )
          })}
        </div>

        {/* Album selector (INLINE browse; no navigation) */}
        {albums.length ? (
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
                    onClick={() => onSelectAlbum?.(a.slug)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '56px minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'center',
                      padding: 12,
                      borderRadius: 14,
                      border: isActive ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.10)',
                      background: isActive ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                      textDecoration: 'none',
                      color: 'rgba(255,255,255,0.92)',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.75 : 1,
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: a.coverUrl
                          ? `url(${a.coverUrl}) center/cover no-repeat`
                          : 'radial-gradient(40px 40px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))',
                      }}
                    />
                    <div style={{minWidth: 0}}>
                      <div style={{fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                        {a.title}
                      </div>
                      <div style={{fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
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
    </div>
  )
}
