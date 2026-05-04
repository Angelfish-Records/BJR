"use client";

import React from "react";
import Hls from "hls.js";
import { usePlayer } from "./PlayerState";
import type { PlayerTrack } from "@/lib/types";
import { muxSignedHlsUrl } from "@/lib/mux";
import { mediaSurface } from "./mediaSurface";
import { audioSurface } from "./audioSurface";
import type {
  GatePayload,
  GateDomain,
  GateAction,
  GateCodeRaw,
} from "@/app/home/gating/gateTypes";
import { normalizeGateCodeRaw } from "@/app/home/gating/gateTypes";
import { gateResultFromPayload } from "@/app/home/gating/fromPayload";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import { useBadgeAwardOverlay } from "@/app/home/badges/BadgeAwardOverlayProvider";
import { normalizeBadgeAwardNotices } from "@/app/home/badges/badgeAwardTypes";

type TokenResponse =
  | { ok: true; token: string; expiresAt: string | number }
  | { ok: false; error: string; gate?: GatePayload };

type AlbumSessionToken = {
  recordingId: string;
  playbackId: string;
  token: string;
  expiresAt: string | number;
};

type AlbumSessionResponse =
  | {
      ok: true;
      albumId: string;
      expiresAt: string | number;
      tracks: AlbumSessionToken[];
      correlationId?: string;
    }
  | { ok: false; error: string; gate?: GatePayload };

type AlbumSessionCacheEntry = {
  albumId: string;
  st: string | null;
  expiresAtMs: number;
  byPlaybackId: Map<string, { token: string; expiresAtMs: number }>;
};

type DeckId = "a" | "b";

type DeckMeta = {
  deckId: DeckId;
  recordingId: string;
  playbackId: string;
  attachKey: string;
  prepared: boolean;
};

type PreparedStandby = {
  deckId: DeckId;
  recordingId: string;
  playbackId: string;
  attachKey: string;
};

type AudioDebugEvent = {
  t: number;
  event: string;
  albumId?: string | null;
  recordingId?: string | null;
  playbackId?: string | null;
  source?: string | null;
  detail?: string | null;
};

function shouldUseNativeHls(a: HTMLMediaElement): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome|CriOS|Chromium/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !isChrome;

  if (isAndroid) return false;

  return isSafari && a.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function newPlaybackSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  throw new Error("Unable to create secure playback session id");
}

function hasMediaSession(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "mediaSession" in navigator &&
    typeof navigator.mediaSession !== "undefined"
  );
}

function audioDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUDIO_DEBUG === "1";
}

function audioDebugVerboseEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUDIO_DEBUG_VERBOSE === "1";
}

function shouldSendAudioDebugEvent(event: string): boolean {
  if (audioDebugVerboseEnabled()) return true;

  return (
    event.includes("failed") ||
    event.includes("fatal") ||
    event.includes("rejected") ||
    event.includes("error") ||
    event.includes("missing") ||
    event.includes("unsupported") ||
    event === "album-session-failed" ||
    event === "standby-not-ready-fallback-state-advance" ||
    event === "standby-promote-failed-fallback-state-advance"
  );
}

const audioDebugSessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `debug-${Date.now().toString(36)}`;

const audioDebugBuffer: AudioDebugEvent[] = [];
let audioDebugFlushTimer: number | null = null;

function flushAudioDebugSoon(force = false): void {
  if (!audioDebugEnabled()) return;
  if (!audioDebugBuffer.length) return;

  const flush = () => {
    audioDebugFlushTimer = null;
    if (!audioDebugBuffer.length) return;

    const events = audioDebugBuffer.splice(0, audioDebugBuffer.length);

    try {
      fetch("/api/playback/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: audioDebugSessionId,
          href: window.location.href,
          events,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };

  if (force) {
    if (audioDebugFlushTimer != null) {
      window.clearTimeout(audioDebugFlushTimer);
      audioDebugFlushTimer = null;
    }
    flush();
    return;
  }

  if (audioDebugFlushTimer != null) return;
  audioDebugFlushTimer = window.setTimeout(flush, 5000);
}

function sendAudioDebug(payload: {
  event: string;
  albumId?: string | null;
  recordingId?: string | null;
  playbackId?: string | null;
  source?: string | null;
  detail?: string | null;
}): void {
  if (!audioDebugEnabled()) return;
  if (!shouldSendAudioDebugEvent(payload.event)) return;

  const event: AudioDebugEvent = {
    t: Math.floor(performance.now()),
    ...payload,
  };

  audioDebugBuffer.push(event);

  if (audioDebugVerboseEnabled()) {
    try {
      console.info("[audio-debug]", {
        sessionId: audioDebugSessionId,
        ...event,
      });
    } catch {}
  }

  flushAudioDebugSoon(true);
}

function setMediaSessionPositionStateSafe(args: {
  durationSec: number;
  positionSec: number;
  playbackRate?: number;
}): void {
  if (!hasMediaSession()) return;
  if (typeof navigator.mediaSession.setPositionState !== "function") return;

  const duration = Number.isFinite(args.durationSec)
    ? Math.max(0, args.durationSec)
    : 0;
  const position = Number.isFinite(args.positionSec)
    ? Math.max(0, Math.min(args.positionSec, duration || args.positionSec))
    : 0;
  const playbackRate =
    typeof args.playbackRate === "number" &&
    Number.isFinite(args.playbackRate) &&
    args.playbackRate > 0
      ? args.playbackRate
      : 1;

  try {
    navigator.mediaSession.setPositionState({
      duration,
      position,
      playbackRate,
    });
  } catch {}
}

function otherDeck(deckId: DeckId): DeckId {
  return deckId === "a" ? "b" : "a";
}

function normalizeAlbumId(raw: string | null | undefined): string {
  let s = (raw ?? "").trim();
  while (s.startsWith("alb:")) s = s.slice(4);
  return s.trim();
}

export default function AudioEngine() {
  const p = usePlayer();

  const audioARef = React.useRef<HTMLAudioElement | null>(null);
  const audioBRef = React.useRef<HTMLAudioElement | null>(null);

  const { reportGate, clearGate } = useGateBroker();
  const { announceBadges } = useBadgeAwardOverlay();

  const hlsByDeckRef = React.useRef<Record<DeckId, Hls | null>>({
    a: null,
    b: null,
  });
  const metaByDeckRef = React.useRef<Record<DeckId, DeckMeta | null>>({
    a: null,
    b: null,
  });

  const activeDeckRef = React.useRef<DeckId>("a");
  const standbyRef = React.useRef<PreparedStandby | null>(null);

  const tokenAbortRef = React.useRef<AbortController | null>(null);
  const albumSessionAbortRef = React.useRef<AbortController | null>(null);
  const loadSeq = React.useRef(0);

  const telemetrySessionIdRef = React.useRef<string | null>(null);
  const telemetryPlaySentRef = React.useRef(new Set<string>());
  const telemetryPlayAccumulatedMsRef = React.useRef(new Map<string, number>());
  const telemetryPlayLastProgressMsRef = React.useRef(
    new Map<string, number>(),
  );
  const telemetryProgressSentRef = React.useRef(new Set<string>());
  const telemetryCompleteSentRef = React.useRef(new Set<string>());

  const nearEndWarmKeyRef = React.useRef<string | null>(null);
  const debugProgressHeartbeatRef = React.useRef<string | null>(null);
  const autoAdvanceKeyRef = React.useRef<string | null>(null);
  const suppressPauseDeckRef = React.useRef<DeckId | null>(null);

  const srcNodeByDeckRef = React.useRef<
    Record<DeckId, MediaElementAudioSourceNode | null>
  >({
    a: null,
    b: null,
  });

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  type U8AB = Uint8Array<ArrayBuffer>;
  const freqDataRef = React.useRef<U8AB | null>(null);
  const timeDataRef = React.useRef<U8AB | null>(null);

  const playIntentRef = React.useRef(false);
  const playthroughSentRef = React.useRef(new Set<string>());
  const TELEMETRY_PLAY_THRESHOLD_MS = 5_000;
  const TELEMETRY_PROGRESS_STEP_MS = 15_000;

  // Mobile data needs a much longer runway than Wi-Fi for HLS standby preparation.
  // This also makes locked-screen handoff less dependent on late timeupdate events.
  const STANDBY_PREPARE_WINDOW_MS = 90_000;
  const AUTO_ADVANCE_WINDOW_MS = 1_500;

  const tokenCacheRef = React.useRef(
    new Map<string, { token: string; expiresAtMs: number }>(),
  );
  const albumSessionCacheRef = React.useRef(
    new Map<string, AlbumSessionCacheEntry>(),
  );
  const albumSessionInFlightRef = React.useRef(
    new Map<string, Promise<boolean>>(),
  );
  const blockedNonceRef = React.useRef(new Map<string, number>());

  const engineBlockedRef = React.useRef(false);

  const pRef = React.useRef(p);
  React.useEffect(() => {
    pRef.current = p;
  }, [p]);

  const getAudio = React.useCallback((deckId: DeckId) => {
    return deckId === "a" ? audioARef.current : audioBRef.current;
  }, []);

  const getActiveAudio = React.useCallback(() => {
    return getAudio(activeDeckRef.current);
  }, [getAudio]);

  const getShareTokenFromLocation = React.useCallback((): string | null => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
    } catch {
      return null;
    }
  }, []);

  const albumSessionKey = React.useCallback(
    (albumId: string, st: string | null): string => {
      return `${normalizeAlbumId(albumId)}::st=${st ?? ""}`;
    },
    [],
  );

  const inferIntentForGate = React.useCallback(() => {
    const s = pRef.current;
    const lastAttempt = s.lastPlayAttemptAtMs;
    const explicitIntent =
      s.intent === "play" ||
      (typeof lastAttempt === "number" &&
        Number.isFinite(lastAttempt) &&
        Date.now() - lastAttempt < 12_000);
    return explicitIntent ? ("explicit" as const) : ("passive" as const);
  }, []);

  const clearPlaybackGate = React.useCallback(() => {
    engineBlockedRef.current = false;
    clearGate({ domain: "playback" });
  }, [clearGate]);

  const reportPlaybackGate = React.useCallback(
    (payload: GatePayload, corrFromHeader: string | null) => {
      const domain: GateDomain = (payload.domain ?? "playback") as GateDomain;

      const decision = gateResultFromPayload({
        payload: {
          ...payload,
          domain,
          correlationId: payload.correlationId ?? corrFromHeader ?? null,
        },
        attempt: { verb: "play", domain: "playback" },
        intent: inferIntentForGate(),
      });

      if (!decision.ok) {
        engineBlockedRef.current = true;

        reportGate({
          code: decision.reason.code,
          action: decision.reason.action,
          domain: decision.reason.domain,
          correlationId: decision.reason.correlationId ?? null,
          message: decision.reason.message,
          uiMode: decision.uiMode,
        });
        return;
      }

      if (domain === "playback") clearPlaybackGate();
      else clearGate({ domain });
    },
    [clearGate, clearPlaybackGate, inferIntentForGate, reportGate],
  );

  const reportLocalPlaybackErrorAsGate = React.useCallback(
    (code: GateCodeRaw, message: string, corr?: string | null) => {
      const payload: GatePayload = {
        domain: "playback",
        code,
        action: "wait",
        message,
        correlationId: corr ?? null,
      };
      reportPlaybackGate(payload, corr ?? null);
    },
    [reportPlaybackGate],
  );

  const stopDeck = React.useCallback(
    (deckId: DeckId, opts?: { destroyHls?: boolean; clearSrc?: boolean }) => {
      const a = getAudio(deckId);
      if (!a) return;

      try {
        a.pause();
      } catch {}

      if (opts?.destroyHls !== false && hlsByDeckRef.current[deckId]) {
        try {
          hlsByDeckRef.current[deckId]?.destroy();
        } catch {}
        hlsByDeckRef.current[deckId] = null;
      }

      if (opts?.clearSrc !== false) {
        try {
          a.removeAttribute("src");
        } catch {}
        try {
          a.load();
        } catch {}
        metaByDeckRef.current[deckId] = null;
      }
    },
    [getAudio],
  );

  const hardStopAll = React.useCallback(() => {
    try {
      tokenAbortRef.current?.abort();
    } catch {}
    tokenAbortRef.current = null;

    stopDeck("a");
    stopDeck("b");

    standbyRef.current = null;
    telemetrySessionIdRef.current = null;
    playIntentRef.current = false;
  }, [stopDeck]);

  const cacheAlbumSessionTokens = React.useCallback(
    (args: {
      albumId: string;
      st: string | null;
      expiresAt: string | number;
      tracks: AlbumSessionToken[];
    }): boolean => {
      const expiresAtMs =
        typeof args.expiresAt === "number"
          ? args.expiresAt * 1000
          : Date.parse(String(args.expiresAt));

      if (!Number.isFinite(expiresAtMs)) return false;

      const byPlaybackId = new Map<
        string,
        { token: string; expiresAtMs: number }
      >();

      for (const t of args.tracks) {
        const playbackId = (t.playbackId ?? "").trim();
        const token = (t.token ?? "").trim();

        const trackExpiresAtMs =
          typeof t.expiresAt === "number"
            ? t.expiresAt * 1000
            : Date.parse(String(t.expiresAt));

        if (!playbackId || !token || !Number.isFinite(trackExpiresAtMs)) {
          continue;
        }

        const entry = { token, expiresAtMs: trackExpiresAtMs };
        byPlaybackId.set(playbackId, entry);
        tokenCacheRef.current.set(playbackId, entry);
      }

      if (byPlaybackId.size === 0) return false;

      albumSessionCacheRef.current.set(albumSessionKey(args.albumId, args.st), {
        albumId: args.albumId,
        st: args.st,
        expiresAtMs,
        byPlaybackId,
      });

      return true;
    },
    [albumSessionKey],
  );

  const getCachedTokenForPlaybackId = React.useCallback(
    (playbackId: string): { token: string; expiresAtMs: number } | null => {
      const direct = tokenCacheRef.current.get(playbackId);
      if (direct && Date.now() < direct.expiresAtMs - 5000) return direct;
      return null;
    },
    [],
  );

  const prefetchAlbumSession = React.useCallback(
    async (args: {
      albumId: string | null | undefined;
      st?: string | null;
      signal?: AbortSignal;
    }): Promise<boolean> => {
      const albumId = normalizeAlbumId(args.albumId);
      if (!albumId) return false;

      const st = args.st ?? getShareTokenFromLocation();
      const key = albumSessionKey(albumId, st);

      const cached = albumSessionCacheRef.current.get(key);
      if (cached && Date.now() < cached.expiresAtMs - 5000) return true;

      const existing = albumSessionInFlightRef.current.get(key);
      if (existing) return existing;

      const promise = (async () => {
        try {
          sendAudioDebug({
            event: "album-session-requested",
            albumId,
            source: "AudioEngine",
          });

          const res = await fetch("/api/mux/album-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              albumId,
              ...(st ? { st } : {}),
            }),
            signal: args.signal,
          });

          let data: AlbumSessionResponse | null = null;
          try {
            data = (await res.json()) as AlbumSessionResponse;
          } catch {
            data = null;
          }

          if (!res.ok || !data || !("ok" in data) || data.ok !== true) {
            sendAudioDebug({
              event: "album-session-failed",
              albumId,
              source: "AudioEngine",
              detail: `status=${res.status}`,
            });
            return false;
          }

          sendAudioDebug({
            event: "album-session-received",
            albumId: data.albumId || albumId,
            source: "AudioEngine",
            detail: `tracks=${data.tracks.length}`,
          });

          return cacheAlbumSessionTokens({
            albumId: data.albumId || albumId,
            st,
            expiresAt: data.expiresAt,
            tracks: data.tracks,
          });
        } catch {
          return false;
        }
      })().finally(() => {
        albumSessionInFlightRef.current.delete(key);
      });

      albumSessionInFlightRef.current.set(key, promise);
      return promise;
    },
    [albumSessionKey, cacheAlbumSessionTokens, getShareTokenFromLocation],
  );

  const prefetchCurrentQueueAlbumSession = React.useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      const s = pRef.current;
      const albumId = normalizeAlbumId(s.queueContextId);
      if (!albumId) return false;

      return prefetchAlbumSession({
        albumId,
        st: getShareTokenFromLocation(),
        signal,
      });
    },
    [getShareTokenFromLocation, prefetchAlbumSession],
  );

  const fetchSingleToken = React.useCallback(
    async (args: {
      playbackId: string;
      track: PlayerTrack;
      signal: AbortSignal;
    }): Promise<{ token: string; expiresAtMs: number } | null> => {
      const s = pRef.current;
      const st = getShareTokenFromLocation();

      const res = await fetch("/api/mux/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbackId: args.playbackId,
          recordingId: args.track.recordingId,
          albumId: s.queueContextId,
          albumSlug: s.queueContextSlug,
          durationMs:
            args.track.durationMs ??
            s.durationByRecordingId?.[args.track.recordingId],
          ...(st ? { st } : {}),
        }),
        signal: args.signal,
      });

      const corr = res.headers.get("x-correlation-id") ?? null;

      let data: TokenResponse | null = null;
      try {
        data = (await res.json()) as TokenResponse;
      } catch {
        data = null;
      }

      if (!res.ok || !data || !("ok" in data) || data.ok !== true) {
        const gatePayloadRaw =
          data && "ok" in data && data.ok === false
            ? (data.gate ?? null)
            : null;

        const msg =
          gatePayloadRaw?.message?.trim() ||
          (data && "ok" in data && data.ok === false ? data.error : "") ||
          `Token error (${res.status})`;

        blockedNonceRef.current.set(args.playbackId, s.reloadNonce);
        playIntentRef.current = false;

        if (gatePayloadRaw) {
          const rawCode =
            normalizeGateCodeRaw(gatePayloadRaw.code) ?? "INVALID_REQUEST";
          const action: GateAction = gatePayloadRaw.action ?? "wait";
          const payload: GatePayload = {
            domain: (gatePayloadRaw.domain ?? "playback") as GateDomain,
            code: rawCode,
            action,
            message: gatePayloadRaw.message ?? msg,
            correlationId: gatePayloadRaw.correlationId ?? corr ?? null,
            reason: gatePayloadRaw.reason,
          };
          reportPlaybackGate(payload, corr);
        } else {
          clearPlaybackGate();
        }

        mediaSurface.setStatus("blocked");
        return null;
      }

      const expiresAtMs =
        typeof data.expiresAt === "number"
          ? data.expiresAt * 1000
          : Date.parse(String(data.expiresAt));

      if (!Number.isFinite(expiresAtMs)) return null;

      const token = { token: data.token, expiresAtMs };
      tokenCacheRef.current.set(args.playbackId, token);
      blockedNonceRef.current.delete(args.playbackId);
      clearPlaybackGate();

      return token;
    },
    [clearPlaybackGate, getShareTokenFromLocation, reportPlaybackGate],
  );

  const ensureTokenForTrack = React.useCallback(
    async (args: {
      track: PlayerTrack;
      signal: AbortSignal;
    }): Promise<{ token: string; expiresAtMs: number } | null> => {
      const playbackId = (args.track.muxPlaybackId ?? "").trim();
      if (!playbackId) return null;

      const cached = getCachedTokenForPlaybackId(playbackId);
      if (cached) return cached;

      const s = pRef.current;
      const albumId = normalizeAlbumId(s.queueContextId);
      const st = getShareTokenFromLocation();

      if (albumId) {
        await prefetchAlbumSession({
          albumId,
          st,
          signal: args.signal,
        });

        const albumCached = getCachedTokenForPlaybackId(playbackId);
        if (albumCached) return albumCached;
      }

      return fetchSingleToken({
        playbackId,
        track: args.track,
        signal: args.signal,
      });
    },
    [
      fetchSingleToken,
      getCachedTokenForPlaybackId,
      getShareTokenFromLocation,
      prefetchAlbumSession,
    ],
  );

  const attachTrackToDeck = React.useCallback(
    async (args: {
      deckId: DeckId;
      track: PlayerTrack;
      token: string;
      seq: number;
      reason: "active" | "standby";
    }): Promise<boolean> => {
      const a = getAudio(args.deckId);
      if (!a) return false;

      const playbackId = (args.track.muxPlaybackId ?? "").trim();
      const recordingId = args.track.recordingId;
      if (!playbackId || !recordingId) return false;

      const attachKey = `${playbackId}:${pRef.current.reloadNonce}`;
      const srcUrl = muxSignedHlsUrl(playbackId, args.token);

      sendAudioDebug({
        event:
          args.reason === "standby"
            ? "standby-attach-start"
            : "active-attach-start",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${args.deckId}`,
        detail: `seq=${args.seq}`,
      });

      stopDeck(args.deckId);

      if (args.seq !== loadSeq.current && args.reason === "active") {
        return false;
      }

      a.crossOrigin = "anonymous";
      a.preload = args.reason === "standby" ? "auto" : "metadata";

      metaByDeckRef.current[args.deckId] = {
        deckId: args.deckId,
        recordingId,
        playbackId,
        attachKey,
        prepared: false,
      };

      if (shouldUseNativeHls(a)) {
        sendAudioDebug({
          event:
            args.reason === "standby"
              ? "standby-native-hls-safari"
              : "active-native-hls-safari",
          albumId: pRef.current.queueContextId ?? null,
          recordingId,
          playbackId,
          source: `AudioEngine.${args.deckId}`,
        });

        return new Promise<boolean>((resolve) => {
          let settled = false;

          const cleanup = () => {
            a.removeEventListener("loadedmetadata", onReady);
            a.removeEventListener("canplay", onReady);
            a.removeEventListener("error", onError);
          };

          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            cleanup();
            const meta = metaByDeckRef.current[args.deckId];
            if (ok && meta?.attachKey === attachKey) {
              metaByDeckRef.current[args.deckId] = {
                ...meta,
                prepared: true,
              };
            }
            resolve(ok);
          };

          const onReady = () => finish(true);
          const onError = () => finish(false);

          a.addEventListener("loadedmetadata", onReady);
          a.addEventListener("canplay", onReady);
          a.addEventListener("error", onError);

          try {
            a.src = srcUrl;
            a.load();
          } catch {
            finish(false);
          }

          window.setTimeout(() => finish(true), 2500);
        });
      }

      if (!Hls.isSupported()) {
        sendAudioDebug({
          event: "hls-unsupported",
          albumId: pRef.current.queueContextId ?? null,
          recordingId,
          playbackId,
          source: `AudioEngine.${args.deckId}`,
        });

        return false;
      }

      sendAudioDebug({
        event:
          args.reason === "standby" ? "standby-hlsjs-attach" : "hlsjs-attach",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${args.deckId}`,
      });

      return new Promise<boolean>((resolve) => {
        let settled = false;

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });

        hlsByDeckRef.current[args.deckId] = hls;

        const finish = (ok: boolean) => {
          if (settled) return;
          settled = true;

          const meta = metaByDeckRef.current[args.deckId];
          if (ok && meta?.attachKey === attachKey) {
            metaByDeckRef.current[args.deckId] = {
              ...meta,
              prepared: true,
            };
          }

          resolve(ok);
        };

        hls.on(Hls.Events.ERROR, (_event, err) => {
          if (!err?.fatal) return;

          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-hls-fatal"
                : "active-hls-fatal",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${args.deckId}.hls`,
            detail: `${err.type ?? "unknown"}:${err.details ?? "error"}`,
          });

          finish(false);

          if (args.reason === "active") {
            reportLocalPlaybackErrorAsGate(
              "INVALID_REQUEST",
              `HLS fatal: ${err.details ?? "error"}`,
            );
          }
        });

        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-manifest-parsed"
                : "hls-manifest-parsed",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${args.deckId}.hls`,
          });

          finish(true);
        });

        try {
          hls.attachMedia(a);
          hls.loadSource(srcUrl);
        } catch {
          finish(false);
        }

        window.setTimeout(() => finish(false), 10_000);
      });
    },
    [getAudio, reportLocalPlaybackErrorAsGate, stopDeck],
  );

  const playDeck = React.useCallback(
    async (deckId: DeckId, reason: "active" | "promote"): Promise<boolean> => {
      const a = getAudio(deckId);
      const meta = metaByDeckRef.current[deckId];
      if (!a || !meta) return false;

      try {
        await a.play();

        sendAudioDebug({
          event:
            reason === "promote"
              ? "standby-promote-play-resolved"
              : "attach-play-resolved",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: meta.recordingId,
          playbackId: meta.playbackId,
          source: `AudioEngine.${deckId}`,
        });

        return true;
      } catch (err: unknown) {
        sendAudioDebug({
          event:
            reason === "promote"
              ? "standby-promote-play-rejected"
              : "attach-play-rejected",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: meta.recordingId,
          playbackId: meta.playbackId,
          source: `AudioEngine.${deckId}`,
          detail:
            err instanceof Error ? `${err.name}: ${err.message}` : "unknown",
        });

        return false;
      }
    },
    [getAudio],
  );

  const prepareStandbyForTrack = React.useCallback(
    async (track: PlayerTrack): Promise<boolean> => {
      const playbackId = (track.muxPlaybackId ?? "").trim();
      if (!track.recordingId || !playbackId) return false;

      const currentStandby = standbyRef.current;
      if (
        currentStandby?.recordingId === track.recordingId &&
        currentStandby.playbackId === playbackId
      ) {
        return true;
      }

      const deckId = otherDeck(activeDeckRef.current);
      const existing = metaByDeckRef.current[deckId];

      if (
        existing?.recordingId === track.recordingId &&
        existing.playbackId === playbackId &&
        existing.prepared
      ) {
        standbyRef.current = {
          deckId,
          recordingId: track.recordingId,
          playbackId,
          attachKey: existing.attachKey,
        };
        return true;
      }

      const ac = new AbortController();
      const token = await ensureTokenForTrack({
        track,
        signal: ac.signal,
      });

      if (!token) return false;

      const seq = loadSeq.current;

      const ok = await attachTrackToDeck({
        deckId,
        track,
        token: token.token,
        seq,
        reason: "standby",
      });

      const meta = metaByDeckRef.current[deckId];

      if (!ok || !meta) {
        sendAudioDebug({
          event: "standby-prepare-failed",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: track.recordingId,
          playbackId,
          source: `AudioEngine.${deckId}`,
        });
        return false;
      }

      standbyRef.current = {
        deckId,
        recordingId: track.recordingId,
        playbackId,
        attachKey: meta.attachKey,
      };

      sendAudioDebug({
        event: "standby-prepared",
        albumId: pRef.current.queueContextId ?? null,
        recordingId: track.recordingId,
        playbackId,
        source: `AudioEngine.${deckId}`,
      });

      return true;
    },
    [attachTrackToDeck, ensureTokenForTrack],
  );

  const getNextTrack = React.useCallback((): PlayerTrack | null => {
    const s = pRef.current;
    const cur = s.current;
    if (!cur) return null;

    const idx = s.queue.findIndex((t) => t.recordingId === cur.recordingId);

    if (s.repeat === "one") return cur;

    if (idx >= 0 && idx + 1 < s.queue.length) {
      return s.queue[idx + 1] ?? null;
    }

    if (s.repeat === "all" && s.queue.length > 0) {
      return s.queue[0] ?? null;
    }

    return null;
  }, []);

  const promoteStandby = React.useCallback(
    async (nextTrack: PlayerTrack): Promise<boolean> => {
      const playbackId = (nextTrack.muxPlaybackId ?? "").trim();
      if (!playbackId) return false;

      const prepared = standbyRef.current;

      if (
        !prepared ||
        prepared.recordingId !== nextTrack.recordingId ||
        prepared.playbackId !== playbackId
      ) {
        sendAudioDebug({
          event: "standby-promote-missing-prepared-deck",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: nextTrack.recordingId,
          playbackId,
          source: "AudioEngine",
        });

        return false;
      }

      const oldDeck = activeDeckRef.current;
      const newDeck = prepared.deckId;

      sendAudioDebug({
        event: "standby-promote-start",
        albumId: pRef.current.queueContextId ?? null,
        recordingId: nextTrack.recordingId,
        playbackId,
        source: `AudioEngine.${newDeck}`,
        detail: `old=${oldDeck};new=${newDeck}`,
      });

      suppressPauseDeckRef.current = oldDeck;

      const ok = await playDeck(newDeck, "promote");

      if (!ok) {
        suppressPauseDeckRef.current = null;
        return false;
      }

      stopDeck(oldDeck);

      activeDeckRef.current = newDeck;
      standbyRef.current = null;
      telemetrySessionIdRef.current = newPlaybackSessionId();

      mediaSurface.setTrack(nextTrack.recordingId);
      mediaSurface.setStatus("playing");
      mediaSurface.setTime(0);

      if (hasMediaSession()) {
        try {
          navigator.mediaSession.playbackState = "playing";
        } catch {}
      }

      pRef.current.advanceFromEngine();

      suppressPauseDeckRef.current = null;

      sendAudioDebug({
        event: "standby-promote-complete",
        albumId: pRef.current.queueContextId ?? null,
        recordingId: nextTrack.recordingId,
        playbackId,
        source: `AudioEngine.${newDeck}`,
      });

      return true;
    },
    [playDeck, stopDeck],
  );

  const attachActiveTrack = React.useCallback(async () => {
    const s = pRef.current;
    const track = s.current;
    const playbackId = (track?.muxPlaybackId ?? "").trim();

    if (!track || !playbackId) return;
    if (engineBlockedRef.current) return;

    const activeDeck = activeDeckRef.current;
    const activeMeta = metaByDeckRef.current[activeDeck];

    if (
      activeMeta?.recordingId === track.recordingId &&
      activeMeta.playbackId === playbackId
    ) {
      if (s.intent === "play" || playIntentRef.current) {
        const played = await playDeck(activeDeck, "active");
        if (played) {
          playIntentRef.current = false;
          pRef.current.clearIntent();
        }
      }
      return;
    }

    const blockedAt = blockedNonceRef.current.get(playbackId);
    if (blockedAt === s.reloadNonce) {
      playIntentRef.current = false;
      hardStopAll();
      mediaSurface.setStatus("blocked");
      return;
    }

    const seq = ++loadSeq.current;

    standbyRef.current = null;
    telemetrySessionIdRef.current = newPlaybackSessionId();

    mediaSurface.setTrack(track.recordingId);
    mediaSurface.setStatus("loading");
    pRef.current.setStatusExternal("loading");

    const cachedBeforeAttach = getCachedTokenForPlaybackId(playbackId);
    pRef.current.setLoadingReasonExternal(
      cachedBeforeAttach ? "attach" : "token",
    );

    tokenAbortRef.current?.abort();
    const ac = new AbortController();
    tokenAbortRef.current = ac;

    const token =
      cachedBeforeAttach ??
      (await ensureTokenForTrack({
        track,
        signal: ac.signal,
      }));

    if (!token) return;
    if (seq !== loadSeq.current) return;

    const ok = await attachTrackToDeck({
      deckId: activeDeck,
      track,
      token: token.token,
      seq,
      reason: "active",
    });

    if (!ok || seq !== loadSeq.current) return;

    if (
      s.intent === "play" ||
      playIntentRef.current ||
      s.status === "loading"
    ) {
      const played = await playDeck(activeDeck, "active");
      if (played) {
        playIntentRef.current = false;
        pRef.current.clearIntent();
      } else {
        playIntentRef.current = true;
      }
    }
  }, [
    attachTrackToDeck,
    ensureTokenForTrack,
    getCachedTokenForPlaybackId,
    hardStopAll,
    playDeck,
  ]);

  React.useEffect(() => {
    const a = audioARef.current;
    const b = audioBRef.current;
    if (!a || !b) return;

    const tokenCache = tokenCacheRef.current;
    const albumSessionCache = albumSessionCacheRef.current;
    const albumSessionInFlight = albumSessionInFlightRef.current;
    const blockedNonce = blockedNonceRef.current;
    const playthroughSent = playthroughSentRef.current;
    const telemetryPlaySent = telemetryPlaySentRef.current;
    const telemetryPlayAccumulated = telemetryPlayAccumulatedMsRef.current;
    const telemetryPlayLastProgress = telemetryPlayLastProgressMsRef.current;
    const telemetryProgressSent = telemetryProgressSentRef.current;
    const telemetryCompleteSent = telemetryCompleteSentRef.current;

    return () => {
      try {
        tokenAbortRef.current?.abort();
      } catch {}
      tokenAbortRef.current = null;

      try {
        albumSessionAbortRef.current?.abort();
      } catch {}
      albumSessionAbortRef.current = null;

      stopDeck("a");
      stopDeck("b");

      telemetrySessionIdRef.current = null;
      standbyRef.current = null;

      try {
        analyserRef.current?.disconnect();
      } catch {}
      analyserRef.current = null;

      try {
        srcNodeByDeckRef.current.a?.disconnect();
      } catch {}
      try {
        srcNodeByDeckRef.current.b?.disconnect();
      } catch {}

      srcNodeByDeckRef.current = { a: null, b: null };
      freqDataRef.current = null;
      timeDataRef.current = null;

      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx) {
        ctx.close().catch(() => {});
      }

      tokenCache.clear();
      albumSessionCache.clear();
      albumSessionInFlight.clear();
      blockedNonce.clear();
      playthroughSent.clear();
      telemetryPlaySent.clear();
      telemetryPlayAccumulated.clear();
      telemetryPlayLastProgress.clear();
      telemetryProgressSent.clear();
      telemetryCompleteSent.clear();

      try {
        audioSurface.set({
          rms: 0,
          bass: 0,
          mid: 0,
          treble: 0,
          centroid: 0,
          energy: 0,
        });
      } catch {}

      try {
        mediaSurface.setStatus("idle");
      } catch {}
    };
  }, [stopDeck]);

  React.useEffect(() => {
    if (!engineBlockedRef.current) return;
    hardStopAll();
    mediaSurface.setStatus("blocked");
  }, [hardStopAll]);

  React.useEffect(() => {
    const ensureAudioGraph = async () => {
      const a = audioARef.current;
      const b = audioBRef.current;
      if (!a || !b) return;
      if (audioCtxRef.current) return;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;

      const srcA = ctx.createMediaElementSource(a);
      srcA.connect(analyser);
      srcNodeByDeckRef.current.a = srcA;

      const srcB = ctx.createMediaElementSource(b);
      srcB.connect(analyser);
      srcNodeByDeckRef.current.b = srcB;

      freqDataRef.current = new Uint8Array(
        new ArrayBuffer(analyser.frequencyBinCount),
      ) as U8AB;
      timeDataRef.current = new Uint8Array(
        new ArrayBuffer(analyser.fftSize),
      ) as U8AB;
    };

    const onUserGesture = async () => {
      await ensureAudioGraph();
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }
    };

    window.addEventListener("af:play-intent", onUserGesture);
    return () => window.removeEventListener("af:play-intent", onUserGesture);
  }, []);

  React.useEffect(() => {
    let raf: number | null = null;
    let to: number | null = null;

    const tick = () => {
      const analyser = analyserRef.current;
      const freq = freqDataRef.current;
      const time = timeDataRef.current;

      const st = pRef.current.status;
      const active = st === "playing" || st === "loading";

      if (!analyser || !freq || !time) {
        audioSurface.set({
          rms: 0,
          bass: 0,
          mid: 0,
          treble: 0,
          centroid: 0,
          energy: 0.08,
        });
        to = window.setTimeout(tick, 250);
        return;
      }

      if (!active) {
        analyser.getByteTimeDomainData(time);
        let sum = 0;
        for (let i = 0; i < time.length; i++) {
          const v = (time[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / time.length);
        audioSurface.set({
          rms,
          bass: 0,
          mid: 0,
          treble: 0,
          centroid: 0,
          energy: Math.min(1, rms * 1.2),
        });
        to = window.setTimeout(tick, 180);
        return;
      }

      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      const n = freq.length;
      const bassEnd = Math.floor(n * 0.08);
      const midEnd = Math.floor(n * 0.35);

      let bass = 0;
      let mid = 0;
      let treble = 0;

      for (let i = 0; i < n; i++) {
        const v = freq[i]! / 255;
        if (i < bassEnd) bass += v;
        else if (i < midEnd) mid += v;
        else treble += v;
      }

      bass /= bassEnd || 1;
      mid /= midEnd - bassEnd || 1;
      treble /= n - midEnd || 1;

      let weighted = 0;
      let total = 0;

      for (let i = 0; i < n; i++) {
        const v = freq[i]! / 255;
        weighted += i * v;
        total += v;
      }

      const centroid = total > 0 ? weighted / total / n : 0;

      audioSurface.set({
        rms,
        bass,
        mid,
        treble,
        centroid,
        energy: Math.min(1, rms * 2),
      });

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (to) window.clearTimeout(to);
    };
  }, []);

  React.useEffect(() => {
    nearEndWarmKeyRef.current = null;
    debugProgressHeartbeatRef.current = null;
    autoAdvanceKeyRef.current = null;

    const player = pRef.current;

    sendAudioDebug({
      event: "current-track-changed",
      albumId: player.queueContextId ?? null,
      recordingId: player.current?.recordingId ?? null,
      playbackId: player.current?.muxPlaybackId ?? null,
      source: "AudioEngine",
      detail: `status=${player.status};intent=${player.intent ?? "null"}`,
    });
  }, [
    p.current?.recordingId,
    p.current?.muxPlaybackId,
    p.queueContextId,
    p.status,
    p.intent,
  ]);

  React.useEffect(() => {
    for (const deckId of ["a", "b"] as const) {
      const a = getAudio(deckId);
      if (!a) continue;
      a.volume = Math.max(0, Math.min(1, p.volume));
      a.muted = p.muted;
    }
  }, [getAudio, p.volume, p.muted]);

  React.useEffect(() => {
    const flush = () => flushAudioDebugSoon(true);

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, []);

  React.useEffect(() => {
    const albumId = normalizeAlbumId(p.queueContextId);
    if (!albumId) return;
    if (engineBlockedRef.current) return;

    const ac = new AbortController();

    void prefetchAlbumSession({
      albumId,
      st: getShareTokenFromLocation(),
      signal: ac.signal,
    });

    return () => ac.abort();
  }, [p.queueContextId, getShareTokenFromLocation, prefetchAlbumSession]);

  React.useEffect(() => {
    const onPrefetchAlbumSession = (event: Event) => {
      const detail =
        event instanceof CustomEvent && typeof event.detail === "object"
          ? (event.detail as {
              albumId?: unknown;
              st?: unknown;
            })
          : null;

      const albumId =
        typeof detail?.albumId === "string"
          ? normalizeAlbumId(detail.albumId)
          : "";
      const st =
        typeof detail?.st === "string" ? detail.st.trim() || null : null;

      if (!albumId) return;

      albumSessionAbortRef.current?.abort();
      const ac = new AbortController();
      albumSessionAbortRef.current = ac;

      void prefetchAlbumSession({
        albumId,
        st,
        signal: ac.signal,
      });
    };

    window.addEventListener(
      "af:prefetch-album-session",
      onPrefetchAlbumSession,
    );

    return () => {
      window.removeEventListener(
        "af:prefetch-album-session",
        onPrefetchAlbumSession,
      );
    };
  }, [prefetchAlbumSession]);

  React.useEffect(() => {
    const s = pRef.current;
    const playbackId = s.current?.muxPlaybackId;
    if (!playbackId) return;

    const armed =
      s.status === "loading" ||
      s.status === "playing" ||
      playIntentRef.current ||
      s.intent === "play" ||
      s.reloadNonce > 0;

    if (!armed) return;

    void attachActiveTrack();
  }, [
    p.current?.recordingId,
    p.current?.muxPlaybackId,
    p.reloadNonce,
    p.intent,
    p.status,
    attachActiveTrack,
  ]);

  React.useEffect(() => {
    const sendPlaybackTelemetry = (payload: {
      event: "play" | "progress" | "complete";
      recordingId: string;
      playbackId: string;
      milestoneKey: string;
      listenedMs?: number;
      progressMs: number;
      durationMs: number | null;
    }) => {
      fetch("/api/playback/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      })
        .then(async (response) => {
          let json: unknown = null;

          try {
            json = await response.json();
          } catch {
            json = null;
          }

          const badges =
            json && typeof json === "object" && "newlyAwardedBadges" in json
              ? normalizeBadgeAwardNotices(
                  (json as { newlyAwardedBadges?: unknown }).newlyAwardedBadges,
                )
              : [];

          if (badges.length > 0) {
            announceBadges(badges);
          }
        })
        .catch(() => {});
    };

    const reportPlaythroughComplete = (pct: number) => {
      const recordingId = pRef.current.current?.recordingId ?? "";
      const playbackId = telemetrySessionIdRef.current ?? "";
      if (!recordingId || !playbackId) return;

      const key = `${recordingId}:${playbackId}`;
      if (playthroughSentRef.current.has(key)) return;
      if (pct < 0.9) return;

      playthroughSentRef.current.add(key);

      fetch("/api/playthrough/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId, playbackId, pct }),
        keepalive: true,
      }).catch(() => {});
    };

    const reportTelemetryPlay = (params: {
      recordingId: string;
      playbackId: string;
      progressMs: number;
      durationMs: number | null;
    }) => {
      const { recordingId, playbackId, progressMs, durationMs } = params;
      if (!recordingId || !playbackId) return;

      const sessionKey = `${recordingId}:${playbackId}`;
      const sentKey = `${sessionKey}:play`;

      if (telemetryPlaySentRef.current.has(sentKey)) return;

      const prevProgress =
        telemetryPlayLastProgressMsRef.current.get(sessionKey);
      telemetryPlayLastProgressMsRef.current.set(sessionKey, progressMs);

      if (prevProgress == null) {
        telemetryPlayAccumulatedMsRef.current.set(sessionKey, 0);
        return;
      }

      const deltaMs = progressMs - prevProgress;

      if (deltaMs <= 0 || deltaMs > 5_000) {
        telemetryPlayLastProgressMsRef.current.set(sessionKey, progressMs);
        return;
      }

      const accumulatedMs =
        (telemetryPlayAccumulatedMsRef.current.get(sessionKey) ?? 0) + deltaMs;

      telemetryPlayAccumulatedMsRef.current.set(sessionKey, accumulatedMs);

      if (accumulatedMs < TELEMETRY_PLAY_THRESHOLD_MS) return;

      telemetryPlaySentRef.current.add(sentKey);

      sendPlaybackTelemetry({
        event: "play",
        recordingId,
        playbackId,
        milestoneKey: "play",
        progressMs,
        durationMs,
      });
    };

    const reportTelemetryComplete = (params: {
      recordingId: string;
      playbackId: string;
      progressMs: number;
      durationMs: number | null;
    }) => {
      const { recordingId, playbackId, progressMs, durationMs } = params;
      const milestoneKey = `${recordingId}:${playbackId}:complete`;

      if (telemetryCompleteSentRef.current.has(milestoneKey)) return;

      telemetryCompleteSentRef.current.add(milestoneKey);

      sendPlaybackTelemetry({
        event: "complete",
        recordingId,
        playbackId,
        milestoneKey: "complete",
        progressMs,
        durationMs,
      });
    };

    const reportTelemetryProgress = (params: {
      recordingId: string;
      playbackId: string;
      progressMs: number;
      durationMs: number | null;
    }) => {
      const { recordingId, playbackId, progressMs, durationMs } = params;
      const milestoneMs =
        Math.floor(progressMs / TELEMETRY_PROGRESS_STEP_MS) *
        TELEMETRY_PROGRESS_STEP_MS;

      if (!recordingId || !playbackId) return;
      if (milestoneMs < TELEMETRY_PROGRESS_STEP_MS) return;

      const milestoneKey = `${recordingId}:${playbackId}:progress:${milestoneMs}`;
      if (telemetryProgressSentRef.current.has(milestoneKey)) return;

      telemetryProgressSentRef.current.add(milestoneKey);

      sendPlaybackTelemetry({
        event: "progress",
        recordingId,
        playbackId,
        milestoneKey: String(milestoneMs),
        listenedMs: TELEMETRY_PROGRESS_STEP_MS,
        progressMs,
        durationMs,
      });
    };

    const debugMediaEvent = (
      deckId: DeckId,
      event: string,
      detail?: string,
    ) => {
      const a = getAudio(deckId);
      const meta = metaByDeckRef.current[deckId];

      sendAudioDebug({
        event,
        albumId: pRef.current.queueContextId ?? null,
        recordingId:
          meta?.recordingId ?? pRef.current.current?.recordingId ?? null,
        playbackId:
          meta?.playbackId ?? pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${deckId}`,
        detail:
          detail ??
          (a
            ? `readyState=${a.readyState};networkState=${a.networkState};currentTime=${a.currentTime.toFixed(
                2,
              )};duration=${
                Number.isFinite(a.duration) ? a.duration.toFixed(2) : "NaN"
              }`
            : "missing-audio"),
      });
    };

    const applyPendingSeek = (deckId: DeckId) => {
      const a = getAudio(deckId);
      if (!a) return;

      const ms = pRef.current.pendingSeekMs;
      if (ms == null) return;

      try {
        a.currentTime = Math.max(0, ms / 1000);
      } catch {}

      pRef.current.clearPendingSeek();
    };

    const handleAutoAdvance = async () => {
      const s = pRef.current;
      const cur = s.current;
      const nextTrack = getNextTrack();

      if (!cur || !nextTrack) return;

      const key = `${cur.recordingId}:${telemetrySessionIdRef.current ?? cur.muxPlaybackId ?? ""}`;
      if (autoAdvanceKeyRef.current === key) return;
      autoAdvanceKeyRef.current = key;

      sendAudioDebug({
        event: "auto-next-from-timeupdate",
        albumId: s.queueContextId ?? null,
        recordingId: cur.recordingId,
        playbackId: cur.muxPlaybackId ?? null,
        source: "AudioEngine",
        detail: `next=${nextTrack.recordingId}`,
      });

      reportPlaythroughComplete(1);

      const standbyReady = await prepareStandbyForTrack(nextTrack);

      if (!standbyReady) {
        sendAudioDebug({
          event: "standby-not-ready-fallback-state-advance",
          albumId: s.queueContextId ?? null,
          recordingId: cur.recordingId,
          playbackId: cur.muxPlaybackId ?? null,
          source: "AudioEngine",
          detail: `next=${nextTrack.recordingId}`,
        });

        playIntentRef.current = true;
        pRef.current.advanceFromEngine();
        return;
      }

      const promoted = await promoteStandby(nextTrack);

      if (!promoted) {
        sendAudioDebug({
          event: "standby-promote-failed-fallback-state-advance",
          albumId: s.queueContextId ?? null,
          recordingId: cur.recordingId,
          playbackId: cur.muxPlaybackId ?? null,
          source: "AudioEngine",
          detail: `next=${nextTrack.recordingId}`,
        });

        playIntentRef.current = true;
        pRef.current.advanceFromEngine();
      }
    };

    const onTime = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      const a = getAudio(deckId);
      if (!a) return;

      const ms = Math.floor(a.currentTime * 1000);
      mediaSurface.setTime(ms);
      pRef.current.setPositionMs(ms);

      const curId = pRef.current.current?.recordingId ?? "";
      const durFromState =
        (curId ? pRef.current.durationByRecordingId[curId] : 0) ||
        pRef.current.current?.durationMs ||
        0;

      const durFromEl =
        Number.isFinite(a.duration) && a.duration > 0
          ? Math.floor(a.duration * 1000)
          : 0;

      const durMs = durFromState || durFromEl;

      if (durMs <= 0) return;

      const heartbeatBucket = Math.floor(ms / 60_000);
      const heartbeatKey = `${curId}:${heartbeatBucket}`;

      if (
        heartbeatBucket > 0 &&
        debugProgressHeartbeatRef.current !== heartbeatKey
      ) {
        debugProgressHeartbeatRef.current = heartbeatKey;
        sendAudioDebug({
          event: "playback-progress-heartbeat",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: curId,
          playbackId: pRef.current.current?.muxPlaybackId ?? null,
          source: `AudioEngine.${deckId}`,
          detail: `progress=${ms};duration=${durMs}`,
        });
      }

      setMediaSessionPositionStateSafe({
        durationSec: durMs / 1000,
        positionSec: ms / 1000,
        playbackRate: 1,
      });

      reportTelemetryPlay({
        recordingId: curId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs: ms,
        durationMs: durMs,
      });

      reportTelemetryProgress({
        recordingId: curId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs: ms,
        durationMs: durMs,
      });

      const remainingMs = durMs - ms;
      const nextTrack = getNextTrack();

      if (
        nextTrack &&
        remainingMs > 0 &&
        remainingMs <= STANDBY_PREPARE_WINDOW_MS
      ) {
        const warmKey = `${curId}:${nextTrack.recordingId}:${
          telemetrySessionIdRef.current ?? ""
        }`;

        if (nearEndWarmKeyRef.current !== warmKey) {
          nearEndWarmKeyRef.current = warmKey;
          void prefetchCurrentQueueAlbumSession();
          void prepareStandbyForTrack(nextTrack);
        }
      }

      if (
        nextTrack &&
        remainingMs > 0 &&
        remainingMs <= AUTO_ADVANCE_WINDOW_MS
      ) {
        void handleAutoAdvance();
      }

      const pct = ms / durMs;
      reportPlaythroughComplete(pct);

      if (pct >= 0.9) {
        reportTelemetryComplete({
          recordingId: curId,
          playbackId: telemetrySessionIdRef.current ?? "",
          progressMs: ms,
          durationMs: durMs,
        });
      }
    };

    const onLoadedMeta = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      const a = getAudio(deckId);
      if (!a) return;

      const d = a.duration;
      if (Number.isFinite(d) && d > 0) {
        pRef.current.setDurationMs(Math.floor(d * 1000));
      }
    };

    const markPlaying = (deckId: DeckId) => {
      debugMediaEvent(deckId, "media-playing");

      if (deckId !== activeDeckRef.current) return;

      if (engineBlockedRef.current) {
        hardStopAll();
        mediaSurface.setStatus("blocked");
        return;
      }

      mediaSurface.setStatus("playing");

      if (hasMediaSession()) {
        try {
          navigator.mediaSession.playbackState = "playing";
        } catch {}
      }

      pRef.current.setStatusExternal("playing");
      pRef.current.setLoadingReasonExternal(undefined);
      pRef.current.clearIntent();

      applyPendingSeek(deckId);

      const curId = pRef.current.current?.recordingId;
      if (curId) pRef.current.resolvePendingTrack(curId);
    };

    const markPaused = (deckId: DeckId) => {
      debugMediaEvent(deckId, "media-paused");

      if (suppressPauseDeckRef.current === deckId) {
        sendAudioDebug({
          event: "media-paused-during-deck-promotion-ignored",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: metaByDeckRef.current[deckId]?.recordingId ?? null,
          playbackId: metaByDeckRef.current[deckId]?.playbackId ?? null,
          source: `AudioEngine.${deckId}`,
        });
        return;
      }

      if (deckId !== activeDeckRef.current) return;

      const a = getAudio(deckId);
      if (!a) return;

      const effectivelyEnded =
        a.ended ||
        (Number.isFinite(a.duration) &&
          a.duration > 0 &&
          a.currentTime >= a.duration - 0.25);

      if (effectivelyEnded) {
        sendAudioDebug({
          event: "media-paused-at-ended-ignored",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: pRef.current.current?.recordingId ?? null,
          playbackId: pRef.current.current?.muxPlaybackId ?? null,
          source: `AudioEngine.${deckId}`,
        });
        return;
      }

      if (engineBlockedRef.current) return;

      mediaSurface.setStatus("paused");

      if (hasMediaSession()) {
        try {
          navigator.mediaSession.playbackState = "paused";
        } catch {}
      }

      pRef.current.setStatusExternal("paused");
      pRef.current.setLoadingReasonExternal(undefined);
      pRef.current.clearIntent();
    };

    const markBuffering = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      const a = getAudio(deckId);
      if (!a) return;

      const falsePositiveWhilePlaying =
        !a.paused &&
        !a.ended &&
        a.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

      if (falsePositiveWhilePlaying) return;

      debugMediaEvent(deckId, "media-buffering");

      if (engineBlockedRef.current) return;

      const s = pRef.current;
      const shouldBePlaying =
        s.intent === "play" || s.status === "playing" || s.status === "loading";

      if (!shouldBePlaying) return;

      mediaSurface.setStatus("loading");
      s.setStatusExternal("loading");
      s.setLoadingReasonExternal("buffering");
    };

    const clearBuffering = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      debugMediaEvent(deckId, "media-buffering-cleared");

      if (engineBlockedRef.current) return;

      pRef.current.setLoadingReasonExternal(undefined);
      applyPendingSeek(deckId);
    };

    const onEnded = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      debugMediaEvent(deckId, "media-ended");

      const nextTrack = getNextTrack();

      sendAudioDebug({
        event: "ended-fired",
        albumId: pRef.current.queueContextId ?? null,
        recordingId: pRef.current.current?.recordingId ?? null,
        playbackId: pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${deckId}`,
        detail: nextTrack
          ? `next=${nextTrack.recordingId}`
          : `next=null;queue=${pRef.current.queue.length};repeat=${pRef.current.repeat}`,
      });

      reportPlaythroughComplete(1);

      if (nextTrack) {
        void handleAutoAdvance();
      } else {
        pRef.current.advanceFromEngine();
      }
    };

    const makeHandlers = (deckId: DeckId) => {
      const a = getAudio(deckId);
      if (!a) return null;

      const handlers = {
        timeupdate: () => onTime(deckId),
        loadedmetadata: () => onLoadedMeta(deckId),
        playing: () => markPlaying(deckId),
        pause: () => markPaused(deckId),
        waiting: () => markBuffering(deckId),
        stalled: () => markBuffering(deckId),
        canplay: () => clearBuffering(deckId),
        canplaythrough: () => clearBuffering(deckId),
        ended: () => onEnded(deckId),
        error: () => {
          const err = a.error;
          debugMediaEvent(
            deckId,
            "media-error",
            err ? `code=${err.code};message=${err.message}` : "unknown",
          );
        },
        suspend: () => debugMediaEvent(deckId, "media-suspend"),
        abort: () => debugMediaEvent(deckId, "media-abort"),
        emptied: () => debugMediaEvent(deckId, "media-emptied"),
      };

      a.addEventListener("timeupdate", handlers.timeupdate);
      a.addEventListener("loadedmetadata", handlers.loadedmetadata);
      a.addEventListener("playing", handlers.playing);
      a.addEventListener("pause", handlers.pause);
      a.addEventListener("waiting", handlers.waiting);
      a.addEventListener("stalled", handlers.stalled);
      a.addEventListener("canplay", handlers.canplay);
      a.addEventListener("canplaythrough", handlers.canplaythrough);
      a.addEventListener("ended", handlers.ended);
      a.addEventListener("error", handlers.error);
      a.addEventListener("suspend", handlers.suspend);
      a.addEventListener("abort", handlers.abort);
      a.addEventListener("emptied", handlers.emptied);

      return () => {
        a.removeEventListener("timeupdate", handlers.timeupdate);
        a.removeEventListener("loadedmetadata", handlers.loadedmetadata);
        a.removeEventListener("playing", handlers.playing);
        a.removeEventListener("pause", handlers.pause);
        a.removeEventListener("waiting", handlers.waiting);
        a.removeEventListener("stalled", handlers.stalled);
        a.removeEventListener("canplay", handlers.canplay);
        a.removeEventListener("canplaythrough", handlers.canplaythrough);
        a.removeEventListener("ended", handlers.ended);
        a.removeEventListener("error", handlers.error);
        a.removeEventListener("suspend", handlers.suspend);
        a.removeEventListener("abort", handlers.abort);
        a.removeEventListener("emptied", handlers.emptied);
      };
    };

    const cleanupA = makeHandlers("a");
    const cleanupB = makeHandlers("b");

    return () => {
      cleanupA?.();
      cleanupB?.();
    };
  }, [
    announceBadges,
    getAudio,
    getNextTrack,
    hardStopAll,
    prepareStandbyForTrack,
    prefetchCurrentQueueAlbumSession,
    promoteStandby,
  ]);

  React.useEffect(() => {
    const a = getActiveAudio();
    if (!a) return;

    const ms = p.pendingSeekMs;
    if (ms == null) return;

    try {
      a.currentTime = Math.max(0, ms / 1000);
    } catch {
      return;
    }

    pRef.current.clearPendingSeek();
  }, [getActiveAudio, p.seekNonce, p.pendingSeekMs]);

  React.useEffect(() => {
    const a = getActiveAudio();
    if (!a) return;

    if (engineBlockedRef.current) {
      playIntentRef.current = false;
      return;
    }

    if (p.intent === "pause") {
      a.pause();
      pRef.current.clearIntent();
      return;
    }

    if (p.intent === "play") {
      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }

      playIntentRef.current = true;

      void a.play().then(
        () => {
          playIntentRef.current = false;
          pRef.current.clearIntent();
        },
        () => {
          playIntentRef.current = true;
          void attachActiveTrack();
        },
      );
    }
  }, [attachActiveTrack, getActiveAudio, p.intent]);

  React.useEffect(() => {
    if (!hasMediaSession()) return;

    const player = pRef.current;
    const cur = player.current;

    const title = cur?.title?.trim() || cur?.recordingId || "Angelfish Records";
    const artist =
      cur?.artist?.trim() ||
      player.queueContextArtist?.trim() ||
      "Angelfish Records";
    const album = player.queueContextTitle?.trim() || undefined;
    const artworkUrl = player.queueContextArtworkUrl?.trim() || "";

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: artworkUrl
          ? [
              {
                src: artworkUrl,
                sizes: "512x512",
                type: "image/jpeg",
              },
            ]
          : [],
      });
    } catch {}

    try {
      navigator.mediaSession.playbackState =
        p.status === "playing"
          ? "playing"
          : p.status === "paused" || p.status === "idle"
            ? "paused"
            : "none";
    } catch {}

    const setHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    };

    setHandler("play", () => {
      if (engineBlockedRef.current) return;
      void prefetchCurrentQueueAlbumSession();
      pRef.current.play();
      window.dispatchEvent(new Event("af:play-intent"));
    });

    setHandler("pause", () => {
      pRef.current.pause();
    });

    setHandler("previoustrack", () => {
      if (engineBlockedRef.current) return;
      void prefetchCurrentQueueAlbumSession();
      pRef.current.prev();
      window.dispatchEvent(new Event("af:play-intent"));
    });

    setHandler("nexttrack", () => {
      if (engineBlockedRef.current) return;
      void prefetchCurrentQueueAlbumSession();
      pRef.current.next();
      window.dispatchEvent(new Event("af:play-intent"));
    });

    setHandler("seekbackward", (details) => {
      const offsetSec =
        typeof details.seekOffset === "number" &&
        Number.isFinite(details.seekOffset)
          ? details.seekOffset
          : 10;
      pRef.current.seek(
        Math.max(0, pRef.current.positionMs - offsetSec * 1000),
      );
    });

    setHandler("seekforward", (details) => {
      const offsetSec =
        typeof details.seekOffset === "number" &&
        Number.isFinite(details.seekOffset)
          ? details.seekOffset
          : 10;
      pRef.current.seek(pRef.current.positionMs + offsetSec * 1000);
    });

    setHandler("seekto", (details) => {
      if (
        typeof details.seekTime !== "number" ||
        !Number.isFinite(details.seekTime)
      ) {
        return;
      }

      pRef.current.seek(Math.max(0, Math.floor(details.seekTime * 1000)));
    });

    return () => {
      setHandler("play", null);
      setHandler("pause", null);
      setHandler("previoustrack", null);
      setHandler("nexttrack", null);
      setHandler("seekbackward", null);
      setHandler("seekforward", null);
      setHandler("seekto", null);
    };
  }, [
    p.current?.recordingId,
    p.current?.title,
    p.current?.artist,
    p.status,
    p.queueContextTitle,
    p.queueContextArtist,
    p.queueContextArtworkUrl,
    prefetchCurrentQueueAlbumSession,
  ]);

  React.useEffect(() => {
    const player = pRef.current;
    const curId = player.current?.recordingId ?? "";
    const durMs =
      (curId ? player.durationByRecordingId[curId] : 0) ||
      player.current?.durationMs ||
      0;

    if (durMs <= 0) return;

    setMediaSessionPositionStateSafe({
      durationSec: durMs / 1000,
      positionSec: p.positionMs / 1000,
      playbackRate: 1,
    });
  }, [
    p.current?.recordingId,
    p.current?.durationMs,
    p.durationByRecordingId,
    p.positionMs,
  ]);

  React.useEffect(() => {
    const resume = () => {
      if (engineBlockedRef.current) return;

      void prefetchCurrentQueueAlbumSession();

      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }

      playIntentRef.current = true;

      const a = getActiveAudio();
      if (a) {
        void a.play().catch(() => {
          void attachActiveTrack();
        });
      }
    };

    window.addEventListener("af:play-intent", resume);
    return () => window.removeEventListener("af:play-intent", resume);
  }, [attachActiveTrack, getActiveAudio, prefetchCurrentQueueAlbumSession]);

  return (
    <>
      <audio
        ref={audioARef}
        crossOrigin="anonymous"
        preload="metadata"
        playsInline
        style={{ display: "none" }}
      />
      <audio
        ref={audioBRef}
        crossOrigin="anonymous"
        preload="metadata"
        playsInline
        style={{ display: "none" }}
      />
    </>
  );
}
