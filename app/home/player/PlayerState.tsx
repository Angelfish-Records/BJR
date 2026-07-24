// web/app/home/player/PlayerState.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import type { PlayerTrack } from "@/lib/types";
import { ensureLyricsForTrack } from "@/app/home/player/lyrics/ensureLyricsForTrack";
import {
  fetchPlaybackAccessDecision,
  readPlaybackShareTokenFromLocation,
  type PlaybackAccessDecision,
} from "./playbackAccessClient";

type PlayerStatus = "idle" | "loading" | "playing" | "paused";
type RepeatMode = "off" | "one" | "all";
type Intent = "play" | "pause" | null;
type LoadingReason = "token" | "attach" | "buffering" | undefined;

export type QueueContext = {
  contextId?: string;
  contextSlug?: string;
  contextTitle?: string;
  contextArtist?: string;
  artworkUrl?: string | null;
  sharePlaybackContext?: string | null;
  sharePlaybackScopeId?: string | null;

  // Lets a deep link prepare an album queue around a specific track without
  // beginning playback or rearranging the album’s natural track order.
  initialCurrentRecordingId?: string;
};

export type PlayerState = {
  status: PlayerStatus;
  current?: PlayerTrack;
  queue: PlayerTrack[];
  lastError?: string;
  lastPlayAttemptAtMs?: number;

  // True only while a user-initiated play request is awaiting the client-side
  // access decision. This is visual state: it must not itself arm protected
  // media attachment.
  playRequestPending: boolean;

  queueContextId?: string;
  queueContextSlug?: string;
  queueContextTitle?: string;
  queueContextArtist?: string;
  queueContextArtworkUrl?: string | null;
  queueSharePlaybackContext?: string | null;
  queueSharePlaybackScopeId?: string | null;

  intent: Intent;
  intentAtMs?: number;
  selectedRecordingId?: string;
  pendingRecordingId?: string;

  pendingSeekMs?: number;
  seeking: boolean;

  loadingReason?: LoadingReason;
  reloadNonce: number;

  positionMs: number;
  seekNonce: number;

  volume: number;
  muted: boolean;
  repeat: RepeatMode;

  // Catalogue duration supplied by Sanity. This remains stable metadata and a
  // pre-load fallback, but is not assumed to be the decoded asset's exact end.
  durationByRecordingId: Record<string, number>;

  // Runtime duration reported by the browser for the actual delivered Mux
  // rendition. Keyed by playback ID so a future asset replacement cannot reuse
  // a stale duration merely because it shares a recording ID.
  assetDurationByPlaybackId: Record<string, number>;
};

type PlayerActions = {
  play: (track?: PlayerTrack) => void;
  pause: () => void;
  next: () => void;
  advanceFromEngine: () => void;
  prev: () => void;

  setQueue: (tracks: PlayerTrack[], opts?: QueueContext) => void;
  enqueue: (track: PlayerTrack) => void;
  clearQueue: () => void;

  setPositionMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;
  setAssetDurationMs: (playbackId: string, ms: number) => void;

  setStatusExternal: (s: PlayerStatus) => void;
  setLoadingReasonExternal: (r?: LoadingReason) => void;

  setIntent: (i: Intent) => void;
  clearIntent: () => void;
  selectTrack: (id?: string) => void;
  setPendingRecordingId: (id?: string) => void;
  resolvePendingTrack: (id: string) => void;

  seek: (ms: number) => void;
  clearPendingSeek: () => void;

  setVolume: (v: number) => void;
  toggleMute: () => void;

  cycleRepeat: () => void;
  tick: (deltaMs: number) => void;

  clearError: () => void;
  bumpReload: () => void;
};

type PlayerVisualState = {
  status: PlayerStatus;
  intent: Intent;
  playRequestPending: boolean;
  current?: PlayerTrack;
  firstQueuedTrack?: PlayerTrack;
};

const PlayerCtx = React.createContext<(PlayerState & PlayerActions) | null>(
  null,
);
const PlayerActionsCtx = React.createContext<PlayerActions | null>(null);
const PlayerVisualCtx = React.createContext<PlayerVisualState | null>(null);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nextRepeat(r: RepeatMode): RepeatMode {
  if (r === "off") return "all";
  if (r === "all") return "one";
  return "off";
}

function positiveDurationMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function getAssetDurationMs(
  assetDurationByPlaybackId: Record<string, number>,
  track: PlayerTrack | undefined,
): number {
  const playbackId = (track?.muxPlaybackId ?? "").trim();

  return playbackId
    ? positiveDurationMs(assetDurationByPlaybackId[playbackId])
    : 0;
}

function getEffectiveDurationMs(
  state: Pick<
    PlayerState,
    "durationByRecordingId" | "assetDurationByPlaybackId"
  >,
  track: PlayerTrack | undefined,
): number {
  const assetDurationMs = getAssetDurationMs(
    state.assetDurationByPlaybackId,
    track,
  );

  if (assetDurationMs > 0) return assetDurationMs;

  const recordingId = (track?.recordingId ?? "").trim();
  const catalogueDurationMs = recordingId
    ? positiveDurationMs(state.durationByRecordingId[recordingId])
    : 0;

  return catalogueDurationMs || positiveDurationMs(track?.durationMs);
}

function retainAssetDurationsByPlaybackId(
  previous: Record<string, number>,
  tracks: PlayerTrack[],
): Record<string, number> {
  const activePlaybackIds = new Set<string>();

  for (const track of tracks) {
    const playbackId = (track.muxPlaybackId ?? "").trim();
    if (playbackId) activePlaybackIds.add(playbackId);
  }

  let next = previous;

  for (const playbackId of Object.keys(previous)) {
    if (activePlaybackIds.has(playbackId)) continue;

    if (next === previous) next = { ...previous };
    delete next[playbackId];
  }

  return next;
}

function hydrateTrack(
  t: PlayerTrack,
  durationByRecordingId: Record<string, number>,
): PlayerTrack {
  const cached = durationByRecordingId[t.recordingId];
  if (!cached || cached <= 0) return t;
  if (t.durationMs === cached) return t;
  return { ...t, durationMs: cached };
}

function hydrateTracks(
  ts: PlayerTrack[],
  durationByRecordingId: Record<string, number>,
) {
  let changed = false;
  const next = ts.map((t) => {
    const ht = hydrateTrack(t, durationByRecordingId);
    if (ht !== t) changed = true;
    return ht;
  });
  return changed ? next : ts;
}

function blockedPlaybackMessage(access: PlaybackAccessDecision): string {
  if (access.embargoed) {
    return "Playback is disabled while this release is under embargo.";
  }

  if (access.reason) return access.reason;

  return "Playback is not available for this release.";
}

type TargetedPlayIntentDetail = {
  track: PlayerTrack;
  albumId: string | null;
};

function dispatchTargetedPlayIntent(
  track: PlayerTrack,
  state: Pick<PlayerState, "queueContextId">,
): void {
  if (typeof window === "undefined") return;

  const albumId = (state.queueContextId ?? "").trim() || null;

  window.dispatchEvent(
    new CustomEvent<TargetedPlayIntentDetail>("af:play-target-intent", {
      detail: {
        track,
        albumId,
      },
    }),
  );
}

function getNextTransportTrack(state: PlayerState): PlayerTrack | undefined {
  const current = state.current;

  if (!current || state.queue.length === 0) return undefined;
  if (state.repeat === "one") return current;

  const index = state.queue.findIndex(
    (track) => track.recordingId === current.recordingId,
  );
  const currentIndex = index >= 0 ? index : 0;

  if (currentIndex + 1 < state.queue.length) {
    return state.queue[currentIndex + 1];
  }

  return state.repeat === "all" ? state.queue[0] : undefined;
}

function getPreviousTransportTrack(
  state: PlayerState,
): PlayerTrack | undefined {
  const current = state.current;

  if (!current || state.queue.length === 0) return undefined;

  if (state.status === "playing" && state.positionMs > 3000) {
    return current;
  }

  const index = state.queue.findIndex(
    (track) => track.recordingId === current.recordingId,
  );
  const currentIndex = index >= 0 ? index : 0;

  if (currentIndex > 0) {
    return state.queue[currentIndex - 1];
  }

  if (state.repeat === "all") {
    return state.queue[state.queue.length - 1];
  }

  return current;
}

function primeDurationByRecordingId(
  prev: Record<string, number>,
  tracks: PlayerTrack[],
): Record<string, number> {
  let next = prev;
  for (const t of tracks) {
    if (!t?.recordingId) continue;
    const ms = t.durationMs;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) continue;
    if (typeof next[t.recordingId] === "number" && next[t.recordingId] > 0)
      continue;
    if (next === prev) next = { ...prev };
    next[t.recordingId] = ms;
  }
  return next;
}

export function PlayerStateProvider(props: { children: React.ReactNode }) {
  const {
    isLoaded: clerkAuthLoaded,
    isSignedIn,
    userId,
    sessionId,
  } = useAuth();

  const playbackAccessIdentityKey = !clerkAuthLoaded
    ? "clerk:loading"
    : isSignedIn
      ? `clerk:user:${userId ?? ""}:session:${sessionId ?? ""}`
      : "clerk:anonymous";

  const [state, setState] = React.useState<PlayerState>({
    status: "idle",
    current: undefined,
    queue: [],
    lastError: undefined,
    lastPlayAttemptAtMs: undefined,
    playRequestPending: false,

    queueContextId: undefined,
    queueContextSlug: undefined,
    queueContextTitle: undefined,
    queueContextArtist: undefined,
    queueContextArtworkUrl: null,
    queueSharePlaybackContext: null,
    queueSharePlaybackScopeId: null,

    intent: null,
    intentAtMs: undefined,
    selectedRecordingId: undefined,
    pendingRecordingId: undefined,

    pendingSeekMs: undefined,
    seeking: false,

    loadingReason: undefined,
    reloadNonce: 0,

    positionMs: 0,
    seekNonce: 0,

    volume: 0.9,
    muted: false,
    repeat: "off",

    durationByRecordingId: {},
    assetDurationByPlaybackId: {},
  });

  const stateRef = React.useRef(state);
  const playRequestSequenceRef = React.useRef(0);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const blockPlayback = React.useCallback((message: string) => {
    setState((s) => ({
      ...s,
      status: s.status === "loading" ? "idle" : s.status,
      intent: "pause",
      intentAtMs: Date.now(),
      playRequestPending: false,
      loadingReason: undefined,
      pendingRecordingId: undefined,
      lastError: message,
    }));
  }, []);

  const guardPlayback = React.useCallback(
    async (onAllowed: () => void): Promise<void> => {
      const catalogueId = (stateRef.current.queueContextId ?? "").trim();

      if (!catalogueId) {
        onAllowed();
        return;
      }

      try {
        const access = await fetchPlaybackAccessDecision({
          catalogueId,
          shareToken: readPlaybackShareTokenFromLocation(),
          accessIdentityKey: playbackAccessIdentityKey,
        });

        if (!access.allowed) {
          blockPlayback(blockedPlaybackMessage(access));
          return;
        }

        const expectedSharePlaybackScopeId = `alb:${catalogueId.replace(
          /^alb:/i,
          "",
        )}`;

        if (
          access.sharePlaybackContext &&
          access.sharePlaybackScopeId === expectedSharePlaybackScopeId
        ) {
          setState((current) => ({
            ...current,
            queueSharePlaybackContext: access.sharePlaybackContext,
            queueSharePlaybackScopeId: access.sharePlaybackScopeId,
          }));
        }

        onAllowed();
      } catch {
        blockPlayback("Playback access could not be verified.");
      }
    },
    [blockPlayback, playbackAccessIdentityKey],
  );
  const actions: PlayerActions = React.useMemo(() => {
    return {
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
        setState((s) => {
          if (s.selectedRecordingId === id) return s;
          return {
            ...s,
            selectedRecordingId: id,
          };
        }),

      setPendingRecordingId: (id?: string) =>
        setState((s) => {
          if (s.pendingRecordingId === id) return s;
          return {
            ...s,
            pendingRecordingId: id,
          };
        }),

      resolvePendingTrack: (id: string) =>
        setState((s) => {
          if (s.pendingRecordingId !== id) return s;
          return { ...s, pendingRecordingId: undefined };
        }),

      play: (track?: PlayerTrack) => {
        const requestSequence = ++playRequestSequenceRef.current;
        const requestStartedAtMs = Date.now();
        const snapshot = stateRef.current;
        const requestedTrack = track ?? snapshot.current ?? snapshot.queue[0];

        if (requestedTrack) {
          dispatchTargetedPlayIntent(
            hydrateTrack(requestedTrack, snapshot.durationByRecordingId),
            snapshot,
          );
        }

        setState((s) => ({
          ...s,
          playRequestPending: true,
          lastPlayAttemptAtMs: requestStartedAtMs,
          lastError: undefined,
        }));

        void guardPlayback(() => {
          if (requestSequence !== playRequestSequenceRef.current) {
            return;
          }

          setState((s) => {
            if (requestSequence !== playRequestSequenceRef.current) {
              return s;
            }

            const now = Date.now();
            const rawNext = track ?? s.current ?? s.queue[0];

            if (!rawNext) {
              return {
                ...s,
                status: "idle",
                current: undefined,
                positionMs: 0,
                intent: "play",
                intentAtMs: now,
                lastPlayAttemptAtMs: now,
                playRequestPending: false,
                lastError: undefined,
                loadingReason: undefined,
                pendingRecordingId: undefined,
              };
            }

            const nextTrack = hydrateTrack(rawNext, s.durationByRecordingId);
            const sameTrack = Boolean(
              s.current && s.current.recordingId === nextTrack.recordingId,
            );

            const base = {
              ...s,
              intent: "play" as const,
              intentAtMs: now,
              lastPlayAttemptAtMs: now,
              playRequestPending: false,
              lastError: undefined,
              selectedRecordingId: nextTrack.recordingId,
              pendingRecordingId: nextTrack.recordingId,
            };

            if (sameTrack && s.status === "paused") {
              return {
                ...base,
                current: hydrateTrack(s.current!, s.durationByRecordingId),
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
        });
      },

      pause: () => {
        playRequestSequenceRef.current += 1;

        setState((s) => ({
          ...s,
          intent: "pause",
          intentAtMs: Date.now(),
          playRequestPending: false,
        }));
      },

      next: () => {
        const snapshot = stateRef.current;
        const targetTrack = getNextTransportTrack(snapshot);

        if (targetTrack) {
          dispatchTargetedPlayIntent(
            hydrateTrack(targetTrack, snapshot.durationByRecordingId),
            snapshot,
          );
        }

        void guardPlayback(() => {
          setState((s) => {
            const cur = s.current;
            if (!cur || s.queue.length === 0) return s;

            const idx = s.queue.findIndex(
              (t) => t.recordingId === cur.recordingId,
            );
            const at = idx >= 0 ? idx : 0;

            if (s.repeat === "one") {
              return {
                ...s,
                status: "loading",
                loadingReason: "attach",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingRecordingId: cur.recordingId,
                selectedRecordingId: cur.recordingId,
              };
            }

            const nextIdx = at + 1;
            if (nextIdx < s.queue.length) {
              const t = hydrateTrack(s.queue[nextIdx], s.durationByRecordingId);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingRecordingId: t.recordingId,
                selectedRecordingId: t.recordingId,
              };
            }

            if (s.repeat === "all" && s.queue.length > 0) {
              const t = hydrateTrack(s.queue[0], s.durationByRecordingId);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingRecordingId: t.recordingId,
                selectedRecordingId: t.recordingId,
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
              pendingRecordingId: undefined,
            };
          });
        });
      },

      advanceFromEngine: () => {
        setState((s) => {
          const cur = s.current;
          if (!cur || s.queue.length === 0) return s;

          const idx = s.queue.findIndex(
            (t) => t.recordingId === cur.recordingId,
          );
          const at = idx >= 0 ? idx : 0;

          if (s.repeat === "one") {
            return {
              ...s,
              status: "loading",
              loadingReason: "attach",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: cur.recordingId,
              selectedRecordingId: cur.recordingId,
            };
          }

          const nextIdx = at + 1;

          if (nextIdx < s.queue.length) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "attach",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          if (s.repeat === "all" && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "attach",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          return {
            ...s,
            status: "paused",
            intent: null,
            intentAtMs: undefined,
            positionMs: 0,
            pendingSeekMs: 0,
            seeking: true,
            seekNonce: s.seekNonce + 1,
            loadingReason: undefined,
            pendingRecordingId: undefined,
          };
        });
      },

      prev: () => {
        const snapshot = stateRef.current;
        const targetTrack = getPreviousTransportTrack(snapshot);

        if (targetTrack) {
          dispatchTargetedPlayIntent(
            hydrateTrack(targetTrack, snapshot.durationByRecordingId),
            snapshot,
          );
        }

        void guardPlayback(() => {
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
                pendingRecordingId: cur.recordingId,
                selectedRecordingId: cur.recordingId,
              };
            }

            const idx = s.queue.findIndex(
              (t) => t.recordingId === cur.recordingId,
            );
            const at = idx >= 0 ? idx : 0;
            const prevIdx = at - 1;

            if (prevIdx >= 0) {
              const t = hydrateTrack(s.queue[prevIdx], s.durationByRecordingId);
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingRecordingId: t.recordingId,
                selectedRecordingId: t.recordingId,
              };
            }

            if (s.repeat === "all" && s.queue.length > 0) {
              const t = hydrateTrack(
                s.queue[s.queue.length - 1],
                s.durationByRecordingId,
              );
              return {
                ...s,
                current: t,
                status: "loading",
                loadingReason: "token",
                positionMs: 0,
                intent: "play",
                intentAtMs: Date.now(),
                pendingRecordingId: t.recordingId,
                selectedRecordingId: t.recordingId,
              };
            }

            return {
              ...s,
              positionMs: 0,
              status: "loading",
              loadingReason: "attach",
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: cur.recordingId,
              selectedRecordingId: cur.recordingId,
            };
          });
        });
      },

      setQueue: (tracks: PlayerTrack[], opts?: QueueContext) =>
        setState((s) => {
          const nextDurationByRecordingId = primeDurationByRecordingId(
            s.durationByRecordingId,
            tracks,
          );
          const nextAssetDurationByPlaybackId =
            retainAssetDurationsByPlaybackId(
              s.assetDurationByPlaybackId,
              tracks,
            );
          const hydratedQueue = hydrateTracks(
            tracks,
            nextDurationByRecordingId,
          );

          const initialCurrentRecordingId =
            typeof opts?.initialCurrentRecordingId === "string"
              ? opts.initialCurrentRecordingId.trim()
              : "";

          const requestedInitialCurrent = initialCurrentRecordingId
            ? (hydratedQueue.find(
                (track) => track.recordingId === initialCurrentRecordingId,
              ) ?? null)
            : null;

          const nextCurrentRaw =
            requestedInitialCurrent ?? s.current ?? hydratedQueue[0];

          const nextCurrent = nextCurrentRaw
            ? hydrateTrack(nextCurrentRaw, nextDurationByRecordingId)
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
          const hasSharePlaybackContext = Object.prototype.hasOwnProperty.call(
            opts ?? {},
            "sharePlaybackContext",
          );

          const hasSharePlaybackScopeId = Object.prototype.hasOwnProperty.call(
            opts ?? {},
            "sharePlaybackScopeId",
          );
          const hasId =
            typeof opts?.contextId === "string" && opts.contextId.length > 0;

          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            assetDurationByPlaybackId: nextAssetDurationByPlaybackId,
            queue: hydratedQueue,

            queueContextId: hasId ? opts!.contextId : s.queueContextId,
            queueContextSlug: hasSlug ? slug : s.queueContextSlug,
            queueContextTitle: hasTitle ? title : s.queueContextTitle,
            queueContextArtist: hasArtist ? artist : s.queueContextArtist,
            queueContextArtworkUrl: hasArtwork
              ? (opts!.artworkUrl ?? null)
              : (s.queueContextArtworkUrl ?? null),
            queueSharePlaybackContext: hasSharePlaybackContext
              ? typeof opts?.sharePlaybackContext === "string" &&
                opts.sharePlaybackContext.trim()
                ? opts.sharePlaybackContext.trim()
                : null
              : s.queueSharePlaybackContext,

            queueSharePlaybackScopeId: hasSharePlaybackScopeId
              ? typeof opts?.sharePlaybackScopeId === "string" &&
                opts.sharePlaybackScopeId.trim()
                ? opts.sharePlaybackScopeId.trim()
                : null
              : s.queueSharePlaybackScopeId,

            current: nextCurrent,
            positionMs: requestedInitialCurrent
              ? 0
              : s.current
                ? s.positionMs
                : 0,
            selectedRecordingId: requestedInitialCurrent
              ? requestedInitialCurrent.recordingId
              : (s.selectedRecordingId ?? nextCurrent?.recordingId),
            pendingRecordingId: requestedInitialCurrent
              ? undefined
              : s.pendingRecordingId,
          };
        }),

      enqueue: (track: PlayerTrack) =>
        setState((s) => {
          const nextDurationByRecordingId = primeDurationByRecordingId(
            s.durationByRecordingId,
            [track],
          );
          const t = hydrateTrack(track, nextDurationByRecordingId);
          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            queue: [...s.queue, t],
            current: s.current ?? t,
            selectedRecordingId: s.selectedRecordingId ?? t.recordingId,
          };
        }),

      clearQueue: () =>
        setState((s) => ({
          ...s,
          queue: [],
          current: undefined,
          selectedRecordingId: undefined,
          pendingRecordingId: undefined,

          positionMs: 0,
          pendingSeekMs: undefined,
          seeking: false,
          seekNonce: s.seekNonce + 1,
          loadingReason: undefined,
          queueSharePlaybackContext: null,
          queueSharePlaybackScopeId: null,
          assetDurationByPlaybackId: {},
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
            typeof s.durationByRecordingId[cur.recordingId] === "number" &&
            s.durationByRecordingId[cur.recordingId] > 0;
          const alreadyOnTrack =
            typeof cur.durationMs === "number" && cur.durationMs > 0;
          if (alreadyCached || alreadyOnTrack) return s;

          const nextDurationByRecordingId = {
            ...s.durationByRecordingId,
            [cur.recordingId]: ms,
          };

          const nextCurrent = { ...cur, durationMs: ms };
          let changed = false;
          const nextQueue = s.queue.map((t) => {
            if (t.recordingId !== cur.recordingId) return t;
            if (typeof t.durationMs === "number" && t.durationMs > 0) return t;
            changed = true;
            return { ...t, durationMs: ms };
          });

          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            current: nextCurrent,
            queue: changed ? nextQueue : s.queue,
          };
        }),

      setAssetDurationMs: (playbackId: string, ms: number) => {
        const normalizedPlaybackId = playbackId.trim();
        const normalizedDurationMs = positiveDurationMs(ms);

        if (!normalizedPlaybackId || normalizedDurationMs <= 0) return;

        setState((s) => {
          if (
            s.assetDurationByPlaybackId[normalizedPlaybackId] ===
            normalizedDurationMs
          ) {
            return s;
          }

          return {
            ...s,
            assetDurationByPlaybackId: {
              ...s.assetDurationByPlaybackId,
              [normalizedPlaybackId]: normalizedDurationMs,
            },
          };
        });
      },

      setStatusExternal: (st: PlayerStatus) =>
        setState((s) => (s.status === st ? s : { ...s, status: st })),

      setLoadingReasonExternal: (r?: LoadingReason) =>
        setState((s) =>
          s.loadingReason === r ? s : { ...s, loadingReason: r },
        ),

      seek: (ms: number) => {
        setState((s) => {
          const dur = getEffectiveDurationMs(s, s.current);
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

          const dur = getEffectiveDurationMs(s, s.current);
          const nextPos = Math.max(0, s.positionMs + Math.max(0, deltaMs));

          if (dur <= 0) return { ...s, positionMs: nextPos };
          if (nextPos < dur) return { ...s, positionMs: nextPos };

          if (s.repeat === "one") return { ...s, positionMs: 0 };

          const cur = s.current;
          const idx = cur
            ? s.queue.findIndex((t) => t.recordingId === cur.recordingId)
            : -1;
          const at = idx >= 0 ? idx : 0;
          const nextIdx = at + 1;

          if (nextIdx < s.queue.length) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              positionMs: 0,
              selectedRecordingId: t.recordingId,
              pendingRecordingId: t.recordingId,
            };
          }

          if (s.repeat === "all" && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              positionMs: 0,
              selectedRecordingId: t.recordingId,
              pendingRecordingId: t.recordingId,
            };
          }

          return { ...s, status: "paused", positionMs: dur };
        });
      },

      clearError: () =>
        setState((s) => (s.lastError ? { ...s, lastError: undefined } : s)),

      bumpReload: () => {
        void guardPlayback(() => {
          setState((s) => {
            if (!s.current?.muxPlaybackId) {
              return { ...s, reloadNonce: s.reloadNonce + 1 };
            }

            return {
              ...s,
              reloadNonce: s.reloadNonce + 1,
              status: "loading",
              loadingReason: "token",
              lastError: undefined,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: s.current.recordingId,
              selectedRecordingId: s.current.recordingId,
            };
          });
        });
      },
    };
  }, [guardPlayback]);

  const api: PlayerState & PlayerActions = React.useMemo(() => {
    return {
      ...state,
      ...actions,
    };
  }, [state, actions]);

  const {
    status: visualStatus,
    intent: visualIntent,
    playRequestPending: visualPlayRequestPending,
    current: visualCurrent,
    queue: visualQueue,
  } = state;

  const firstQueuedTrack = visualQueue[0];

  const visualState: PlayerVisualState = React.useMemo(
    () => ({
      status: visualStatus,
      intent: visualIntent,
      playRequestPending: visualPlayRequestPending,
      current: visualCurrent,
      firstQueuedTrack,
    }),
    [
      visualStatus,
      visualIntent,
      visualPlayRequestPending,
      visualCurrent,
      firstQueuedTrack,
    ],
  );

  const currentId = state.current?.recordingId ?? null;
  const pendingId = state.pendingRecordingId ?? null;

  React.useEffect(() => {
    const id = (currentId ?? "").trim();
    if (!id) return;
    void ensureLyricsForTrack(id);
  }, [currentId]);

  React.useEffect(() => {
    const id = (pendingId ?? "").trim();
    if (!id) return;
    void ensureLyricsForTrack(id);
  }, [pendingId]);

  return (
    <PlayerActionsCtx.Provider value={actions}>
      <PlayerVisualCtx.Provider value={visualState}>
        <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>
      </PlayerVisualCtx.Provider>
    </PlayerActionsCtx.Provider>
  );
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx);
  if (!ctx)
    throw new Error("usePlayer must be used within PlayerStateProvider");
  return ctx;
}

export function usePlayerActions() {
  const ctx = React.useContext(PlayerActionsCtx);
  if (!ctx)
    throw new Error("usePlayerActions must be used within PlayerStateProvider");
  return ctx;
}

export function usePlayerVisual() {
  const ctx = React.useContext(PlayerVisualCtx);
  if (!ctx)
    throw new Error("usePlayerVisual must be used within PlayerStateProvider");
  return ctx;
}
