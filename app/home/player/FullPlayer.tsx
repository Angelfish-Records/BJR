// web/app/home/player/FullPlayer.tsx
"use client";

import React from "react";
import { usePlayer } from "./PlayerState";
import type {
  AlbumInfo,
  AlbumNavItem,
  PlayerTrack,
  Tier,
  TierName,
} from "@/lib/types";
import { deriveShareContext, shareAlbum, shareTrack } from "./share";
import { PatternRingGlow } from "./VisualizerPattern";
import { replaceQuery } from "@/app/home/urlState";

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function tierRank(t: Tier): number {
  if (t === "partner") return 3;
  if (t === "patron") return 2;
  if (t === "friend") return 1;
  return 0;
}

function tierLabel(t: TierName): string {
  if (t === "friend") return "Friend+";
  if (t === "patron") return "Patron+";
  return "Partner+";
}

function IconCircleBtn(props: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  size?: number;
  children: React.ReactNode;
}) {
  const { label, onClick, disabled, size = 44, children } = props;
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
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.92)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 0.9,
        userSelect: "none",
        transform: "translateZ(0)",
      }}
    >
      {children}
    </button>
  );
}

function PlayPauseBig({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6.6" y="5" width="4.2" height="14" rx="1.3" />
      <rect x="13.2" y="5" width="4.2" height="14" rx="1.3" />
    </svg>
  ) : (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 11l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="2" height="12" />
      <polygon points="18,7 10,12 18,17" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="16" y="6" width="2" height="12" />
      <polygon points="6,7 14,12 6,17" />
    </svg>
  );
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
      <path
        d="M8.7 11.2l5-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.7 12.8l5 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NowPlayingPip() {
  return (
    <span className="afEq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

type AccessPayload = {
  ok?: boolean;
  allowed?: boolean;
  embargoed?: boolean;
  releaseAt?: string | null;
  code?: string | null;
  action?: string | null;
  reason?: string | null;
};

type StableView = {
  albumSlug: string;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
};

export default function FullPlayer(props: {
  albumSlug: string;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albums: AlbumNavItem[];
  onSelectAlbum?: (slug: string) => void;
  isBrowsingAlbum?: boolean;
  viewerTier?: Tier;
}) {
  const p = usePlayer();

  const pRef = React.useRef(p);
  React.useEffect(() => {
    pRef.current = p;
  }, [p]);

  const {
    albumSlug,
    album,
    tracks,
    albums,
    onSelectAlbum,
    isBrowsingAlbum = false,
    viewerTier = "none",
  } = props;

  // ---- optimistic UI cache (state, not ref) to satisfy react-hooks/refs lint ----
  const [stableView, setStableView] = React.useState<StableView | null>(null);

  React.useEffect(() => {
    if (album && tracks && tracks.length) {
      setStableView({ albumSlug, album, tracks });
    }
  }, [albumSlug, album, tracks]);

  const showCached = Boolean(
    isBrowsingAlbum && stableView?.album && (!album || !tracks?.length),
  );
  const effAlbumSlug = showCached ? stableView!.albumSlug : albumSlug;
  const effAlbum = showCached ? stableView!.album : album;
  const effTracks = showCached ? stableView!.tracks : tracks;

  const [pendingAlbumSlug, setPendingAlbumSlug] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    if (!isBrowsingAlbum) setPendingAlbumSlug(null);
  }, [isBrowsingAlbum]);

  const albumTitle = effAlbum?.title ?? "—";
  const albumDesc =
    effAlbum?.description ??
    "This is placeholder copy. Soon: pull album description from Sanity.";
  const browseAlbums = albums.filter((a) => a.id !== effAlbum?.id);

  const playingish = p.status === "playing" || p.status === "loading";

  const [access, setAccess] = React.useState<{
    forCatalogId: string;
    allowed: boolean;
    embargoed: boolean;
    releaseAt: string | null;
    code?: string;
    action?: string | null;
    reason?: string;
  } | null>(null);

  type AccessState = {
    forCatalogId: string;
    allowed: boolean;
    embargoed: boolean;
    releaseAt: string | null;
    code?: string;
    action?: string | null;
    reason?: string;
  };

  const accessCacheRef = React.useRef<Record<string, AccessState>>({});

  // ✅ use a single scalar for deps + narrowing
  const catalogId = effAlbum?.catalogId ?? null;

  // ✅ album-scoped view (prevents stale flash)
  const accessForAlbum =
    catalogId && access?.forCatalogId === catalogId ? access : null;

  // Canonical album key used in queue context + gating
  const albumKey = effAlbum?.catalogId ?? effAlbum?.id ?? null;

  // ✅ stable membership test without capturing effTracks inside the effect
  const effTrackIdSet = React.useMemo(
    () => new Set(effTracks.map((t) => t.id)),
    [effTracks],
  );

  React.useEffect(() => {
    if (!catalogId) return;

    // ✅ hydrate immediately from cache (prevents "embargo-looking" disabled flash)
    const cached = accessCacheRef.current[catalogId] ?? null;
    setAccess(cached);

    let cancelled = false;
    const ac = new AbortController();

    let st: string | null = null;
    try {
      const sp = new URLSearchParams(window.location.search);
      st = (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
    } catch {
      st = null;
    }

    const u = new URL("/api/access/check", window.location.origin);
    u.searchParams.set("albumId", catalogId);
    if (st) u.searchParams.set("st", st);
    (async () => {
      try {
        const r = await fetch(u.toString(), {
          method: "GET",
          signal: ac.signal,
        });
        const corr = r.headers.get("x-correlation-id") ?? null;
        const j = (await r.json()) as AccessPayload;
        if (cancelled) return;

        type BlockAction = "login" | "subscribe" | "buy" | "wait";
        const asBlockAction = (v: unknown): BlockAction | undefined =>
          v === "login" || v === "subscribe" || v === "buy" || v === "wait"
            ? v
            : undefined;

        const allowed = j?.allowed !== false;
        const embargoed = j?.embargoed === true;
        const releaseAt = (j?.releaseAt ?? null) as string | null;

        const code =
          typeof j?.code === "string" && j.code.trim() ? j.code : undefined;
        const action = asBlockAction(j?.action);
        const reason =
          typeof j?.reason === "string" && j.reason.trim()
            ? j.reason
            : undefined;

        const next: AccessState = {
          forCatalogId: catalogId,
          allowed,
          embargoed,
          releaseAt,
          code,
          action: action ?? null,
          reason,
        };

        // ✅ write-through cache
        accessCacheRef.current[catalogId] = next;
        setAccess(next);

        const player = pRef.current;

        if (!allowed) {
          const cur = player.current;
          const curInThisAlbum = Boolean(cur?.id && effTrackIdSet.has(cur.id));
          const queueIsThisAlbum = Boolean(
            albumKey && player.queueContextId === albumKey,
          );
          const pendingInThisAlbum = Boolean(
            player.pendingTrackId && effTrackIdSet.has(player.pendingTrackId),
          );

          if (curInThisAlbum || queueIsThisAlbum || pendingInThisAlbum) {
            player.setBlocked(reason ?? "Playback blocked.", {
              code,
              action,
              correlationId: corr,
            });
          }
        } else {
          if (
            player.lastError ||
            player.blockedCode ||
            player.blockedAction ||
            player.status === "blocked"
          ) {
            player.clearError();
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("FullPlayer access check failed", e);

        const fallback: AccessState = {
          forCatalogId: catalogId,
          allowed: true,
          embargoed: false,
          releaseAt: null,
          code: "ACCESS_CHECK_ERROR",
          action: null,
          reason: "Access check failed (client).",
        };

        // ✅ cache fallback too (optional, but prevents repeated flicker on flaky nets)
        accessCacheRef.current[catalogId] = fallback;
        setAccess(fallback);

        const player = pRef.current;
        if (player.lastError || player.blockedCode || player.blockedAction)
          player.clearError();
        if (player.status === "blocked") player.setStatusExternal("idle");
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [catalogId, albumKey, effTrackIdSet]);

  // ✅ “unknown access” disables play/glow until check resolves (prevents stale UI)
  const canPlay =
    effTracks.length > 0 &&
    accessForAlbum?.allowed !== false &&
    accessForAlbum !== null;

  const emb = effAlbum?.embargo;
  const releaseAtMs = emb?.releaseAt ? Date.parse(emb.releaseAt) : NaN;
  const showEmbargo = Boolean(emb?.embargoed && Number.isFinite(releaseAtMs));

  const isThisAlbumActive = Boolean(albumKey && p.queueContextId === albumKey);
  const playingThisAlbum = playingish && isThisAlbumActive;

  const [playLock, setPlayLock] = React.useState(false);
  const lockPlayFor = (ms: number) => {
    setPlayLock(true);
    window.setTimeout(() => setPlayLock(false), ms);
  };

  const [transportLock, setTransportLock] = React.useState(false);
  const lockTransportFor = (ms: number) => {
    setTransportLock(true);
    window.setTimeout(() => setTransportLock(false), ms);
  };

  const prefetchTrack = (t?: PlayerTrack) => {
    const playbackId = t?.muxPlaybackId;
    if (!playbackId) return;
    window.dispatchEvent(
      new CustomEvent("af:prefetch-token", { detail: { playbackId } }),
    );
  };

  const prefetchAlbumArt = (url?: string | null) => {
    if (!url) return;
    try {
      const img = new Image();
      img.src = url;
    } catch {}
  };

  const onTogglePlay = () => {
    lockPlayFor(120);
    if (!canPlay) return;

    if (playingThisAlbum) {
      window.dispatchEvent(new Event("af:pause-intent"));
      p.pause();
      return;
    }

    const firstTrack = effTracks[0];
    if (!firstTrack) return;

    p.setQueue(effTracks, {
      contextId: albumKey ?? undefined,
      artworkUrl: effAlbum?.artworkUrl ?? null,
      contextSlug: effAlbumSlug,
      contextTitle: effAlbum?.title ?? undefined,
      contextArtist: effAlbum?.artist ?? undefined,
    });

    p.play(firstTrack);
    window.dispatchEvent(new Event("af:play-intent"));
  };

  const getDurMs = (t: PlayerTrack) => p.durationById?.[t.id] ?? t.durationMs;
  const renderDur = (t: PlayerTrack) => {
    const ms = getDurMs(t) ?? 0;
    return ms > 0 ? fmtTime(ms) : "—";
  };

  const shareCtx = deriveShareContext({
    albumSlug: effAlbumSlug,
    album: effAlbum,
    queueArtist: p.queueContextArtist,
    albumId: albumKey ?? undefined,
  });

  const [selectedTrackId, setSelectedTrackId] = React.useState<string | null>(
    null,
  );

  const isCoarsePointer = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.matchMedia?.("(pointer: coarse)").matches ?? false;
    } catch {
      return "ontouchstart" in window;
    }
  })();

  // --- Album-local transport (FullPlayer) ---
  // Only operate within effTracks. Never call p.prev()/p.next() here.

  const curId = p.current?.id ?? "";
  const albumIdx = curId ? effTracks.findIndex((t) => t.id === curId) : -1;
  const albumHasCurrent = albumIdx >= 0;

  const albumAtStart = albumHasCurrent ? albumIdx === 0 : true;
  const albumAtEnd = albumHasCurrent ? albumIdx === effTracks.length - 1 : true;

  // Disable album transport if this album isn't the active playback context.
  const prevDisabled = transportLock || !albumHasCurrent || albumAtStart;
  const nextDisabled = transportLock || !albumHasCurrent || albumAtEnd;

  function ensureAlbumQueue() {
    // If we're already in this album context with the right queue, this is cheap + idempotent.
    p.setQueue(effTracks, {
      contextId: albumKey ?? undefined,
      artworkUrl: effAlbum?.artworkUrl ?? null,
      contextSlug: effAlbumSlug,
      contextTitle: effAlbum?.title ?? undefined,
      contextArtist: effAlbum?.artist ?? undefined,
    });
  }

  function playAlbumIndex(i: number) {
    const t = effTracks[i];
    if (!t) return;
    ensureAlbumQueue();
    p.play(t);
    window.dispatchEvent(new Event("af:play-intent"));
  }

  const gotoDownload = () => {
    const patch: Record<string, string | null | undefined> = {
      p: "download",
      // keep album pinned if we can
      album: effAlbumSlug,
      track: null,
      t: null,
    };
    replaceQuery(patch);
  };

  return (
    <div
      style={{
        minWidth: 0,
        width: "100%",
        maxWidth: 760,
        margin: "0 auto",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "grid",
          justifyItems: "center",
          textAlign: "center",
          gap: 10,
          padding: 18, // was on the removed parent card
        }}
      >
        <div
          style={{
            width: "min(334px, 86vw)",
            height: "min(334px, 86vw)",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.14)",
            background: effAlbum?.artworkUrl
              ? `url(${effAlbum.artworkUrl}) center/cover no-repeat`
              : "radial-gradient(120px 120px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))",
            boxShadow: "0 22px 60px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        />

        <div
          style={{
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 800,
            lineHeight: 1.45,
            letterSpacing: "-0.3px",
            color: "#fff",
            marginBottom: 2,
          }}
        >
          {albumTitle}
        </div>
        <div
          style={{
            maxWidth: 540,
            fontSize: 12,
            opacity: 0.62,
            lineHeight: 1.45,
          }}
        >
          {albumDesc}
        </div>

        {showEmbargo ? (
          <div
            role="note"
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.22)",
              boxShadow: "0 10px 34px rgba(0,0,0,0.28)",
              maxWidth: 560,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 650,
                letterSpacing: 0.2,
                opacity: 0.95,
              }}
            >
              Embargoed until{" "}
              {new Date(releaseAtMs).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                opacity: 0.78,
                lineHeight: 1.35,
              }}
            >
              {effAlbum?.embargo?.note?.trim()
                ? effAlbum.embargo.note.trim()
                : "Playback disabled while this release is under embargo. Patrons have instant early access."}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
          }}
        >
          <IconCircleBtn label="Download" onClick={gotoDownload}>
            <DownloadIcon />
          </IconCircleBtn>

          <IconCircleBtn
            label="Previous"
            disabled={prevDisabled}
            onClick={() => {
              lockTransportFor(350);
              if (prevDisabled) return;
              playAlbumIndex(albumIdx - 1);
            }}
          >
            <PrevIcon />
          </IconCircleBtn>

          <div style={{ position: "relative", width: 64, height: 64 }}>
            <button
              type="button"
              onClick={canPlay && !playLock ? onTogglePlay : undefined}
              onMouseEnter={() => prefetchTrack(effTracks[0])}
              onFocus={() => prefetchTrack(effTracks[0])}
              disabled={!canPlay || playLock}
              aria-label={playingThisAlbum ? "Pause" : "Play"}
              title={playingThisAlbum ? "Pause" : "Play"}
              style={{
                width: 64,
                height: 64,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(245,245,245,0.95)",
                color: "rgba(0,0,0,0.92)",
                display: "grid",
                placeItems: "center",
                cursor: canPlay ? "pointer" : "default",
                opacity: canPlay ? 1 : 0.55,
                boxShadow: playingThisAlbum
                  ? "0 18px 50px rgba(0,0,0,0.35)"
                  : "0 18px 50px rgba(0,0,0,0.30)",
                transform: "translateZ(0)",
                position: "relative",
                zIndex: 2,
              }}
            >
              <PlayPauseBig playing={playingThisAlbum} />
            </button>

            {canPlay ? (
              <div
                style={{
                  position: "absolute",
                  inset: -5,
                  zIndex: 1,
                  pointerEvents: "none",
                  overflow: "visible",
                  isolation: "isolate",
                  transform: "translateZ(0)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <PatternRingGlow
                  size={64}
                  ringPx={1}
                  glowPx={2}
                  blurPx={4}
                  opacity={0.45}
                  seed={913}
                />
              </div>
            ) : null}
          </div>

          <IconCircleBtn
            label="Next"
            disabled={nextDisabled}
            onClick={() => {
              lockTransportFor(350);
              if (nextDisabled) return;
              playAlbumIndex(albumIdx + 1);
            }}
          >
            <NextIcon />
          </IconCircleBtn>

          <IconCircleBtn
            label="Share"
            onClick={() => {
              void shareAlbum(shareCtx);
            }}
          >
            <ShareIcon />
          </IconCircleBtn>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: "0 18px 18px" }}>
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.10)",
            paddingTop: 14,
          }}
        >
          {effTracks.map((t, i) => {
            const isCur = p.current?.id === t.id;
            const isSelected = selectedTrackId === t.id;
            const isPending = p.pendingTrackId === t.id;

            const shimmerTitle = isPending || (isCur && p.status === "loading");
            const isNowPlaying =
              isCur &&
              (p.status === "playing" ||
                p.status === "loading" ||
                p.intent === "play");

            const titleColor = !canPlay
              ? "rgba(255,255,255,0.38)"
              : isCur
                ? "var(--accent)"
                : "rgba(255,255,255,0.92)";

            const subColor = !canPlay
              ? "rgba(255,255,255,0.32)"
              : isCur
                ? "color-mix(in srgb, var(--accent) 70%, rgba(255,255,255,0.70))"
                : "rgba(255,255,255,0.70)";

            const baseBg = isSelected
              ? "rgba(255,255,255,0.14)"
              : "transparent";
            const restBg = isCur && !isSelected ? "transparent" : baseBg;

            const isFirst = i === 0;
            const isLast = i === effTracks.length - 1;
            const rowRadius = isFirst
              ? "14px 14px 0 0"
              : isLast
                ? "0 0 14px 14px"
                : "0";

            return (
              <button
                key={t.id}
                type="button"
                className="afTrackRow"
                onMouseEnter={(e) => {
                  prefetchTrack(t);
                  if (!canPlay) return;
                  if (!isCoarsePointer && !isSelected)
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = restBg;
                }}
                onFocus={() => prefetchTrack(t)}
                onClick={() => {
                  if (!canPlay) return;
                  p.setQueue(effTracks, {
                    contextId: albumKey ?? undefined,
                    artworkUrl: effAlbum?.artworkUrl ?? null,
                    contextSlug: effAlbumSlug,
                    contextTitle: effAlbum?.title ?? undefined,
                    contextArtist: effAlbum?.artist ?? undefined,
                  });

                  if (isCoarsePointer) {
                    p.play(t);
                    window.dispatchEvent(new Event("af:play-intent"));
                    return;
                  }

                  setSelectedTrackId(t.id);
                }}
                onDoubleClick={() => {
                  if (isCoarsePointer) return;
                  if (!canPlay) return;
                  p.play(t);
                  window.dispatchEvent(new Event("af:play-intent"));
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void shareTrack(shareCtx, t);
                }}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "44px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  padding: "10px 10px",
                  borderRadius: rowRadius,
                  border: "1px solid rgba(255,255,255,0.00)",
                  background: restBg,
                  cursor: canPlay ? "pointer" : "default",
                  transform: "translateZ(0)",
                  transition: "background 120ms ease",
                  opacity: canPlay ? 1 : 0.75,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.9,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: subColor,
                    paddingLeft: 12,
                    justifyContent: "flex-start",
                  }}
                >
                  {isNowPlaying ? (
                    <NowPlayingPip />
                  ) : (
                    <span
                      style={{
                        width: 16,
                        display: "inline-grid",
                        placeItems: "center",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>

                <div className="afRowMid" style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      fontSize: 13,
                      opacity: 1,
                      color: titleColor,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      transition: "opacity 160ms ease, color 160ms ease",
                    }}
                    data-reason={
                      isCur && p.status === "loading"
                        ? (p.loadingReason ?? "")
                        : ""
                    }
                  >
                    <span
                      className={shimmerTitle ? "afShimmerText" : undefined}
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {t.title ?? t.id}
                    </span>

                    {t.explicit ? (
                      <span
                        className="afExplicitBadge"
                        aria-label="Explicit"
                        title="Explicit"
                      >
                        E
                      </span>
                    ) : null}
                  </div>

                  <div className="afRowDurUnder" aria-hidden="true">
                    {renderDur(t)}
                  </div>
                </div>

                <div
                  style={{
                    justifySelf: "end",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: subColor,
                  }}
                >
                  <button
                    type="button"
                    className="afRowShare"
                    aria-label="Share track"
                    title="Share"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void shareTrack(shareCtx, t);
                    }}
                    style={{
                      border: 0,
                      background: "transparent",
                      padding: 6,
                      borderRadius: 999,
                      color: "rgba(255,255,255,0.80)",
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      lineHeight: 0,
                    }}
                  >
                    <ShareIcon />
                  </button>

                  <div
                    className="afRowDurRight"
                    style={{ fontSize: 12, opacity: 0.85, color: subColor }}
                  >
                    {renderDur(t)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {browseAlbums.length ? (
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: "clamp(20px, 3vw, 28px)",
                  fontWeight: 600,
                  lineHeight: 1.05,
                  letterSpacing: "-0.3px",
                  color: "#fff",
                  marginBottom: 10,
                }}
              >
                More releases
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              {browseAlbums.map((a) => {
                const isActive = effAlbum?.id === a.id;
                const min = a.policy?.minTierToLoad ?? null;
                const canLoadByTier =
                  !min || tierRank(viewerTier) >= tierRank(min);
                const disabled =
                  !onSelectAlbum ||
                  isBrowsingAlbum ||
                  isActive ||
                  !canLoadByTier;
                const isPendingPick =
                  isBrowsingAlbum && pendingAlbumSlug === a.slug;

                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onMouseEnter={(e) => {
                      prefetchAlbumArt(a.coverUrl);
                      if (disabled) return;
                      e.currentTarget.style.transform =
                        "translateZ(0) translateY(-1px)";
                      e.currentTarget.style.boxShadow =
                        "0 16px 38px rgba(0,0,0,0.22)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateZ(0)";
                      e.currentTarget.style.boxShadow = disabled
                        ? "none"
                        : "0 14px 34px rgba(0,0,0,0.18)";
                    }}
                    onFocus={() => prefetchAlbumArt(a.coverUrl)}
                    onClick={() => {
                      setPendingAlbumSlug(a.slug);
                      onSelectAlbum?.(a.slug);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateRows: "auto auto",
                      gap: 10,
                      padding: 12,
                      borderRadius: 16,
                      border: "none",
                      background: isActive
                        ? "color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,0.05))"
                        : "rgba(255,255,255,0.03)",
                      color: "rgba(255,255,255,0.92)",
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.72 : 1,
                      textAlign: "center",
                      boxShadow: disabled
                        ? "none"
                        : "0 14px 34px rgba(0,0,0,0.18)",
                      transform: "translateZ(0)",
                      transition:
                        "transform 140ms ease, border-color 140ms ease, background 140ms ease, box-shadow 140ms ease",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: a.coverUrl
                          ? `url(${a.coverUrl}) center/cover no-repeat`
                          : "radial-gradient(60px 60px at 30% 20%, rgba(255,255,255,0.14), rgba(255,255,255,0.02))",
                        boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
                        overflow: "hidden",
                      }}
                    >
                      {isPendingPick ? (
                        <div
                          aria-hidden="true"
                          className="afShimmerBlock"
                          style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 14,
                            pointerEvents: "none",
                            opacity: 0.95,
                          }}
                        />
                      ) : null}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 650,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.title}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          opacity: 0.68,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {a.artist ?? ""}
                      </div>

                      {!canLoadByTier && min ? (
                        <div
                          style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}
                        >
                          Requires {tierLabel(min)}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {p.lastError ? (
          <div
            style={{
              marginTop: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.22)",
              padding: "10px 12px",
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

        .afShimmerBlock{
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0.06) 0%,
            rgba(255,255,255,0.16) 45%,
            rgba(255,255,255,0.06) 100%
          );
          background-size: 200% 100%;
          animation: afShimmer 1.05s linear infinite;
          mix-blend-mode: screen;
        }
        @media (prefers-reduced-motion: reduce) {
          .afShimmerBlock { animation: none; }
        }

        .afEq{
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: flex-end;
          gap: 2px;
          color: color-mix(in srgb, var(--accent) 72%, rgba(255,255,255,0.92));
          transform: translateY(-2px);
        }
        .afEq i{
  display: block;
  width: 3px;
  height: 6px;
  background: currentColor;
  border-radius: 2px;
  transform-origin: 50% 100%;
  opacity: 0.9;
  will-change: transform;
  animation: afEq1 920ms linear infinite;
}

.afEq i:nth-child(2){
  height: 10px;
  animation: afEq2 780ms linear infinite;
}

.afEq i:nth-child(3){
  height: 8px;
  animation: afEq3 1040ms linear infinite;
}

@keyframes afEq1{
  0%{transform:scaleY(.40)}
  18%{transform:scaleY(1.10)}
  43%{transform:scaleY(.55)}
  62%{transform:scaleY(1.35)}
  100%{transform:scaleY(.45)}
}
@keyframes afEq2{
  0%{transform:scaleY(.55)}
  22%{transform:scaleY(1.35)}
  50%{transform:scaleY(.45)}
  74%{transform:scaleY(1.05)}
  100%{transform:scaleY(.60)}
}
@keyframes afEq3{
  0%{transform:scaleY(.35)}
  28%{transform:scaleY(1.25)}
  46%{transform:scaleY(.50)}
  68%{transform:scaleY(1.10)}
  100%{transform:scaleY(.40)}
}

.afExplicitBadge{
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  display: inline-grid;
  place-items: center;
  border-radius: 4px;
  border: none;
  background: rgba(255, 255, 255, 0.31);
  color: rgba(0,0,0,0.92);
  font-size: 7px;
  font-weight: 750;
  line-height: 1;
  letter-spacing: 0.2px;
  transform: translateY(-1px);
  user-select: none;
}

        @media (prefers-reduced-motion: reduce){
          .afEq i{ animation: none; }
        }

        .afTrackRow .afRowShare{
          opacity: 0;
          pointer-events: none;
          transform: translateX(2px);
          transition: opacity 120ms ease, transform 120ms ease;
        }

        .afTrackRow:hover .afRowShare{
          opacity: 0.95;
          pointer-events: auto;
          transform: translateX(0);
        }

        .afRowDurUnder{
          display: none;
          margin-top: 4px;
          font-size: 12px;
          opacity: 0.65;
          color: rgba(255,255,255,0.70);
          line-height: 1.1;
        }

        @media (max-width: 520px){
          .afRowDurUnder{ display: block; }
          .afRowDurRight{ display: none; }
          .afTrackRow .afRowShare{
            opacity: 0.95;
            pointer-events: auto;
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
