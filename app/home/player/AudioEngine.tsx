// web/app/home/player/AudioEngine.tsx
"use client";

import React from "react";
import Hls from "hls.js";
import { usePlayer } from "./PlayerState";
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

function canPlayNativeHls(a: HTMLMediaElement) {
  return a.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function newPlaybackSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

type AudioDebugEvent = {
  t: number;
  event: string;
  albumId?: string | null;
  recordingId?: string | null;
  playbackId?: string | null;
  source?: string | null;
  detail?: string | null;
};

const audioDebugSessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

  const event: AudioDebugEvent = {
    t: Math.floor(performance.now()),
    ...payload,
  };

  audioDebugBuffer.push(event);

  try {
    console.info("[audio-debug]", {
      sessionId: audioDebugSessionId,
      ...event,
    });
  } catch {}

  const urgent =
    payload.event.includes("ended") ||
    payload.event.includes("rejected") ||
    payload.event.includes("error") ||
    payload.event.includes("next") ||
    payload.event.includes("attach");

  flushAudioDebugSoon(urgent);
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
  } catch {
    // Some browsers throw if duration is missing/zero or state is unsupported.
  }
}

export default function AudioEngine() {
  const p = usePlayer();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const { reportGate, clearGate } = useGateBroker();
  const { announceBadges } = useBadgeAwardOverlay();

  const hlsRef = React.useRef<Hls | null>(null);
  const tokenAbortRef = React.useRef<AbortController | null>(null);
  const albumSessionAbortRef = React.useRef<AbortController | null>(null);
  const loadSeq = React.useRef(0);

  // Distinct from muxPlaybackId:
  // this is a fresh per-listen session id used for telemetry dedupe.
  const telemetrySessionIdRef = React.useRef<string | null>(null);

  const telemetryPlaySentRef = React.useRef(new Set<string>());
  const telemetryPlayAccumulatedMsRef = React.useRef(new Map<string, number>());
  const telemetryPlayLastProgressMsRef = React.useRef(
    new Map<string, number>(),
  );
  const telemetryProgressSentRef = React.useRef(new Set<string>());
  const telemetryCompleteSentRef = React.useRef(new Set<string>());

  const nearEndWarmKeyRef = React.useRef<string | null>(null);

  const srcNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null);

  // ---- Audio analysis ----
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  type U8AB = Uint8Array<ArrayBuffer>;
  const freqDataRef = React.useRef<U8AB | null>(null);
  const timeDataRef = React.useRef<U8AB | null>(null);

  // ---- Playback intent ----
  const playIntentRef = React.useRef(false);
  const playthroughSentRef = React.useRef(new Set<string>()); // key: `${recordingId}:${playbackId}`
  const TELEMETRY_PLAY_THRESHOLD_MS = 5_000;
  const TELEMETRY_PROGRESS_STEP_MS = 15_000;

  // Track attachment bookkeeping
  const attachedKeyRef = React.useRef<string | null>(null);
  const tokenCacheRef = React.useRef(
    new Map<string, { token: string; expiresAtMs: number }>(),
  );
  const albumSessionCacheRef = React.useRef(
    new Map<string, AlbumSessionCacheEntry>(),
  );
  const albumSessionInFlightRef = React.useRef(
    new Map<string, Promise<boolean>>(),
  );
  const blockedNonceRef = React.useRef(new Map<string, number>()); // playbackId -> reloadNonce at time of block

  // NEW: local invariant flag (since PlayerState is no longer the gating channel)
  const engineBlockedRef = React.useRef(false);

  const pRef = React.useRef(p);
  React.useEffect(() => {
    pRef.current = p;
  }, [p]);

  /* ---------------- helpers ---------------- */

  const hardStopAndDetach = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;

    // stop any in-flight token request
    try {
      tokenAbortRef.current?.abort();
    } catch {}
    tokenAbortRef.current = null;

    try {
      a.pause();
    } catch {}

    // teardown HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    attachedKeyRef.current = null;
    telemetrySessionIdRef.current = null;

    try {
      a.removeAttribute("src");
    } catch {}
    try {
      a.load();
    } catch {}
  }, []);

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
      return `${albumId.trim()}::st=${st ?? ""}`;
    },
    [],
  );

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
      const albumId = (args.albumId ?? "").trim();
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
      const albumId = (s.queueContextId ?? "").trim();
      if (!albumId) return false;

      return prefetchAlbumSession({
        albumId,
        st: getShareTokenFromLocation(),
        signal,
      });
    },
    [getShareTokenFromLocation, prefetchAlbumSession],
  );

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

      // If engine says ok, clear only the relevant domain channel.
      if (domain === "playback") clearPlaybackGate();
      else clearGate({ domain });
    },
    [clearGate, clearPlaybackGate, inferIntentForGate, reportGate],
  );

  const reportLocalPlaybackErrorAsGate = React.useCallback(
    (code: GateCodeRaw, message: string, corr?: string | null) => {
      // This is a client-only failure (unsupported HLS / fatal decode).
      // We still route it through GateBroker so PortalArea can spotlight/blur consistently.
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

  // ---- Final unmount cleanup (tab-lifetime leaks: AudioContext + WebAudio graph + HLS) ----
  React.useEffect(() => {
    // Snapshot ref values NOW so cleanup doesn’t read mutable .current later.
    const a = audioRef.current;
    const hls = hlsRef.current;
    const analyser = analyserRef.current;
    const srcNode = srcNodeRef.current;
    const ctx = audioCtxRef.current;

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

    const tokenAbort = tokenAbortRef.current;

    return () => {
      try {
        tokenAbort?.abort();
      } catch {}
      tokenAbortRef.current = null;

      try {
        albumSessionAbortRef.current?.abort();
      } catch {}
      albumSessionAbortRef.current = null;

      if (hls) {
        try {
          hls.destroy();
        } catch {}
      }
      hlsRef.current = null;
      telemetrySessionIdRef.current = null;

      if (a) {
        try {
          a.pause();
        } catch {}
        try {
          a.removeAttribute("src");
        } catch {}
        try {
          a.load();
        } catch {}
      }

      try {
        analyser?.disconnect();
      } catch {}
      analyserRef.current = null;

      try {
        srcNode?.disconnect();
      } catch {}
      srcNodeRef.current = null;

      freqDataRef.current = null;
      timeDataRef.current = null;

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
  }, []);

  /* ---------------- global "blocked means SILENCE" invariant ---------------- */
  React.useEffect(() => {
    if (!engineBlockedRef.current) return;
    playIntentRef.current = false;
    hardStopAndDetach();
    mediaSurface.setStatus("blocked");
  }, [hardStopAndDetach]);

  /* ---------------- AudioContext + analyser (ONCE) ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    let ctx: AudioContext | null = null;
    let src: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    const ensureAudioGraph = async () => {
      if (audioCtxRef.current) return;

      ctx = new AudioContext();
      audioCtxRef.current = ctx;

      src = ctx.createMediaElementSource(a);
      srcNodeRef.current = src;
      analyser = ctx.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      src.connect(analyser);
      analyser.connect(ctx.destination);

      analyserRef.current = analyser;

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
    return () => {
      window.removeEventListener("af:play-intent", onUserGesture);
    };
  }, []);

  /* ---------------- Audio feature pump ---------------- */

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

      let bass = 0,
        mid = 0,
        treble = 0;
      for (let i = 0; i < n; i++) {
        const v = freq[i]! / 255;
        if (i < bassEnd) bass += v;
        else if (i < midEnd) mid += v;
        else treble += v;
      }

      bass /= bassEnd || 1;
      mid /= midEnd - bassEnd || 1;
      treble /= n - midEnd || 1;

      let weighted = 0,
        total = 0;
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

  /* ---------------- Volume / mute ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = Math.max(0, Math.min(1, p.volume));
    a.muted = p.muted;
  }, [p.volume, p.muted]);

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

  /* ---------------- Active queue album-session prefetch ---------------- */

  React.useEffect(() => {
    const albumId = (p.queueContextId ?? "").trim();
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

  /* ---------------- Album-session prefetch bridge ---------------- */

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
        typeof detail?.albumId === "string" ? detail.albumId.trim() : "";
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

  /* ---------------- Track attach (HLS / native) ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    a.crossOrigin = "anonymous";

    const s = pRef.current;
    const playbackId = s.current?.muxPlaybackId;
    if (!playbackId) return;

    mediaSurface.setTrack(s.current?.recordingId ?? null);

    // If the engine is blocked, never attach.
    if (engineBlockedRef.current) return;

    const armed =
      s.status === "loading" ||
      s.status === "playing" ||
      playIntentRef.current ||
      s.intent === "play" ||
      s.reloadNonce > 0;

    if (!armed) return;

    const blockedAt = blockedNonceRef.current.get(playbackId);
    if (blockedAt === s.reloadNonce) {
      playIntentRef.current = false;
      hardStopAndDetach();
      mediaSurface.setStatus("blocked");
      return;
    }

    const attachKey = `${playbackId}:${s.reloadNonce}`;
    if (
      attachedKeyRef.current === attachKey &&
      (a.currentSrc || hlsRef.current)
    ) {
      return;
    }

    // Critical invariant:
    // when switching to a new track/source, silence the old media element
    // before any async token fetch or HLS attachment work begins.
    // Otherwise the previous track can continue audibly during the server round-trip.
    hardStopAndDetach();

    attachedKeyRef.current = null;
    telemetrySessionIdRef.current = newPlaybackSessionId();

    const recordingId = s.current?.recordingId ?? "";
    const sessionId = telemetrySessionIdRef.current;
    if (recordingId && sessionId) {
      const sessionKey = `${recordingId}:${sessionId}`;
      telemetryPlayAccumulatedMsRef.current.delete(sessionKey);
      telemetryPlayLastProgressMsRef.current.delete(sessionKey);
    }

    const seq = ++loadSeq.current;

    mediaSurface.setStatus("loading");
    pRef.current.setStatusExternal("loading");

    const cachedBeforeAttach = getCachedTokenForPlaybackId(playbackId);
    pRef.current.setLoadingReasonExternal(
      cachedBeforeAttach ? "attach" : "token",
    );

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    tokenAbortRef.current?.abort();
    const ac = new AbortController();
    tokenAbortRef.current = ac;

    const hardResetElement = () => {
      try {
        a.pause();
      } catch {}
      try {
        a.removeAttribute("src");
      } catch {}
      try {
        a.load();
      } catch {}
    };

    const attachSrc = (srcUrl: string) => {
      sendAudioDebug({
        event: "attach-src-called",
        albumId: s.queueContextId ?? null,
        recordingId: s.current?.recordingId ?? null,
        playbackId,
        source: "AudioEngine",
        detail: `seq=${seq};active=${loadSeq.current}`,
      });

      if (seq !== loadSeq.current) return;

      hardResetElement();
      if (seq !== loadSeq.current) return;

      if (canPlayNativeHls(a)) {
        a.src = srcUrl;
        a.load();
      } else {
        if (!Hls.isSupported()) {
          reportLocalPlaybackErrorAsGate(
            "INVALID_REQUEST",
            "This browser cannot play HLS.",
          );
          mediaSurface.setStatus("blocked");
          hardStopAndDetach();
          return;
        }

        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;

        hls.on(Hls.Events.ERROR, (_e, err) => {
          if (err?.fatal) {
            reportLocalPlaybackErrorAsGate(
              "INVALID_REQUEST",
              `HLS fatal: ${err.details ?? "error"}`,
            );
            mediaSurface.setStatus("blocked");
            hardStopAndDetach();
          }
        });

        hls.loadSource(srcUrl);
        hls.attachMedia(a);
      }

      attachedKeyRef.current = attachKey;

      if (playIntentRef.current) {
        void a.play().then(
          () => {
            sendAudioDebug({
              event: "attach-play-resolved",
              albumId: s.queueContextId ?? null,
              recordingId: s.current?.recordingId ?? null,
              playbackId,
              source: "AudioEngine",
            });
            playIntentRef.current = false;
          },
          (err: unknown) => {
            sendAudioDebug({
              event: "attach-play-rejected",
              albumId: s.queueContextId ?? null,
              recordingId: s.current?.recordingId ?? null,
              playbackId,
              source: "AudioEngine",
              detail:
                err instanceof Error
                  ? `${err.name}: ${err.message}`
                  : "unknown",
            });
            playIntentRef.current = true;
          },
        );
      }
    };

    const load = async () => {
      try {
        const cached =
          cachedBeforeAttach ?? getCachedTokenForPlaybackId(playbackId);
        if (cached) {
          sendAudioDebug({
            event: "cached-token-attach",
            albumId: s.queueContextId ?? null,
            recordingId: s.current?.recordingId ?? null,
            playbackId,
            source: "AudioEngine",
          });

          attachSrc(muxSignedHlsUrl(playbackId, cached.token));
          return;
        }

        const st = getShareTokenFromLocation();

        if (s.queueContextId) {
          await prefetchAlbumSession({
            albumId: s.queueContextId,
            st,
            signal: ac.signal,
          });

          const albumCached = getCachedTokenForPlaybackId(playbackId);
          if (albumCached) {
            sendAudioDebug({
              event: "album-session-token-attach",
              albumId: s.queueContextId ?? null,
              recordingId: s.current?.recordingId ?? null,
              playbackId,
              source: "AudioEngine",
            });

            attachSrc(muxSignedHlsUrl(playbackId, albumCached.token));
            return;
          }

          sendAudioDebug({
            event: "album-session-miss-fallback-single-token",
            albumId: s.queueContextId ?? null,
            recordingId: s.current?.recordingId ?? null,
            playbackId,
            source: "AudioEngine",
          });
        }

        const res = await fetch("/api/mux/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playbackId,
            recordingId: s.current?.recordingId,
            albumId: s.queueContextId,
            albumSlug: s.queueContextSlug,
            durationMs:
              s.current?.durationMs ??
              s.durationByRecordingId?.[s.current?.recordingId ?? ""],
            ...(st ? { st } : {}),
          }),
          signal: ac.signal,
        });

        const corr = res.headers.get("x-correlation-id") ?? null;

        let data: TokenResponse | null = null;
        try {
          data = (await res.json()) as TokenResponse;
        } catch {
          data = null;
        }

        // ----- GATED / ERROR PATH -----
        if (!res.ok || !data || !("ok" in data) || data.ok !== true) {
          const gatePayloadRaw =
            data && "ok" in data && data.ok === false
              ? (data.gate ?? null)
              : null;

          const msg =
            gatePayloadRaw?.message?.trim() ||
            (data && "ok" in data && data.ok === false ? data.error : "") ||
            `Token error (${res.status})`;

          hardStopAndDetach();
          blockedNonceRef.current.set(playbackId, s.reloadNonce);
          playIntentRef.current = false;

          if (gatePayloadRaw) {
            // Be defensive: payload from server might have drift during migration.
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
            // No payload => don’t invent policy; just clear broker.
            clearPlaybackGate();
          }

          mediaSurface.setStatus("blocked");
          return;
        }

        const expiresAtMs =
          typeof data.expiresAt === "number"
            ? data.expiresAt * 1000
            : Date.parse(String(data.expiresAt));

        if (Number.isFinite(expiresAtMs)) {
          tokenCacheRef.current.set(playbackId, {
            token: data.token,
            expiresAtMs,
          });
        }

        blockedNonceRef.current.delete(playbackId);

        // Token success implies we’re no longer blocked (broker channel).
        clearPlaybackGate();

        sendAudioDebug({
          event: "single-token-attach",
          albumId: s.queueContextId ?? null,
          recordingId: s.current?.recordingId ?? null,
          playbackId,
          source: "AudioEngine",
        });

        attachSrc(muxSignedHlsUrl(playbackId, data.token));
      } catch {
        // ignore (abort / transient)
      }
    };

    void load();
    return () => ac.abort();
  }, [
    p.current?.recordingId,
    p.current?.muxPlaybackId,
    p.reloadNonce,
    p.intent,
    p.status,
    hardStopAndDetach,
    clearPlaybackGate,
    reportPlaybackGate,
    reportLocalPlaybackErrorAsGate,
    getCachedTokenForPlaybackId,
    getShareTokenFromLocation,
    prefetchAlbumSession,
  ]);

  /* ---------------- Media element -> time + duration + state ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

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

    const onTime = () => {
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

      if (durMs > 0) {
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
        if (remainingMs > 0 && remainingMs <= 30_000) {
          const warmKey = `${curId}:${telemetrySessionIdRef.current ?? ""}`;
          if (warmKey && nearEndWarmKeyRef.current !== warmKey) {
            nearEndWarmKeyRef.current = warmKey;
            void prefetchCurrentQueueAlbumSession();
          }
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
      }
    };

    const onLoadedMeta = () => {
      const d = a.duration;
      if (Number.isFinite(d) && d > 0) {
        pRef.current.setDurationMs(Math.floor(d * 1000));
      }
    };

    const applyPendingSeek = () => {
      const ms = pRef.current.pendingSeekMs;
      if (ms == null) return;
      try {
        a.currentTime = Math.max(0, ms / 1000);
      } catch {}
      pRef.current.clearPendingSeek();
    };

    const debugMediaEvent = (event: string, detail?: string) => {
      sendAudioDebug({
        event,
        albumId: pRef.current.queueContextId ?? null,
        recordingId: pRef.current.current?.recordingId ?? null,
        playbackId: pRef.current.current?.muxPlaybackId ?? null,
        source: "AudioEngine.media",
        detail:
          detail ??
          `readyState=${a.readyState};networkState=${a.networkState};currentTime=${a.currentTime.toFixed(
            2,
          )};duration=${Number.isFinite(a.duration) ? a.duration.toFixed(2) : "NaN"}`,
      });
    };

    const markPlaying = () => {
      debugMediaEvent("media-playing");

      if (engineBlockedRef.current) {
        hardStopAndDetach();
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
      applyPendingSeek();
      const curId = pRef.current.current?.recordingId;
      if (curId) pRef.current.resolvePendingTrack(curId);
    };

    const markPaused = () => {
      debugMediaEvent("media-paused");

      if (a.ended) {
        sendAudioDebug({
          event: "media-paused-at-ended-ignored",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: pRef.current.current?.recordingId ?? null,
          playbackId: pRef.current.current?.muxPlaybackId ?? null,
          source: "AudioEngine.media",
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

    const markBuffering = () => {
      debugMediaEvent("media-buffering");
      if (engineBlockedRef.current) return;

      const s = pRef.current;
      const shouldBePlaying =
        s.intent === "play" || s.status === "playing" || s.status === "loading";
      if (!shouldBePlaying) return;

      mediaSurface.setStatus("loading");
      s.setStatusExternal("loading");
      s.setLoadingReasonExternal("buffering");
    };

    const clearBuffering = () => {
      debugMediaEvent("media-buffering-cleared");
      if (engineBlockedRef.current) return;
      pRef.current.setLoadingReasonExternal(undefined);
      applyPendingSeek();
    };

    const onEnded = () => {
      debugMediaEvent("media-ended");

      const s = pRef.current;
      const cur = s.current;

      const idx = cur
        ? s.queue.findIndex((t) => t.recordingId === cur.recordingId)
        : -1;
      const nextTrack =
        idx >= 0 && idx + 1 < s.queue.length ? s.queue[idx + 1] : null;

      sendAudioDebug({
        event: "ended-fired",
        albumId: s.queueContextId ?? null,
        recordingId: cur?.recordingId ?? null,
        playbackId: cur?.muxPlaybackId ?? null,
        source: "AudioEngine",
        detail: nextTrack
          ? `next=${nextTrack.recordingId}`
          : `next=null;idx=${idx};queue=${s.queue.length};repeat=${s.repeat}`,
      });

      reportPlaythroughComplete(1);

      playIntentRef.current = true;
      void prefetchCurrentQueueAlbumSession();

      s.next();

      sendAudioDebug({
        event: "next-dispatched-from-ended",
        albumId: s.queueContextId ?? null,
        recordingId: cur?.recordingId ?? null,
        playbackId: cur?.muxPlaybackId ?? null,
        source: "AudioEngine",
      });
    };

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoadedMeta);
    a.addEventListener("playing", markPlaying);
    a.addEventListener("pause", markPaused);
    a.addEventListener("waiting", markBuffering);
    a.addEventListener("stalled", markBuffering);
    const onMediaError = () => {
      const err = a.error;
      debugMediaEvent(
        "media-error",
        err ? `code=${err.code};message=${err.message}` : "unknown",
      );
    };

    const onSuspend = () => debugMediaEvent("media-suspend");
    const onAbort = () => debugMediaEvent("media-abort");
    const onEmptied = () => debugMediaEvent("media-emptied");

    a.addEventListener("canplay", clearBuffering);
    a.addEventListener("canplaythrough", clearBuffering);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onMediaError);
    a.addEventListener("suspend", onSuspend);
    a.addEventListener("abort", onAbort);
    a.addEventListener("emptied", onEmptied);

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoadedMeta);
      a.removeEventListener("playing", markPlaying);
      a.removeEventListener("pause", markPaused);
      a.removeEventListener("waiting", markBuffering);
      a.removeEventListener("stalled", markBuffering);
      a.removeEventListener("canplay", clearBuffering);
      a.removeEventListener("canplaythrough", clearBuffering);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onMediaError);
      a.removeEventListener("suspend", onSuspend);
      a.removeEventListener("abort", onAbort);
      a.removeEventListener("emptied", onEmptied);
    };
  }, [hardStopAndDetach, announceBadges, prefetchCurrentQueueAlbumSession]);

  /* ---------------- Seek: PlayerState -> media element ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const ms = p.pendingSeekMs;
    if (ms == null) return;

    try {
      a.currentTime = Math.max(0, ms / 1000);
    } catch {
      return;
    }

    pRef.current.clearPendingSeek();
  }, [p.seekNonce, p.pendingSeekMs]);

  /* ---------------- Intent -> media element ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
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

      void a.play().then(
        () => pRef.current.clearIntent(),
        () => {
          playIntentRef.current = true;
        },
      );
    }
  }, [p.intent]);

  /* ---------------- Media Session metadata / lock-screen controls ---------------- */

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
    } catch {
      // Metadata is enhancement-only.
    }

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
      } catch {
        // Unsupported action on this browser.
      }
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

  /* ---------------- User gesture bridge ---------------- */

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const resume = () => {
      if (engineBlockedRef.current) return;

      void prefetchCurrentQueueAlbumSession();

      if (audioCtxRef.current?.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      playIntentRef.current = true;
      void a.play().catch(() => {});
    };

    window.addEventListener("af:play-intent", resume);
    return () => window.removeEventListener("af:play-intent", resume);
  }, [prefetchCurrentQueueAlbumSession]);

  return (
    <audio
      ref={audioRef}
      crossOrigin="anonymous"
      preload="metadata"
      playsInline
      style={{ display: "none" }}
    />
  );
}
