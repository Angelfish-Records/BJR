"use client";

import React from "react";
import type { PlayerTrack } from "@/lib/types";

type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "blocked";
type RepeatMode = "off" | "one" | "all";
type Intent = "play" | "pause" | null;
type LoadingReason = "token" | "attach" | "buffering" | undefined;

export type BlockUiMode = "none" | "inline" | "global";
export type BlockAction = "login" | "subscribe" | "buy" | "wait";

export type BlockCode =
  | "AUTH_REQUIRED"
  | "ANON_CAP_REACHED"
  | "ENTITLEMENT_REQUIRED"
  | "EMBARGO"
  | "TIER_REQUIRED"
  | "INVALID_REQUEST"
  | "PROVISIONING"
  | "CAP_REACHED";

export type QueueContext = {
  contextId?: string;
  contextSlug?: string;
  contextTitle?: string;
  contextArtist?: string;
  artworkUrl?: string | null;
};

export type PlayerState = {
  status: PlayerStatus;
  current?: PlayerTrack;
  queue: PlayerTrack[];
  lastError?: string;

  queueContextId?: string;
  queueContextSlug?: string;
  queueContextTitle?: string;
  queueContextArtist?: string;
  queueContextArtworkUrl?: string | null;

  intent: Intent;
  intentAtMs?: number;
  selectedTrackId?: string;
  pendingTrackId?: string;

  pendingSeekMs?: number;
  seeking: boolean;

  loadingReason?: LoadingReason;
  reloadNonce: number;

  positionMs: number;
  seekNonce: number;

  volume: number;
  muted: boolean;
  repeat: RepeatMode;

  durationById: Record<string, number>;

  blockedCode?: string;
  blockedAction?: BlockAction;
  blockedCorrelationId?: string | null;
};

type PlayerDerivedUX = {
  // NEW: expose derived UI mode so PortalArea can reason about spotlight cleanly
  blockUiMode: BlockUiMode;
  shouldBlur: boolean;
  shouldShowTopbarBlockMessage: boolean;
};

type PlayerActions = {
  play: (track?: PlayerTrack) => void;
  pause: () => void;
  next: () => void;
  prev: () => void;

  setQueue: (tracks: PlayerTrack[], opts?: QueueContext) => void;
  enqueue: (track: PlayerTrack) => void;
  clearQueue: () => void;

  setPositionMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;

  setStatusExternal: (s: PlayerStatus) => void;
  setLoadingReasonExternal: (r?: LoadingReason) => void;

  setIntent: (i: Intent) => void;
  clearIntent: () => void;
  selectTrack: (id?: string) => void;
  setPendingTrackId: (id?: string) => void;
  resolvePendingTrack: (id: string) => void;

  seek: (ms: number) => void;
  clearPendingSeek: () => void;

  setVolume: (v: number) => void;
  toggleMute: () => void;

  cycleRepeat: () => void;
  tick: (deltaMs: number) => void;

  setBlocked: (
    reason?: string,
    meta?: {
      code?: string;
      action?: BlockAction;
      correlationId?: string | null;
    },
  ) => void;

  clearBlocked: () => void;
  clearError: () => void;
  bumpReload: () => void;
};

const PlayerCtx = React.createContext<
  (PlayerState & PlayerActions & PlayerDerivedUX) | null
>(null);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nextRepeat(r: RepeatMode): RepeatMode {
  if (r === "off") return "all";
  if (r === "all") return "one";
  return "off";
}

function hydrateTrack(
  t: PlayerTrack,
  durationById: Record<string, number>,
): PlayerTrack {
  const cached = durationById[t.id];
  if (!cached || cached <= 0) return t;
  if (t.durationMs === cached) return t;
  return { ...t, durationMs: cached };
}

function hydrateTracks(
  ts: PlayerTrack[],
  durationById: Record<string, number>,
) {
  let changed = false;
  const next = ts.map((t) => {
    const ht = hydrateTrack(t, durationById);
    if (ht !== t) changed = true;
    return ht;
  });
  return changed ? next : ts;
}

function primeDurationById(
  prev: Record<string, number>,
  tracks: PlayerTrack[],
): Record<string, number> {
  let next = prev;
  for (const t of tracks) {
    if (!t?.id) continue;
    const ms = t.durationMs;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) continue;
    if (typeof next[t.id] === "number" && next[t.id] > 0) continue;
    if (next === prev) next = { ...prev };
    next[t.id] = ms;
  }
  return next;
}

function normalizeBlockCode(raw: string | null | undefined): BlockCode | null {
  const c = (raw ?? "").trim();
  if (!c) return null;
  switch (c) {
    case "AUTH_REQUIRED":
    case "ANON_CAP_REACHED":
    case "ENTITLEMENT_REQUIRED":
    case "EMBARGO":
    case "TIER_REQUIRED":
    case "INVALID_REQUEST":
    case "PROVISIONING":
    case "CAP_REACHED":
      return c;
    default:
      return null;
  }
}

function uiModeForBlockedCode(code: BlockCode | null): BlockUiMode {
  // Policy:
  // - EMBARGO: inline only
  // - TIER_REQUIRED: inline only (never full-page)
  if (code === "EMBARGO" || code === "TIER_REQUIRED") return "inline";

  // All other blocked codes are allowed to be "global" candidates.
  // PortalArea will still restrict spotlight to signed-out + allowlist.
  return "global";
}

export function PlayerStateProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PlayerState>({
    status: "idle",
    current: undefined,
    queue: [],
    lastError: undefined,

    queueContextId: undefined,
    queueContextSlug: undefined,
    queueContextTitle: undefined,
    queueContextArtist: undefined,
    queueContextArtworkUrl: null,

    intent: null,
    intentAtMs: undefined,
    selectedTrackId: undefined,
    pendingTrackId: undefined,

    pendingSeekMs: undefined,
    seeking: false,

    loadingReason: undefined,
    reloadNonce: 0,

    positionMs: 0,
    seekNonce: 0,

    volume: 0.9,
    muted: false,
    repeat: "off",

    durationById: {},

    blockedCode: undefined,
    blockedAction: undefined,
    blockedCorrelationId: null,
  });

  const api: PlayerState & PlayerActions & PlayerDerivedUX =
    React.useMemo(() => {
      // ✅ keep normalization AND use it
      const code = normalizeBlockCode(state.blockedCode ?? null);
      const blockUiMode: BlockUiMode =
        state.status === "blocked" ? uiModeForBlockedCode(code) : "none";

      const shouldBlur = state.status === "blocked" && blockUiMode === "global";
      const shouldShowTopbarBlockMessage =
        state.status === "blocked" && blockUiMode !== "none";

      return {
        ...state,

        // derived UX
        blockUiMode,
        shouldBlur,
        shouldShowTopbarBlockMessage,

        setIntent: (i: Intent) =>
          setState((s) => ({
            ...s,
            intent: i,
            intentAtMs: i ? Date.now() : undefined,
          })),

        clearIntent: () =>
          setState((s) =>
            s.intent ? { ...s, intent: null, intentAtMs: undefined } : s,
          ),

        selectTrack: (id?: string) =>
          setState((s) => ({
            ...s,
            selectedTrackId: id,
          })),

        setPendingTrackId: (id?: string) =>
          setState((s) => ({
            ...s,
            pendingTrackId: id,
          })),

        resolvePendingTrack: (id: string) =>
          setState((s) => {
            if (s.pendingTrackId !== id) return s;
            return { ...s, pendingTrackId: undefined };
          }),

        play: (track?: PlayerTrack) => {
          setState((s) => {
            const rawNext = track ?? s.current ?? s.queue[0];
            if (!rawNext) {
              return {
                ...s,
                status: "idle",
                current: undefined,
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                lastError: undefined,
                loadingReason: undefined,
                pendingTrackId: undefined,
              };
            }

            const nextTrack = hydrateTrack(rawNext, s.durationById);
            const sameTrack = Boolean(
              s.current && s.current.id === nextTrack.id,
            );

            const base = {
              ...s,
              intent: "play" as const,
              intentAtMs: Date.now(),
              lastError: undefined,
              selectedTrackId: nextTrack.id,
              pendingTrackId: nextTrack.id,
            };

            if (sameTrack && s.status === "paused") {
              return {
                ...base,
                current: hydrateTrack(s.current!, s.durationById),
                status: "paused",
                loadingReason: undefined,
              };
            }

            if (
              sameTrack &&
              (s.status === "playing" || s.status === "loading")
            ) {
              return { ...base, loadingReason: s.loadingReason };
            }

            return {
              ...base,
              current: nextTrack,
              status: "loading",
              loadingReason: "token",
              positionMs: 0,
            };
          });
        },

        pause: () =>
          setState((s) => ({
            ...s,
            intent: "pause",
            intentAtMs: Date.now(),
          })),

        next: () => {
          setState((s) => {
            const cur = s.current;
            if (!cur || s.queue.length === 0) return s;

            const idx = s.queue.findIndex((t) => t.id === cur.id);
            const at = idx >= 0 ? idx : 0;

            if (s.repeat === "one") {
              return {
                ...s,
                status: "loading",
                loadingReason: "attach",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: cur.id,
                selectedTrackId: cur.id,
              };
            }

            const nextIdx = at + 1;
            if (nextIdx < s.queue.length) {
              const t = hydrateTrack(s.queue[nextIdx], s.durationById);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: t.id,
                selectedTrackId: t.id,
              };
            }

            if (s.repeat === "all" && s.queue.length > 0) {
              const t = hydrateTrack(s.queue[0], s.durationById);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: t.id,
                selectedTrackId: t.id,
              };
            }

            return {
              ...s,
              status: "paused",
              intent: "pause",
              intentAtMs: Date.now(),
              positionMs: 0,
              pendingSeekMs: 0,
              seeking: true,
              seekNonce: s.seekNonce + 1,
              loadingReason: undefined,
              pendingTrackId: undefined,
            };
          });
        },

        prev: () => {
          setState((s) => {
            const cur = s.current;
            if (!cur || s.queue.length === 0) return s;

            if (s.status === "playing" && s.positionMs > 3000) {
              return {
                ...s,
                positionMs: 0,
                status: "loading",
                loadingReason: "attach",
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: cur.id,
                selectedTrackId: cur.id,
              };
            }

            const idx = s.queue.findIndex((t) => t.id === cur.id);
            const at = idx >= 0 ? idx : 0;
            const prevIdx = at - 1;

            if (prevIdx >= 0) {
              const t = hydrateTrack(s.queue[prevIdx], s.durationById);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: t.id,
                selectedTrackId: t.id,
              };
            }

            if (s.repeat === "all" && s.queue.length > 0) {
              const t = hydrateTrack(
                s.queue[s.queue.length - 1],
                s.durationById,
              );
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingTrackId: t.id,
                selectedTrackId: t.id,
              };
            }

            return {
              ...s,
              positionMs: 0,
              status: "loading",
              loadingReason: "attach",
              intent: "play",
              intentAtMs: Date.now(),
              pendingTrackId: cur.id,
              selectedTrackId: cur.id,
            };
          });
        },

        setQueue: (tracks: PlayerTrack[], opts?: QueueContext) =>
          setState((s) => {
            const nextDurationById = primeDurationById(s.durationById, tracks);
            const hydratedQueue = hydrateTracks(tracks, nextDurationById);

            const nextCurrentRaw = s.current ?? hydratedQueue[0];
            const nextCurrent = nextCurrentRaw
              ? hydrateTrack(nextCurrentRaw, nextDurationById)
              : undefined;

            const slug =
              typeof opts?.contextSlug === "string"
                ? opts.contextSlug.trim()
                : "";
            const title =
              typeof opts?.contextTitle === "string"
                ? opts.contextTitle.trim()
                : "";
            const artist =
              typeof opts?.contextArtist === "string"
                ? opts.contextArtist.trim()
                : "";

            const hasSlug = slug.length > 0;
            const hasTitle = title.length > 0;
            const hasArtist = artist.length > 0;
            const hasArtwork = typeof opts?.artworkUrl !== "undefined";
            const hasId =
              typeof opts?.contextId === "string" && opts.contextId.length > 0;

            return {
              ...s,
              durationById: nextDurationById,
              queue: hydratedQueue,

              queueContextId: hasId ? opts!.contextId : s.queueContextId,
              queueContextSlug: hasSlug ? slug : s.queueContextSlug,
              queueContextTitle: hasTitle ? title : s.queueContextTitle,
              queueContextArtist: hasArtist ? artist : s.queueContextArtist,
              queueContextArtworkUrl: hasArtwork
                ? (opts!.artworkUrl ?? null)
                : (s.queueContextArtworkUrl ?? null),

              current: nextCurrent,
              positionMs: s.current ? s.positionMs : 0,
              selectedTrackId: s.selectedTrackId ?? nextCurrent?.id,
            };
          }),

        enqueue: (track: PlayerTrack) =>
          setState((s) => {
            const nextDurationById = primeDurationById(s.durationById, [track]);
            const t = hydrateTrack(track, nextDurationById);
            return {
              ...s,
              durationById: nextDurationById,
              queue: [...s.queue, t],
              current: s.current ?? t,
              selectedTrackId: s.selectedTrackId ?? t.id,
            };
          }),

        clearQueue: () =>
          setState((s) => ({
            ...s,
            queue: [],
            current: undefined,
            selectedTrackId: undefined,
            pendingTrackId: undefined,

            positionMs: 0,
            pendingSeekMs: undefined,
            seeking: false,
            seekNonce: s.seekNonce + 1,
            loadingReason: undefined,
          })),

        setPositionMs: (ms: number) =>
          setState((s) => ({
            ...s,
            positionMs: Math.max(0, ms),
          })),

        setDurationMs: (ms: number) =>
          setState((s) => {
            const cur = s.current;
            if (!cur) return s;
            if (!Number.isFinite(ms) || ms <= 0) return s;

            const alreadyCached =
              typeof s.durationById[cur.id] === "number" &&
              s.durationById[cur.id] > 0;
            const alreadyOnTrack =
              typeof cur.durationMs === "number" && cur.durationMs > 0;
            if (alreadyCached || alreadyOnTrack) return s;

            const nextDurationById = { ...s.durationById, [cur.id]: ms };

            const nextCurrent = { ...cur, durationMs: ms };
            let changed = false;
            const nextQueue = s.queue.map((t) => {
              if (t.id !== cur.id) return t;
              if (typeof t.durationMs === "number" && t.durationMs > 0)
                return t;
              changed = true;
              return { ...t, durationMs: ms };
            });

            return {
              ...s,
              durationById: nextDurationById,
              current: nextCurrent,
              queue: changed ? nextQueue : s.queue,
            };
          }),

        setStatusExternal: (st: PlayerStatus) =>
          setState((s) => {
            if (
              s.status === "blocked" &&
              (s.lastError || s.blockedCode || s.blockedAction)
            )
              return s;
            return s.status === st ? s : { ...s, status: st };
          }),

        setLoadingReasonExternal: (r?: LoadingReason) =>
          setState((s) =>
            s.loadingReason === r ? s : { ...s, loadingReason: r },
          ),

        seek: (ms: number) => {
          setState((s) => {
            const curId = s.current?.id ?? "";
            const dur =
              (curId ? s.durationById[curId] : 0) || s.current?.durationMs || 0;
            const next = dur > 0 ? clamp(ms, 0, dur) : Math.max(0, ms);
            return {
              ...s,
              positionMs: next,
              pendingSeekMs: next,
              seeking: true,
              seekNonce: s.seekNonce + 1,
            };
          });
        },

        clearPendingSeek: () =>
          setState((s) => {
            if (!s.seeking && s.pendingSeekMs == null) return s;
            return { ...s, seeking: false, pendingSeekMs: undefined };
          }),

        setVolume: (v: number) =>
          setState((s) => ({ ...s, volume: clamp(v, 0, 1) })),
        toggleMute: () => setState((s) => ({ ...s, muted: !s.muted })),

        cycleRepeat: () =>
          setState((s) => ({ ...s, repeat: nextRepeat(s.repeat) })),

        tick: (deltaMs: number) => {
          setState((s) => {
            if (s.status !== "playing") return s;

            const curId = s.current?.id ?? "";
            const dur =
              (curId ? s.durationById[curId] : 0) || s.current?.durationMs || 0;
            const nextPos = Math.max(0, s.positionMs + Math.max(0, deltaMs));

            if (dur <= 0) return { ...s, positionMs: nextPos };
            if (nextPos < dur) return { ...s, positionMs: nextPos };

            if (s.repeat === "one") return { ...s, positionMs: 0 };

            const cur = s.current;
            const idx = cur ? s.queue.findIndex((t) => t.id === cur.id) : -1;
            const at = idx >= 0 ? idx : 0;
            const nextIdx = at + 1;

            if (nextIdx < s.queue.length) {
              const t = hydrateTrack(s.queue[nextIdx], s.durationById);
              return {
                ...s,
                current: t,
                positionMs: 0,
                selectedTrackId: t.id,
                pendingTrackId: t.id,
              };
            }
            if (s.repeat === "all" && s.queue.length > 0) {
              const t = hydrateTrack(s.queue[0], s.durationById);
              return {
                ...s,
                current: t,
                positionMs: 0,
                selectedTrackId: t.id,
                pendingTrackId: t.id,
              };
            }

            return { ...s, status: "paused", positionMs: dur };
          });
        },

        setBlocked: (
          reason?: string,
          meta?: {
            code?: string;
            action?: BlockAction;
            correlationId?: string | null;
          },
        ) =>
          setState((s) => ({
            ...s,
            status: "blocked",
            lastError: reason ?? "Playback blocked.",
            loadingReason: undefined,
            intent: null,
            intentAtMs: undefined,

            blockedCode: meta?.code,
            blockedAction: meta?.action,
            blockedCorrelationId:
              meta?.correlationId ?? s.blockedCorrelationId ?? null,
          })),

        clearBlocked: () =>
          setState((s) => ({
            ...s,
            lastError: undefined,
            blockedCode: undefined,
            blockedAction: undefined,
            blockedCorrelationId: null,
            status: s.status === "blocked" ? "idle" : s.status,
          })),

        clearError: () =>
          setState((s) => ({
            ...s,
            lastError: undefined,
            blockedCode: undefined,
            blockedAction: undefined,
            blockedCorrelationId: null,
            status: s.status === "blocked" ? "idle" : s.status,
          })),

        bumpReload: () =>
          setState((s) => {
            if (!s.current?.muxPlaybackId)
              return { ...s, reloadNonce: s.reloadNonce + 1 };
            return {
              ...s,
              reloadNonce: s.reloadNonce + 1,
              status: "loading",
              loadingReason: "token",
              lastError: undefined,
              intent: "play",
              intentAtMs: Date.now(),
              pendingTrackId: s.current.id,
              selectedTrackId: s.current.id,
            };
          }),
      };
    }, [state]);

  return <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx);
  if (!ctx)
    throw new Error("usePlayer must be used within PlayerStateProvider");
  return ctx;
}
