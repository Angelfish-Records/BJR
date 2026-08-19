"use client";

import React from "react";
import type Hls from "hls.js";
import { useUser } from "@clerk/nextjs";
import { usePlayer } from "./PlayerState";
import type { PlayerTrack } from "@/lib/types";
import { muxSignedHlsUrl, muxSignedStaticAudioUrl } from "@/lib/mux";
import { mediaSurface } from "./mediaSurface";
import { audioSurface } from "./audioSurface";
import {
  averageNormalizedByteSpectrumRange,
  VISUALIZER_AUDIO_FFT_SIZE,
  visualizerAudioBandBins,
} from "./visualizer/audioFeatureBands";
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
      mode?: "full" | "sample";
      sampleSession?: {
        id: string;
        expiresAt: string | number;
        trackCount: number;
      };
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
  hlsPath: "native" | "hlsjs" | "static-m4a";
};

type PreparedStandby = {
  deckId: DeckId;
  recordingId: string;
  playbackId: string;
  attachKey: string;
};

type TargetedPlayIntentDetail = {
  track?: PlayerTrack;
  albumId?: string | null;
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

type HlsJsConstructor = typeof import("hls.js").default;

let hlsConstructorCache: HlsJsConstructor | null = null;
let hlsConstructorPromise: Promise<HlsJsConstructor> | null = null;

function loadHlsConstructor(): Promise<HlsJsConstructor> {
  if (hlsConstructorCache) {
    return Promise.resolve(hlsConstructorCache);
  }

  hlsConstructorPromise ??= import("hls.js")
    .then((module) => {
      hlsConstructorCache = module.default;
      return module.default;
    })
    .catch((error: unknown) => {
      hlsConstructorPromise = null;
      throw error;
    });

  return hlsConstructorPromise;
}

function getKnownHlsJsSupport(): boolean | null {
  if (!hlsConstructorCache) return null;

  try {
    return hlsConstructorCache.isSupported();
  } catch {
    return null;
  }
}

function shouldUseHlsJsForMediaElement(media: HTMLMediaElement): boolean {
  return !shouldUseStaticM4a() && !shouldUseNativeHls(media);
}

function warmHlsConstructorForMediaElement(
  media: HTMLMediaElement | null,
): void {
  if (!media) return;
  if (!shouldUseHlsJsForMediaElement(media)) return;

  void loadHlsConstructor().catch(() => {
    // Attachment will surface the real playback failure if HLS.js is required.
  });
}

function shouldUseNativeHls(a: HTMLMediaElement): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome|CriOS|Chromium/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !isChrome;

  if (isAndroid) return false;

  return isSafari && a.canPlayType("application/vnd.apple.mpegurl") !== "";
}

const STATIC_M4A_STANDBY_MIN_BUFFER_AHEAD_SEC = 20;
const STATIC_M4A_STANDBY_TIMEOUT_MS = 20_000;

// A tiny, guarded early promotion removes the browser scheduling seam between
// decks. Set this to 0 to retain strictly native-ended handoff behaviour.
const GAPLESS_EARLY_PROMOTION_LEAD_MS = 36;
const GAPLESS_EARLY_PROMOTION_ARM_WINDOW_MS = 800;

function isAppleMobileWebKit(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const isAppleHandheld = /iPad|iPhone|iPod/i.test(ua);
  const isTouchCapableIpadDesktopUa =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return (
    (isAppleHandheld || isTouchCapableIpadDesktopUa) && /AppleWebKit/i.test(ua)
  );
}

function shouldUseStaticM4a(): boolean {
  return isAppleMobileWebKit();
}

function bufferedAheadSeconds(media: HTMLMediaElement): number {
  try {
    const currentTime = Math.max(0, media.currentTime);

    for (let index = 0; index < media.buffered.length; index += 1) {
      const start = media.buffered.start(index);
      const end = media.buffered.end(index);

      if (currentTime >= start && currentTime <= end) {
        return Math.max(0, end - currentTime);
      }
    }

    if (media.buffered.length > 0) {
      return Math.max(
        0,
        media.buffered.end(media.buffered.length - 1) - currentTime,
      );
    }
  } catch {}

  return 0;
}

function readFiniteMediaDurationMs(media: HTMLMediaElement): number {
  const durationSec = media.duration;

  return Number.isFinite(durationSec) && durationSec > 0
    ? Math.round(durationSec * 1000)
    : 0;
}

function isStaticM4aStandbyBuffered(media: HTMLMediaElement): boolean {
  return (
    media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA &&
    bufferedAheadSeconds(media) >= STATIC_M4A_STANDBY_MIN_BUFFER_AHEAD_SEC
  );
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
    navigator.mediaSession !== undefined
  );
}

type MediaSessionArtwork = {
  src: string;
  sizes?: string;
  type?: string;
};

function getMediaSessionArtwork(
  rawArtworkUrl: string | null | undefined,
): MediaSessionArtwork[] {
  const artworkUrl = (rawArtworkUrl ?? "").trim();

  if (!artworkUrl) return [];

  let sourceUrl: URL;

  try {
    sourceUrl = new URL(artworkUrl);
  } catch {
    return [];
  }

  // The album artwork currently comes from Sanity's CDN. Supplying several
  // correctly described JPEG variants gives iOS a clean, native-friendly
  // choice for Now Playing and the lock screen.
  if (sourceUrl.hostname !== "cdn.sanity.io") {
    return [{ src: sourceUrl.toString() }];
  }

  const sizes = [96, 128, 192, 256, 384, 512, 1024];

  return sizes.map((size) => {
    const url = new URL(sourceUrl.toString());

    url.searchParams.set("w", String(size));
    url.searchParams.set("h", String(size));
    url.searchParams.set("fit", "crop");
    url.searchParams.set("crop", "center");
    url.searchParams.set("fm", "jpg");
    url.searchParams.set("q", "85");
    url.searchParams.set("cs", "srgb");

    return {
      src: url.toString(),
      sizes: `${size}x${size}`,
      type: "image/jpeg",
    };
  });
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

const AUDIO_DEBUG_STORAGE_KEY = "af:audio-debug:v1";
const AUDIO_DEBUG_STORAGE_LIMIT = 240;

const audioDebugMemoryBuffer: AudioDebugEvent[] = [];
let audioDebugFlushTimer: number | null = null;
let audioDebugFlushInFlight = false;

function isStoredAudioDebugEvent(value: unknown): value is AudioDebugEvent {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.t === "number" &&
    Number.isFinite(candidate.t) &&
    typeof candidate.event === "string"
  );
}

function readPersistedAudioDebugEvents(): AudioDebugEvent[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(AUDIO_DEBUG_STORAGE_KEY);

    if (!raw?.trim()) return [];

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(isStoredAudioDebugEvent)
      .slice(-AUDIO_DEBUG_STORAGE_LIMIT);
  } catch {
    return null;
  }
}

function writePersistedAudioDebugEvents(events: AudioDebugEvent[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(
      AUDIO_DEBUG_STORAGE_KEY,
      JSON.stringify(events.slice(-AUDIO_DEBUG_STORAGE_LIMIT)),
    );
    return true;
  } catch {
    return false;
  }
}

function appendAudioDebugEvent(event: AudioDebugEvent): void {
  const persisted = readPersistedAudioDebugEvents();

  if (
    persisted !== null &&
    writePersistedAudioDebugEvents([...persisted, event])
  ) {
    return;
  }

  audioDebugMemoryBuffer.push(event);

  if (audioDebugMemoryBuffer.length > AUDIO_DEBUG_STORAGE_LIMIT) {
    audioDebugMemoryBuffer.splice(
      0,
      audioDebugMemoryBuffer.length - AUDIO_DEBUG_STORAGE_LIMIT,
    );
  }
}

function takeAudioDebugEvents(): AudioDebugEvent[] {
  const persisted = readPersistedAudioDebugEvents();

  if (persisted !== null) {
    if (writePersistedAudioDebugEvents([])) {
      return persisted;
    }

    return persisted;
  }

  return audioDebugMemoryBuffer.splice(0, audioDebugMemoryBuffer.length);
}

function restoreAudioDebugEvents(events: AudioDebugEvent[]): void {
  if (!events.length) return;

  const persisted = readPersistedAudioDebugEvents();

  if (
    persisted !== null &&
    writePersistedAudioDebugEvents([...events, ...persisted])
  ) {
    return;
  }

  audioDebugMemoryBuffer.unshift(...events);

  if (audioDebugMemoryBuffer.length > AUDIO_DEBUG_STORAGE_LIMIT) {
    audioDebugMemoryBuffer.splice(
      AUDIO_DEBUG_STORAGE_LIMIT,
      audioDebugMemoryBuffer.length - AUDIO_DEBUG_STORAGE_LIMIT,
    );
  }
}

function flushAudioDebugSoon(force = false): void {
  if (!audioDebugEnabled()) return;

  const flush = () => {
    audioDebugFlushTimer = null;

    if (audioDebugFlushInFlight) return;

    const events = takeAudioDebugEvents();
    if (!events.length) return;

    audioDebugFlushInFlight = true;

    const restore = () => {
      restoreAudioDebugEvents(events);
    };

    try {
      void fetch("/api/playback/debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: audioDebugSessionId,
          href: window.location.href,
          events,
        }),
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Audio debug request failed (${response.status})`);
          }
        })
        .catch(restore)
        .finally(() => {
          audioDebugFlushInFlight = false;

          if (readPersistedAudioDebugEvents()?.length) {
            flushAudioDebugSoon();
          }
        });
    } catch {
      restore();
      audioDebugFlushInFlight = false;
    }
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

  appendAudioDebugEvent(event);

  if (audioDebugVerboseEnabled()) {
    try {
      console.info("[audio-debug]", {
        sessionId: audioDebugSessionId,
        ...event,
      });
    } catch {}
  }

  // Batch diagnostics after the playback-critical call stack has completed.
  // Immediate per-event fetches can perturb timing-sensitive mobile playback.
  flushAudioDebugSoon();
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

type SharePlaybackAttribution = {
  context: string;
  scopeId: string;
};

function readQueueSharePlaybackAttribution(queue: {
  queueSharePlaybackContext?: string | null;
  queueSharePlaybackScopeId?: string | null;
}): SharePlaybackAttribution | null {
  const context = queue.queueSharePlaybackContext?.trim() ?? "";
  const scopeId = queue.queueSharePlaybackScopeId?.trim() ?? "";

  if (!context.startsWith("stpc1.") || context.length > 900) {
    return null;
  }

  if (!/^alb:[^\s]+$/i.test(scopeId)) {
    return null;
  }

  return { context, scopeId };
}

type PlaybackTokenCacheEntry = {
  token: string;
  expiresAtMs: number;
};

type AnonSampleSession = {
  id: string;
  expiresAtMs: number;
  playbackIds: ReadonlySet<string>;
};

function parsePlaybackExpiryMs(value: string | number): number {
  return typeof value === "number"
    ? value * 1000
    : Date.parse(String(value));
}

function isAlbumSessionAuthorityCompatible(args: {
  isUserLoaded: boolean;
  isSignedIn: boolean | undefined;
  currentShareToken: string | null;
  mode: "full" | "sample";
}): boolean {
  if (!args.isUserLoaded) return true;

  const expectsFullAuthority =
    args.isSignedIn === true || args.currentShareToken !== null;

  return args.mode === "full"
    ? expectsFullAuthority
    : !expectsFullAuthority;
}

function cacheSessionTrackTokens(
  tracks: AlbumSessionToken[],
  tokenCache: Map<string, PlaybackTokenCacheEntry>,
): Map<string, PlaybackTokenCacheEntry> {
  const byPlaybackId = new Map<string, PlaybackTokenCacheEntry>();

  for (const track of tracks) {
    const playbackId = (track.playbackId ?? "").trim();
    const token = (track.token ?? "").trim();
    const expiresAtMs = parsePlaybackExpiryMs(track.expiresAt);

    if (!playbackId || !token || !Number.isFinite(expiresAtMs)) {
      continue;
    }

    const entry = { token, expiresAtMs };
    byPlaybackId.set(playbackId, entry);
    tokenCache.set(playbackId, entry);
  }

  return byPlaybackId;
}

function buildAnonSampleSession(
  sampleSession: { id: string; expiresAt: string | number } | null | undefined,
  byPlaybackId: Map<string, PlaybackTokenCacheEntry>,
): AnonSampleSession | null {
  if (!sampleSession) return null;

  const expiresAtMs = parsePlaybackExpiryMs(sampleSession.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return null;

  return {
    id: sampleSession.id,
    expiresAtMs,
    playbackIds: new Set(byPlaybackId.keys()),
  };
}

function resolvePlaybackAuthorityKey(
  isUserLoaded: boolean,
  isSignedIn: boolean | undefined,
): "loading" | "signed" | "anonymous" {
  if (!isUserLoaded) return "loading";
  return isSignedIn === true ? "signed" : "anonymous";
}

function resolveDeckHlsPath(
  useStaticM4a: boolean,
  useNativeHls: boolean,
): DeckMeta["hlsPath"] {
  if (useStaticM4a) return "static-m4a";
  return useNativeHls ? "native" : "hlsjs";
}

function mediaSessionPlaybackStateForStatus(
  status: string,
): MediaSessionPlaybackState {
  if (status === "playing") return "playing";
  if (status === "paused" || status === "idle") return "paused";
  return "none";
}

function createBooleanSettler(args: {
  resolve: (ok: boolean) => void;
  cleanup?: () => void;
  onSuccess?: () => void;
}): (ok: boolean) => void {
  let settled = false;

  return (ok: boolean) => {
    if (settled) return;
    settled = true;
    args.cleanup?.();
    if (ok) args.onSuccess?.();
    args.resolve(ok);
  };
}

export default function AudioEngine() {
  const p = usePlayer();
  const { isLoaded: isUserLoaded, isSignedIn } = useUser();

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
  const telemetryShareAttributionRef =
    React.useRef<SharePlaybackAttribution | null>(null);

  const nearEndWarmKeyRef = React.useRef<string | null>(null);
  const debugProgressHeartbeatRef = React.useRef<string | null>(null);
  const staticM4aProgressProofRef = React.useRef<string | null>(null);
  const autoAdvanceKeyRef = React.useRef<string | null>(null);
  const suppressPauseDeckRef = React.useRef<DeckId | null>(null);
  const programmaticPauseCountByDeckRef = React.useRef<Record<DeckId, number>>({
    a: 0,
    b: 0,
  });

  const srcNodeByDeckRef = React.useRef<
    Record<DeckId, MediaElementAudioSourceNode | null>
  >({
    a: null,
    b: null,
  });

  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const audioCtxStateCleanupRef = React.useRef<(() => void) | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  type U8AB = Uint8Array<ArrayBuffer>;
  const freqDataRef = React.useRef<U8AB | null>(null);
  const timeDataRef = React.useRef<U8AB | null>(null);
  const [audioAnalysisReady, setAudioAnalysisReady] = React.useState(false);

  const playIntentRef = React.useRef(false);
  const telemetryCompleteInFlightRef = React.useRef(
    new Map<string, Promise<boolean>>(),
  );
  const TELEMETRY_PLAY_THRESHOLD_MS = 5_000;
  const TELEMETRY_PROGRESS_STEP_MS = 15_000;

  // Mobile data needs a much longer runway than Wi-Fi for HLS standby preparation.
  // The next deck should be ready well before the end, but the outgoing media
  // element remains authoritative for its own final sample.
  const STANDBY_PREPARE_WINDOW_MS = 90_000;

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

  const anonSampleSessionRef = React.useRef<{
    id: string;
    expiresAtMs: number;
    playbackIds: ReadonlySet<string>;
  } | null>(null);
  const anonymousCapReachedRef = React.useRef(false);

  const engineBlockedRef = React.useRef(false);
  const lastPlaybackGateRef = React.useRef<GatePayload | null>(null);
  const resumeAfterAuthTrackRef = React.useRef<PlayerTrack | null>(null);

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

  const sendRuntimeSnapshot = React.useCallback(
    (event: string, reason?: string) => {
      const activeDeck = activeDeckRef.current;
      const audio = getAudio(activeDeck);
      const meta = metaByDeckRef.current[activeDeck];
      const context = audioCtxRef.current;

      let bufferedEndSec: number | null = null;

      try {
        if (audio && audio.buffered.length > 0) {
          bufferedEndSec = audio.buffered.end(audio.buffered.length - 1);
        }
      } catch {
        bufferedEndSec = null;
      }

      const snapshot = {
        epochMs: Date.now(),
        reason: reason ?? null,
        visibility:
          typeof document === "undefined" ? null : document.visibilityState,
        activeDeck,
        hlsPath: meta?.hlsPath ?? null,
        audioOutputMode: context ? "web-audio" : "direct-media",
        audioContextState: context?.state ?? null,
        mediaCurrentTimeSec:
          audio && Number.isFinite(audio.currentTime)
            ? audio.currentTime
            : null,
        mediaDurationSec:
          audio && Number.isFinite(audio.duration) ? audio.duration : null,
        mediaPaused: audio?.paused ?? null,
        mediaEnded: audio?.ended ?? null,
        mediaReadyState: audio?.readyState ?? null,
        mediaNetworkState: audio?.networkState ?? null,
        mediaBufferedEndSec: bufferedEndSec,
        mediaErrorCode: audio?.error?.code ?? null,
        mediaErrorMessage: audio?.error?.message ?? null,
        nativeHlsCanPlay:
          audio?.canPlayType("application/vnd.apple.mpegurl") ?? null,
        alternateNativeHlsCanPlay:
          audio?.canPlayType("application/x-mpegURL") ?? null,
        hlsJsLoaded: hlsConstructorCache !== null,
        hlsJsSupported: getKnownHlsJsSupport(),
      };

      sendAudioDebug({
        event,
        albumId: pRef.current.queueContextId ?? null,
        recordingId:
          meta?.recordingId ?? pRef.current.current?.recordingId ?? null,
        playbackId:
          meta?.playbackId ?? pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${activeDeck}`,
        detail: JSON.stringify(snapshot),
      });
    },
    [getAudio],
  );

  const getShareTokenFromLocation = React.useCallback((): string | null => {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
    } catch {
      return null;
    }
  }, []);

  const hasActiveAnonSampleSession = React.useCallback((): boolean => {
    const sample = anonSampleSessionRef.current;

    return Boolean(sample && Date.now() < sample.expiresAtMs - 5_000);
  }, []);

  const shouldPurgeContinuityCaches = React.useCallback((): boolean => {
    // Do not purge a signed-in session while Clerk is resolving after hydration,
    // route movement, or a browser resume. An active bounded anon sample is also
    // a legitimate continuity session until its server-defined expiry.
    return (
      isUserLoaded &&
      isSignedIn !== true &&
      !getShareTokenFromLocation() &&
      !hasActiveAnonSampleSession()
    );
  }, [
    getShareTokenFromLocation,
    hasActiveAnonSampleSession,
    isSignedIn,
    isUserLoaded,
  ]);

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
      playIntentRef.current ||
      s.intent === "play" ||
      s.status === "playing" ||
      s.status === "loading" ||
      (typeof lastAttempt === "number" &&
        Number.isFinite(lastAttempt) &&
        Date.now() - lastAttempt < 12_000);

    return explicitIntent ? ("explicit" as const) : ("passive" as const);
  }, []);

  const clearPlaybackGate = React.useCallback(() => {
    engineBlockedRef.current = false;
    lastPlaybackGateRef.current = null;
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
        lastPlaybackGateRef.current = payload;

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

  const resurfacePlaybackGate = React.useCallback(() => {
    const lastGate = lastPlaybackGateRef.current;

    if (lastGate) {
      reportPlaybackGate(lastGate, lastGate.correlationId ?? null);
      return;
    }

    reportPlaybackGate(
      {
        domain: "playback",
        code: "PLAYBACK_CAP_REACHED",
        action: "login",
        message: "Enter your email address to continue listening.",
        correlationId: null,
      },
      null,
    );
  }, [reportPlaybackGate]);

  const rememberAuthResumeTarget = React.useCallback(
    (track: PlayerTrack, shouldRemember: boolean) => {
      if (!shouldRemember) return;
      if (!engineBlockedRef.current) return;
      if (lastPlaybackGateRef.current?.action !== "login") return;
      if (inferIntentForGate() !== "explicit") return;

      const recordingId = (track.recordingId ?? "").trim();
      const playbackId = (track.muxPlaybackId ?? "").trim();

      if (!recordingId || !playbackId) return;

      resumeAfterAuthTrackRef.current = track;
    },
    [inferIntentForGate],
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

      const expectsPauseEvent = !a.paused;

      if (expectsPauseEvent) {
        programmaticPauseCountByDeckRef.current[deckId] += 1;
      }

      try {
        a.pause();
      } catch {
        if (expectsPauseEvent) {
          programmaticPauseCountByDeckRef.current[deckId] = Math.max(
            0,
            programmaticPauseCountByDeckRef.current[deckId] - 1,
          );
        }
      }

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

  const discardInactiveDeck = React.useCallback((): void => {
    const inactiveDeck = otherDeck(activeDeckRef.current);

    standbyRef.current = null;
    stopDeck(inactiveDeck);
  }, [stopDeck]);

  const revokeAnonymousFuturePlaybackAuthority = React.useCallback((): void => {
    anonymousCapReachedRef.current = true;

    try {
      albumSessionAbortRef.current?.abort();
    } catch {}
    albumSessionAbortRef.current = null;

    try {
      tokenAbortRef.current?.abort();
    } catch {}
    tokenAbortRef.current = null;

    // Invalidate asynchronous standby attachment work, but deliberately leave
    // the currently playing active deck untouched so the third qualified track
    // may finish normally.
    loadSeq.current += 1;

    albumSessionCacheRef.current.clear();
    albumSessionInFlightRef.current.clear();
    tokenCacheRef.current.clear();
    anonSampleSessionRef.current = null;

    discardInactiveDeck();
  }, [discardInactiveDeck]);

  const hardStopAll = React.useCallback(() => {
    try {
      tokenAbortRef.current?.abort();
    } catch {}
    tokenAbortRef.current = null;

    stopDeck("a");
    stopDeck("b");

    standbyRef.current = null;
    telemetrySessionIdRef.current = null;
    telemetryShareAttributionRef.current = null;
    playIntentRef.current = false;
  }, [stopDeck]);

  const cacheAlbumSessionTokens = React.useCallback(
    (args: {
      albumId: string;
      st: string | null;
      mode: "full" | "sample";
      expiresAt: string | number;
      tracks: AlbumSessionToken[];
      sampleSession?: {
        id: string;
        expiresAt: string | number;
      } | null;
    }): boolean => {
      const expiresAtMs = parsePlaybackExpiryMs(args.expiresAt);
      if (!Number.isFinite(expiresAtMs)) return false;

      const currentShareToken = getShareTokenFromLocation();
      const requestedShareToken = args.st?.trim() || null;

      if (currentShareToken !== requestedShareToken) {
        return false;
      }

      if (
        !isAlbumSessionAuthorityCompatible({
          isUserLoaded,
          isSignedIn,
          currentShareToken,
          mode: args.mode,
        })
      ) {
        return false;
      }

      if (args.mode === "sample" && anonymousCapReachedRef.current) {
        return false;
      }

      if (args.mode === "sample") {
        tokenCacheRef.current.clear();
        albumSessionCacheRef.current.clear();
        standbyRef.current = null;
        anonSampleSessionRef.current = null;
      } else {
        anonSampleSessionRef.current = null;
      }

      const byPlaybackId = cacheSessionTrackTokens(
        args.tracks,
        tokenCacheRef.current,
      );

      if (byPlaybackId.size === 0) return false;

      albumSessionCacheRef.current.set(albumSessionKey(args.albumId, args.st), {
        albumId: args.albumId,
        st: args.st,
        expiresAtMs,
        byPlaybackId,
      });

      const sampleSession = buildAnonSampleSession(
        args.sampleSession,
        byPlaybackId,
      );

      if (args.mode === "sample" && sampleSession) {
        anonSampleSessionRef.current = sampleSession;
      }

      return true;
    },
    [albumSessionKey, getShareTokenFromLocation, isSignedIn, isUserLoaded],
  );

  const getCachedTokenForPlaybackId = React.useCallback(
    (playbackId: string): { token: string; expiresAtMs: number } | null => {
      const shareToken = getShareTokenFromLocation();
      const isAnonymousWithoutShare =
        isUserLoaded && isSignedIn !== true && !shareToken;

      if (isAnonymousWithoutShare) {
        if (anonymousCapReachedRef.current) {
          return null;
        }

        const sample = anonSampleSessionRef.current;

        if (
          !sample ||
          Date.now() >= sample.expiresAtMs - 5_000 ||
          !sample.playbackIds.has(playbackId)
        ) {
          return null;
        }
      }

      const direct = tokenCacheRef.current.get(playbackId);
      if (direct && Date.now() < direct.expiresAtMs - 5000) return direct;
      return null;
    },
    [getShareTokenFromLocation, isSignedIn, isUserLoaded],
  );

  const prefetchAlbumSession = React.useCallback(
    async (args: {
      albumId: string | null | undefined;
      st?: string | null;
      startPlaybackId?: string | null;
      signal?: AbortSignal;
      surfaceGate?: boolean;
    }): Promise<boolean> => {
      const albumId = normalizeAlbumId(args.albumId);
      if (!albumId) return false;

      const st = args.st ?? getShareTokenFromLocation();
      const startPlaybackId = args.startPlaybackId?.trim() || null;

      const key = albumSessionKey(albumId, st);

      const cached = albumSessionCacheRef.current.get(key);
      const cachedCoversRequestedTrack =
        !startPlaybackId || cached?.byPlaybackId.has(startPlaybackId) === true;

      if (
        cached &&
        Date.now() < cached.expiresAtMs - 5000 &&
        cachedCoversRequestedTrack
      ) {
        return true;
      }

      // Different requested starts and auth states can produce different server
      // authority decisions. Never collapse them into one in-flight request.
      const authorityKey = resolvePlaybackAuthorityKey(
        isUserLoaded,
        isSignedIn,
      );
      const requestKey = `${key}::authority=${authorityKey}::start=${
        startPlaybackId ?? ""
      }`;
      const existing = albumSessionInFlightRef.current.get(requestKey);
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
              ...(startPlaybackId ? { startPlaybackId } : {}),
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

            const gatePayload =
              data && "ok" in data && data.ok === false
                ? (data.gate ?? null)
                : null;

            if (args.surfaceGate && gatePayload) {
              reportPlaybackGate(
                {
                  domain: gatePayload.domain ?? "playback",
                  code:
                    normalizeGateCodeRaw(gatePayload.code) ??
                    "PLAYBACK_CAP_REACHED",
                  action: gatePayload.action ?? "login",
                  message:
                    gatePayload.message ??
                    "Enter your email address to continue listening.",
                  correlationId:
                    gatePayload.correlationId ??
                    res.headers.get("x-correlation-id") ??
                    null,
                  reason: gatePayload.reason,
                },
                res.headers.get("x-correlation-id") ?? null,
              );
            }

            return false;
          }

          sendAudioDebug({
            event: "album-session-received",
            albumId: data.albumId || albumId,
            source: "AudioEngine",
            detail: `tracks=${data.tracks.length}`,
          });

          const mode = data.mode === "full" ? "full" : "sample";

          return cacheAlbumSessionTokens({
            albumId: data.albumId || albumId,
            st,
            mode,
            expiresAt: data.expiresAt,
            tracks: data.tracks,
            sampleSession:
              mode === "sample" && data.sampleSession
                ? data.sampleSession
                : null,
          });
        } catch {
          return false;
        }
      })().finally(() => {
        albumSessionInFlightRef.current.delete(requestKey);
      });

      albumSessionInFlightRef.current.set(requestKey, promise);
      return promise;
    },
    [
      albumSessionKey,
      cacheAlbumSessionTokens,
      getShareTokenFromLocation,
      isSignedIn,
      isUserLoaded,
      reportPlaybackGate,
    ],
  );

  const prefetchCurrentQueueAlbumSession = React.useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      const s = pRef.current;
      const albumId = normalizeAlbumId(s.queueContextId);
      if (!albumId) return false;

      return prefetchAlbumSession({
        albumId,
        st: getShareTokenFromLocation(),
        startPlaybackId: s.current?.muxPlaybackId ?? null,
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
      surfaceGate?: boolean;
    }): Promise<{ token: string; expiresAtMs: number } | null> => {
      const playbackId = (args.track.muxPlaybackId ?? "").trim();
      if (!playbackId) return null;

      const cached = getCachedTokenForPlaybackId(playbackId);
      if (cached) return cached;

      const s = pRef.current;
      const albumId = normalizeAlbumId(s.queueContextId);
      const st = getShareTokenFromLocation();
      const shouldRememberResumeTarget = args.surfaceGate === true;

      if (albumId) {
        await prefetchAlbumSession({
          albumId,
          st,
          startPlaybackId: playbackId,
          signal: args.signal,
          surfaceGate: shouldRememberResumeTarget,
        });

        const albumCached = getCachedTokenForPlaybackId(playbackId);
        if (albumCached) return albumCached;
      }

      const isAnonymousWithoutShare = isSignedIn !== true && !st;

      if (isAnonymousWithoutShare) {
        rememberAuthResumeTarget(args.track, shouldRememberResumeTarget);
        return null;
      }

      const singleToken = await fetchSingleToken({
        playbackId,
        track: args.track,
        signal: args.signal,
      });

      if (!singleToken) {
        rememberAuthResumeTarget(args.track, shouldRememberResumeTarget);
      }

      return singleToken;
    },
    [
      fetchSingleToken,
      getCachedTokenForPlaybackId,
      getShareTokenFromLocation,
      isSignedIn,
      prefetchAlbumSession,
      rememberAuthResumeTarget,
    ],
  );

  const markDeckPrepared = React.useCallback(
    (deckId: DeckId, attachKey: string): void => {
      const meta = metaByDeckRef.current[deckId];

      if (meta?.attachKey !== attachKey) return;

      metaByDeckRef.current[deckId] = {
        ...meta,
        prepared: true,
      };
    },
    [],
  );

  const attachStaticM4aSource = React.useCallback(
    (args: {
      audio: HTMLMediaElement;
      deckId: DeckId;
      recordingId: string;
      playbackId: string;
      attachKey: string;
      srcUrl: string;
      reason: "active" | "standby";
    }): Promise<boolean> => {
      const { audio, deckId, recordingId, playbackId, attachKey, srcUrl } =
        args;

      sendAudioDebug({
        event:
          args.reason === "standby"
            ? "standby-static-m4a-attach"
            : "active-static-m4a-attach",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${deckId}`,
      });

      return new Promise<boolean>((resolve) => {
        let timeoutId: number | null = null;

        const snapshot = () =>
          JSON.stringify({
            readyState: audio.readyState,
            networkState: audio.networkState,
            currentTimeSec: Number(audio.currentTime.toFixed(3)),
            bufferedAheadSec: Number(bufferedAheadSeconds(audio).toFixed(3)),
          });

        const cleanup = () => {
          audio.removeEventListener("loadedmetadata", onMaybeReady);
          audio.removeEventListener("canplay", onMaybeReady);
          audio.removeEventListener("canplaythrough", onMaybeReady);
          audio.removeEventListener("progress", onMaybeReady);
          audio.removeEventListener("error", onError);

          if (timeoutId != null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
        };

        const finish = createBooleanSettler({
          resolve,
          cleanup,
          onSuccess: () => markDeckPrepared(deckId, attachKey),
        });

        const onMaybeReady = () => {
          const ready =
            args.reason === "standby"
              ? isStaticM4aStandbyBuffered(audio)
              : audio.readyState >= HTMLMediaElement.HAVE_METADATA;

          if (!ready) return;

          if (args.reason === "standby") {
            sendAudioDebug({
              event: "standby-static-m4a-buffered",
              albumId: pRef.current.queueContextId ?? null,
              recordingId,
              playbackId,
              source: `AudioEngine.${deckId}`,
              detail: snapshot(),
            });
          }

          finish(true);
        };

        const onError = () => {
          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-static-m4a-error"
                : "active-static-m4a-error",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${deckId}`,
            detail: snapshot(),
          });

          finish(false);
        };

        audio.addEventListener("loadedmetadata", onMaybeReady);
        audio.addEventListener("canplay", onMaybeReady);
        audio.addEventListener("canplaythrough", onMaybeReady);
        audio.addEventListener("progress", onMaybeReady);
        audio.addEventListener("error", onError);

        try {
          audio.src = srcUrl;
          audio.load();
          onMaybeReady();
        } catch {
          onError();
          return;
        }

        timeoutId = window.setTimeout(() => {
          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-static-m4a-buffer-timeout"
                : "active-static-m4a-timeout",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${deckId}`,
            detail: snapshot(),
          });

          finish(false);
        }, STATIC_M4A_STANDBY_TIMEOUT_MS);
      });
    },
    [markDeckPrepared],
  );

  const attachNativeHlsSource = React.useCallback(
    (args: {
      audio: HTMLMediaElement;
      deckId: DeckId;
      recordingId: string;
      playbackId: string;
      attachKey: string;
      srcUrl: string;
      reason: "active" | "standby";
    }): Promise<boolean> => {
      const { audio, deckId, recordingId, playbackId, attachKey, srcUrl } =
        args;

      sendAudioDebug({
        event:
          args.reason === "standby"
            ? "standby-native-hls-safari"
            : "active-native-hls-safari",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${deckId}`,
      });

      return new Promise<boolean>((resolve) => {
        const cleanup = () => {
          audio.removeEventListener("loadedmetadata", onReady);
          audio.removeEventListener("canplay", onReady);
          audio.removeEventListener("error", onError);
        };

        const finish = createBooleanSettler({
          resolve,
          cleanup,
          onSuccess: () => markDeckPrepared(deckId, attachKey),
        });

        const onReady = () => finish(true);
        const onError = () => finish(false);

        audio.addEventListener("loadedmetadata", onReady);
        audio.addEventListener("canplay", onReady);
        audio.addEventListener("error", onError);

        try {
          audio.src = srcUrl;
          audio.load();
        } catch {
          finish(false);
        }

        window.setTimeout(() => finish(true), 2500);
      });
    },
    [markDeckPrepared],
  );

  const attachHlsJsSource = React.useCallback(
    async (args: {
      audio: HTMLMediaElement;
      deckId: DeckId;
      recordingId: string;
      playbackId: string;
      attachKey: string;
      srcUrl: string;
      reason: "active" | "standby";
      seq: number;
    }): Promise<boolean> => {
      const { audio, deckId, recordingId, playbackId, attachKey, srcUrl } =
        args;

      let HlsJs: HlsJsConstructor;

      try {
        HlsJs = await loadHlsConstructor();
      } catch {
        sendAudioDebug({
          event: "hls-load-failed",
          albumId: pRef.current.queueContextId ?? null,
          recordingId,
          playbackId,
          source: `AudioEngine.${deckId}`,
        });

        return false;
      }

      if (args.seq !== loadSeq.current) {
        return false;
      }

      if (!HlsJs.isSupported()) {
        sendAudioDebug({
          event: "hls-unsupported",
          albumId: pRef.current.queueContextId ?? null,
          recordingId,
          playbackId,
          source: `AudioEngine.${deckId}`,
        });

        return false;
      }

      sendAudioDebug({
        event:
          args.reason === "standby" ? "standby-hlsjs-attach" : "hlsjs-attach",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${deckId}`,
      });

      return new Promise<boolean>((resolve) => {
        const hls = new HlsJs({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });

        hlsByDeckRef.current[deckId] = hls;

        const finish = createBooleanSettler({
          resolve,
          onSuccess: () => markDeckPrepared(deckId, attachKey),
        });

        hls.on(HlsJs.Events.ERROR, (_event, err) => {
          if (!err?.fatal) return;

          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-hls-fatal"
                : "active-hls-fatal",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${deckId}.hls`,
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

        hls.once(HlsJs.Events.MANIFEST_PARSED, () => {
          sendAudioDebug({
            event:
              args.reason === "standby"
                ? "standby-manifest-parsed"
                : "hls-manifest-parsed",
            albumId: pRef.current.queueContextId ?? null,
            recordingId,
            playbackId,
            source: `AudioEngine.${deckId}.hls`,
          });

          finish(true);
        });

        try {
          hls.attachMedia(audio);
          hls.loadSource(srcUrl);
        } catch {
          finish(false);
        }

        window.setTimeout(() => finish(false), 10_000);
      });
    },
    [markDeckPrepared, reportLocalPlaybackErrorAsGate],
  );

  const attachTrackToDeck = React.useCallback(
    async (args: {
      deckId: DeckId;
      track: PlayerTrack;
      token: string;
      seq: number;
      reason: "active" | "standby";
    }): Promise<boolean> => {
      const audio = getAudio(args.deckId);
      if (!audio) return false;

      const playbackId = (args.track.muxPlaybackId ?? "").trim();
      const recordingId = args.track.recordingId;
      if (!playbackId || !recordingId) return false;

      const attachKey = `${playbackId}:${pRef.current.reloadNonce}`;
      const useStaticM4a = shouldUseStaticM4a();
      const useNativeHls = !useStaticM4a && shouldUseNativeHls(audio);
      const hlsPath = resolveDeckHlsPath(useStaticM4a, useNativeHls);
      const srcUrl = useStaticM4a
        ? muxSignedStaticAudioUrl(playbackId, args.token)
        : muxSignedHlsUrl(playbackId, args.token);

      sendAudioDebug({
        event: "transport-path-selected",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId,
        source: `AudioEngine.${args.deckId}`,
        detail: JSON.stringify({
          epochMs: Date.now(),
          reason: args.reason,
          path: hlsPath,
          nativeHlsCanPlay: audio.canPlayType(
            "application/vnd.apple.mpegurl",
          ),
          alternateNativeHlsCanPlay: audio.canPlayType("application/x-mpegURL"),
          hlsJsLoaded: hlsConstructorCache !== null,
          hlsJsSupported: getKnownHlsJsSupport(),
          userAgent:
            typeof navigator === "undefined" ? null : navigator.userAgent,
        }),
      });

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

      if (args.seq !== loadSeq.current) {
        return false;
      }

      stopDeck(args.deckId);

      audio.crossOrigin = "anonymous";
      audio.preload =
        args.reason === "standby" || useStaticM4a ? "auto" : "metadata";
      audio.volume = Math.max(0, Math.min(1, pRef.current.volume));
      audio.muted = pRef.current.muted;

      metaByDeckRef.current[args.deckId] = {
        deckId: args.deckId,
        recordingId,
        playbackId,
        attachKey,
        prepared: false,
        hlsPath,
      };

      const sourceArgs = {
        audio,
        deckId: args.deckId,
        recordingId,
        playbackId,
        attachKey,
        srcUrl,
        reason: args.reason,
      };

      if (useStaticM4a) {
        return attachStaticM4aSource(sourceArgs);
      }

      if (useNativeHls) {
        return attachNativeHlsSource(sourceArgs);
      }

      return attachHlsJsSource({
        ...sourceArgs,
        seq: args.seq,
      });
    },
    [
      attachHlsJsSource,
      attachNativeHlsSource,
      attachStaticM4aSource,
      getAudio,
      stopDeck,
    ],
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

  const playTargetFromUserGesture = React.useCallback(
    (detail: TargetedPlayIntentDetail): void => {
      if (!isAppleMobileWebKit()) return;
      if (engineBlockedRef.current) return;

      const track = detail.track;
      const albumId = (detail.albumId ?? "").trim();
      const playbackId = (track?.muxPlaybackId ?? "").trim();
      const recordingId = (track?.recordingId ?? "").trim();

      if (!track || !albumId || !playbackId || !recordingId) {
        sendAudioDebug({
          event: "apple-target-play-missing-context",
          albumId: albumId || pRef.current.queueContextId || null,
          recordingId: recordingId || null,
          playbackId: playbackId || null,
          source: "AudioEngine",
        });
        return;
      }

      const activeDeck = activeDeckRef.current;
      const audio = getAudio(activeDeck);

      if (!audio) return;

      const existingMeta = metaByDeckRef.current[activeDeck];

      playIntentRef.current = true;

      if (
        existingMeta?.recordingId === recordingId &&
        existingMeta.playbackId === playbackId &&
        Boolean(audio.currentSrc || audio.src)
      ) {
        void audio.play().then(
          () => {
            sendAudioDebug({
              event: "apple-target-resume-resolved",
              albumId,
              recordingId,
              playbackId,
              source: `AudioEngine.${activeDeck}`,
            });
          },
          (error: unknown) => {
            sendAudioDebug({
              event: "apple-target-resume-rejected",
              albumId,
              recordingId,
              playbackId,
              source: `AudioEngine.${activeDeck}`,
              detail:
                error instanceof Error
                  ? `${error.name}: ${error.message}`
                  : "unknown",
            });
          },
        );

        return;
      }

      const sourceUrl = new URL("/api/mux/token", window.location.origin);
      sourceUrl.searchParams.set("format", "audio-m4a");
      sourceUrl.searchParams.set("playbackId", playbackId);
      sourceUrl.searchParams.set("albumId", albumId);

      const durationMs =
        track.durationMs ??
        pRef.current.durationByRecordingId[recordingId] ??
        0;

      if (Number.isFinite(durationMs) && durationMs > 0) {
        sourceUrl.searchParams.set(
          "durationMs",
          String(Math.round(durationMs)),
        );
      }

      const shareToken = getShareTokenFromLocation();

      if (shareToken) {
        sourceUrl.searchParams.set("st", shareToken);
      }

      const attachKey = `${playbackId}:${pRef.current.reloadNonce}`;

      loadSeq.current += 1;
      discardInactiveDeck();
      stopDeck(activeDeck);

      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.volume = Math.max(0, Math.min(1, pRef.current.volume));
      audio.muted = pRef.current.muted;

      metaByDeckRef.current[activeDeck] = {
        deckId: activeDeck,
        recordingId,
        playbackId,
        attachKey,
        prepared: false,
        hlsPath: "static-m4a",
      };

      telemetrySessionIdRef.current = newPlaybackSessionId();
      telemetryShareAttributionRef.current = readQueueSharePlaybackAttribution(
        pRef.current,
      );

      mediaSurface.setTrack(recordingId);
      mediaSurface.setStatus("loading");

      sendAudioDebug({
        event: "apple-target-play-start",
        albumId,
        recordingId,
        playbackId,
        source: `AudioEngine.${activeDeck}`,
        detail: "same-origin-token-redirect",
      });

      try {
        audio.src = sourceUrl.toString();
        audio.load();
      } catch (error: unknown) {
        sendAudioDebug({
          event: "apple-target-source-attach-rejected",
          albumId,
          recordingId,
          playbackId,
          source: `AudioEngine.${activeDeck}`,
          detail:
            error instanceof Error
              ? `${error.name}: ${error.message}`
              : "unknown",
        });
        return;
      }

      // This invocation deliberately remains in the original click/touch call
      // stack. The media request may resolve asynchronously, but play() itself
      // has already received WebKit's user activation.
      void audio.play().then(
        () => {
          sendAudioDebug({
            event: "apple-target-play-resolved",
            albumId,
            recordingId,
            playbackId,
            source: `AudioEngine.${activeDeck}`,
          });
        },
        (error: unknown) => {
          sendAudioDebug({
            event: "apple-target-play-rejected",
            albumId,
            recordingId,
            playbackId,
            source: `AudioEngine.${activeDeck}`,
            detail:
              error instanceof Error
                ? `${error.name}: ${error.message}`
                : "unknown",
          });
        },
      );
    },
    [discardInactiveDeck, getAudio, getShareTokenFromLocation, stopDeck],
  );

  React.useEffect(() => {
    const onTargetedPlayIntent = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as TargetedPlayIntentDetail | null)
          : null;

      if (!detail) return;

      playTargetFromUserGesture(detail);
    };

    window.addEventListener("af:play-target-intent", onTargetedPlayIntent);

    return () => {
      window.removeEventListener("af:play-target-intent", onTargetedPlayIntent);
    };
  }, [playTargetFromUserGesture]);

  const prepareStandbyForTrack = React.useCallback(
    async (track: PlayerTrack, surfaceGate = false): Promise<boolean> => {
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

      const seq = loadSeq.current;
      const ac = new AbortController();

      const token = await ensureTokenForTrack({
        track,
        signal: ac.signal,
        surfaceGate,
      });

      if (!token || seq !== loadSeq.current) return false;

      const ok = await attachTrackToDeck({
        deckId,
        track,
        token: token.token,
        seq,
        reason: "standby",
      });

      if (seq !== loadSeq.current) return false;

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
        prepared?.recordingId !== nextTrack.recordingId ||
        prepared?.playbackId !== playbackId
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
      telemetryShareAttributionRef.current = readQueueSharePlaybackAttribution(
        pRef.current,
      );

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

  const resumeAttachedActiveDeck = React.useCallback(
    async (deckId: DeckId, shouldPlay: boolean): Promise<void> => {
      if (!shouldPlay) return;

      const played = await playDeck(deckId, "active");
      if (!played) return;

      playIntentRef.current = false;
      pRef.current.clearIntent();
    },
    [playDeck],
  );

  const playNewlyAttachedDeck = React.useCallback(
    async (deckId: DeckId, shouldPlay: boolean): Promise<void> => {
      if (!shouldPlay) return;

      const played = await playDeck(deckId, "active");

      if (played) {
        playIntentRef.current = false;
        pRef.current.clearIntent();
        return;
      }

      playIntentRef.current = true;
    },
    [playDeck],
  );

  const attachActiveTrack = React.useCallback(async () => {
    const s = pRef.current;
    const track = s.current;
    const playbackId = (track?.muxPlaybackId ?? "").trim();

    if (!track || !playbackId) return;
    if (engineBlockedRef.current) return;

    const activeDeck = activeDeckRef.current;
    const activeMeta = metaByDeckRef.current[activeDeck];
    const shouldPlayExisting = s.intent === "play" || playIntentRef.current;

    if (
      activeMeta?.recordingId === track.recordingId &&
      activeMeta.playbackId === playbackId
    ) {
      await resumeAttachedActiveDeck(activeDeck, shouldPlayExisting);
      return;
    }

    const blockedAt = blockedNonceRef.current.get(playbackId);
    if (blockedAt === s.reloadNonce) {
      playIntentRef.current = false;
      hardStopAll();
      mediaSurface.setStatus("blocked");
      resurfacePlaybackGate();
      return;
    }

    const seq = ++loadSeq.current;

    discardInactiveDeck();
    telemetrySessionIdRef.current = newPlaybackSessionId();
    telemetryShareAttributionRef.current = readQueueSharePlaybackAttribution(s);

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
        surfaceGate: true,
      }));

    if (!token || seq !== loadSeq.current) return;

    const attached = await attachTrackToDeck({
      deckId: activeDeck,
      track,
      token: token.token,
      seq,
      reason: "active",
    });

    if (!attached || seq !== loadSeq.current) return;

    const shouldPlayAttached =
      s.intent === "play" ||
      playIntentRef.current ||
      s.status === "loading";

    await playNewlyAttachedDeck(activeDeck, shouldPlayAttached);
  }, [
    attachTrackToDeck,
    discardInactiveDeck,
    ensureTokenForTrack,
    getCachedTokenForPlaybackId,
    hardStopAll,
    playNewlyAttachedDeck,
    resurfacePlaybackGate,
    resumeAttachedActiveDeck,
  ]);

  React.useEffect(() => {
    const a = audioARef.current;
    const b = audioBRef.current;
    if (!a || !b) return;

    const tokenCache = tokenCacheRef.current;
    const albumSessionCache = albumSessionCacheRef.current;
    const albumSessionInFlight = albumSessionInFlightRef.current;
    const blockedNonce = blockedNonceRef.current;
    const telemetryPlaySent = telemetryPlaySentRef.current;
    const telemetryPlayAccumulated = telemetryPlayAccumulatedMsRef.current;
    const telemetryPlayLastProgress = telemetryPlayLastProgressMsRef.current;
    const telemetryProgressSent = telemetryProgressSentRef.current;
    const telemetryCompleteSent = telemetryCompleteSentRef.current;
    const telemetryCompleteInFlight = telemetryCompleteInFlightRef.current;

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
      telemetryShareAttributionRef.current = null;
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

      audioCtxStateCleanupRef.current?.();
      audioCtxStateCleanupRef.current = null;

      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx) {
        ctx.close().catch(() => {});
      }

      tokenCache.clear();
      albumSessionCache.clear();
      albumSessionInFlight.clear();
      blockedNonce.clear();
      telemetryPlaySent.clear();
      telemetryPlayAccumulated.clear();
      telemetryPlayLastProgress.clear();
      telemetryProgressSent.clear();
      telemetryCompleteSent.clear();
      telemetryCompleteInFlight.clear();

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

      if (isAppleMobileWebKit()) {
        sendRuntimeSnapshot(
          "audio-graph-skipped-apple-mobile",
          "direct-html-media-output",
        );
        return;
      }

      if (audioCtxRef.current) {
        sendRuntimeSnapshot("audio-graph-already-present");
        return;
      }

      sendRuntimeSnapshot("audio-graph-create-start");

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const onStateChange = () => {
        sendRuntimeSnapshot("audio-context-statechange", `state=${ctx.state}`);
      };

      audioCtxStateCleanupRef.current?.();
      audioCtxStateCleanupRef.current = () => {
        ctx.removeEventListener("statechange", onStateChange);
      };

      ctx.addEventListener("statechange", onStateChange);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = VISUALIZER_AUDIO_FFT_SIZE;
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
      setAudioAnalysisReady(true);

      sendRuntimeSnapshot("audio-graph-created");
    };

    const onUserGesture = async () => {
      sendRuntimeSnapshot("audio-user-gesture");
      warmHlsConstructorForMediaElement(getActiveAudio());

      await ensureAudioGraph();

      const context = audioCtxRef.current;

      if (context?.state === "suspended") {
        sendRuntimeSnapshot("audio-context-resume-requested");

        try {
          await context.resume();
          sendRuntimeSnapshot("audio-context-resume-resolved");
        } catch {
          sendRuntimeSnapshot("audio-context-resume-rejected");
        }
      }
    };

    window.addEventListener("af:play-intent", onUserGesture);

    return () => {
      window.removeEventListener("af:play-intent", onUserGesture);
    };
  }, [getActiveAudio, sendRuntimeSnapshot]);

  React.useEffect(() => {
    const clearAudioFeatures = () => {
      audioSurface.set({
        rms: 0,
        bass: 0,
        mid: 0,
        treble: 0,
        centroid: 0,
        energy: 0,
      });
    };

    const isActive = p.status === "playing" || p.status === "loading";

    if (!audioAnalysisReady || !isActive) {
      clearAudioFeatures();
      return;
    }

    let raf: number | null = null;

    const tick = () => {
      const analyser = analyserRef.current;
      const freq = freqDataRef.current;
      const time = timeDataRef.current;

      if (!analyser || !freq || !time) {
        clearAudioFeatures();
        return;
      }

      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      let sum = 0;
      for (const sample of time) {
        const v = (sample - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      const n = freq.length;
      const context = audioCtxRef.current;
      const sampleRate = context?.sampleRate ?? 48_000;
      const bands = visualizerAudioBandBins(
        sampleRate,
        analyser.fftSize,
        n,
      );

      // Keep the existing Web Audio magnitude domain and analyser smoothing so
      // the website's tuned excitation envelope remains stable. Only the
      // semantic ownership of bass/mid/treble changes here: both realtime and
      // offline now use the same Hz-defined ranges.
      const bass = averageNormalizedByteSpectrumRange(
        freq,
        bands.bassStart,
        bands.bassEnd,
      );
      const mid = averageNormalizedByteSpectrumRange(
        freq,
        bands.midStart,
        bands.midEnd,
      );
      const treble = averageNormalizedByteSpectrumRange(
        freq,
        bands.trebleStart,
        bands.trebleEnd,
      );

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
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [audioAnalysisReady, p.status]);

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
    const recordAndFlush = (event: string) => {
      sendRuntimeSnapshot(event);
      flushAudioDebugSoon(true);
    };

    const onVisibilityChange = () => {
      recordAndFlush("lifecycle-visibilitychange");
    };

    const onPageHide = () => {
      recordAndFlush("lifecycle-pagehide");
    };

    const onPageShow = () => {
      recordAndFlush("lifecycle-pageshow");
    };

    const onFreeze = () => {
      recordAndFlush("lifecycle-freeze");
    };

    const onResume = () => {
      recordAndFlush("lifecycle-resume");
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", onResume);

    return () => {
      sendRuntimeSnapshot("lifecycle-audio-engine-unmount");

      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", onResume);

      flushAudioDebugSoon(true);
    };
  }, [sendRuntimeSnapshot]);

  React.useEffect(() => {
    const onPrefetchAlbumSession = (event: Event) => {
      const detail =
        event instanceof CustomEvent && typeof event.detail === "object"
          ? (event.detail as {
              albumId?: unknown;
              st?: unknown;
              startPlaybackId?: unknown;
            })
          : null;

      const albumId =
        typeof detail?.albumId === "string"
          ? normalizeAlbumId(detail.albumId)
          : "";
      const st =
        typeof detail?.st === "string" ? detail.st.trim() || null : null;

      const startPlaybackId =
        typeof detail?.startPlaybackId === "string"
          ? detail.startPlaybackId.trim() || null
          : null;

      if (!albumId) return;

      albumSessionAbortRef.current?.abort();
      const ac = new AbortController();
      albumSessionAbortRef.current = ac;

      void prefetchAlbumSession({
        albumId,
        st,
        startPlaybackId,
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
    let earlyHandoffFrame: number | null = null;
    let earlyHandoffKey: string | null = null;

    const sendPlaybackTelemetry = (payload: {
      event: "play" | "progress" | "complete";
      recordingId: string;
      playbackId: string;
      milestoneKey: string;
      listenedMs?: number;
      progressMs: number;
      durationMs: number | null;
    }): Promise<boolean> => {
      const shareAttribution = telemetryShareAttributionRef.current;

      return fetch("/api/playback/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          ...(shareAttribution
            ? {
                albumScopeId: shareAttribution.scopeId,
                sharePlaybackContext: shareAttribution.context,
              }
            : {}),
        }),
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

          const anonymousCapReached =
            json &&
            typeof json === "object" &&
            "anonymousCapReached" in json &&
            (json as { anonymousCapReached?: unknown }).anonymousCapReached ===
              true;

          if (anonymousCapReached) {
            revokeAnonymousFuturePlaybackAuthority();

            sendAudioDebug({
              event: "anonymous-qualified-cap-authority-revoked",
              albumId: pRef.current.queueContextId ?? null,
              recordingId: payload.recordingId,
              playbackId: pRef.current.current?.muxPlaybackId ?? null,
              source: "AudioEngine",
              detail: "current-track-preserved;future-anonymous-authority-cleared",
            });
          }

          return response.ok;
        })
        .catch(() => false);
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

      void sendPlaybackTelemetry({
        event: "play",
        recordingId,
        playbackId,
        milestoneKey: "play",
        progressMs,
        durationMs,
      }).then((ok) => {
        if (!ok) {
          telemetryPlaySentRef.current.delete(sentKey);
        }
      });
    };

    const reportTelemetryComplete = (params: {
      recordingId: string;
      playbackId: string;
      progressMs: number;
      durationMs: number | null;
    }): Promise<boolean> => {
      const { recordingId, playbackId, progressMs, durationMs } = params;

      if (!recordingId || !playbackId) {
        return Promise.resolve(false);
      }

      const milestoneKey = `${recordingId}:${playbackId}:complete`;

      if (telemetryCompleteSentRef.current.has(milestoneKey)) {
        return Promise.resolve(true);
      }

      const inFlight = telemetryCompleteInFlightRef.current.get(milestoneKey);

      if (inFlight) {
        return inFlight;
      }

      const request = sendPlaybackTelemetry({
        event: "complete",
        recordingId,
        playbackId,
        milestoneKey: "complete",
        progressMs,
        durationMs,
      })
        .then((ok) => {
          if (ok) {
            telemetryCompleteSentRef.current.add(milestoneKey);
          }

          return ok;
        })
        .finally(() => {
          telemetryCompleteInFlightRef.current.delete(milestoneKey);
        });

      telemetryCompleteInFlightRef.current.set(milestoneKey, request);

      return request;
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

      void sendPlaybackTelemetry({
        event: "progress",
        recordingId,
        playbackId,
        milestoneKey: String(milestoneMs),
        listenedMs: TELEMETRY_PROGRESS_STEP_MS,
        progressMs,
        durationMs,
      }).then((ok) => {
        if (!ok) {
          telemetryProgressSentRef.current.delete(milestoneKey);
        }
      });
    };

    const debugMediaEvent = (
      deckId: DeckId,
      event: string,
      detail?: string,
    ) => {
      const a = getAudio(deckId);
      const meta = metaByDeckRef.current[deckId];

      let bufferedEndSec: number | null = null;

      try {
        if (a && a.buffered.length > 0) {
          bufferedEndSec = a.buffered.end(a.buffered.length - 1);
        }
      } catch {
        bufferedEndSec = null;
      }

      const fallbackDetail = a
        ? JSON.stringify({
            epochMs: Date.now(),
            visibility:
              typeof document === "undefined" ? null : document.visibilityState,
            hlsPath: meta?.hlsPath ?? null,
            audioContextState: audioCtxRef.current?.state ?? null,
            currentTimeSec: Number.isFinite(a.currentTime)
              ? a.currentTime
              : null,
            durationSec: Number.isFinite(a.duration) ? a.duration : null,
            paused: a.paused,
            ended: a.ended,
            readyState: a.readyState,
            networkState: a.networkState,
            bufferedEndSec,
            mediaErrorCode: a.error?.code ?? null,
            mediaErrorMessage: a.error?.message ?? null,
          })
        : "missing-audio";

      sendAudioDebug({
        event,
        albumId: pRef.current.queueContextId ?? null,
        recordingId:
          meta?.recordingId ?? pRef.current.current?.recordingId ?? null,
        playbackId:
          meta?.playbackId ?? pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${deckId}`,
        detail: detail ?? fallbackDetail,
      });
    };

    const publishTrackProgressForSeek = (
      audio: HTMLAudioElement,
      progressMs: number,
    ): void => {
      const currentTrack = pRef.current.current;
      if (!currentTrack) return;

      const currentPlaybackId = (currentTrack.muxPlaybackId ?? "").trim();
      const durationMs =
        readFiniteMediaDurationMs(audio) ||
        (currentPlaybackId
          ? (pRef.current.assetDurationByPlaybackId[currentPlaybackId] ?? 0)
          : 0) ||
        pRef.current.durationByRecordingId[currentTrack.recordingId] ||
        currentTrack.durationMs ||
        0;

      if (durationMs > 0) {
        mediaSurface.setTrackProgress01(progressMs / durationMs);
      }
    };

    const applyPendingSeek = (deckId: DeckId) => {
      const a = getAudio(deckId);
      if (!a) return;

      const ms = pRef.current.pendingSeekMs;
      if (ms == null) return;

      try {
        a.currentTime = Math.max(0, ms / 1000);
      } catch {
        return;
      }

      publishTrackProgressForSeek(a, ms);
      pRef.current.clearPendingSeek();
    };

    const handleAutoAdvance = async (): Promise<void> => {
      const s = pRef.current;
      const cur = s.current;
      const nextTrack = getNextTrack();

      if (!cur || !nextTrack) return;

      const key = `${cur.recordingId}:${
        telemetrySessionIdRef.current ?? cur.muxPlaybackId ?? ""
      }`;

      if (autoAdvanceKeyRef.current === key) return;
      autoAdvanceKeyRef.current = key;

      const activeAudio = getAudio(activeDeckRef.current);
      const currentTimeMs = activeAudio
        ? Math.round(Math.max(0, activeAudio.currentTime) * 1000)
        : 0;
      const liveAssetDurationMs = activeAudio
        ? readFiniteMediaDurationMs(activeAudio)
        : 0;
      const catalogueDurationMs =
        s.durationByRecordingId[cur.recordingId] ?? cur.durationMs ?? 0;
      const cachedAssetDurationMs = cur.muxPlaybackId
        ? (s.assetDurationByPlaybackId[cur.muxPlaybackId] ?? 0)
        : 0;

      sendAudioDebug({
        event: "auto-next-from-ended",
        albumId: s.queueContextId ?? null,
        recordingId: cur.recordingId,
        playbackId: cur.muxPlaybackId ?? null,
        source: "AudioEngine",
        detail: JSON.stringify({
          nextRecordingId: nextTrack.recordingId,
          currentTimeMs,
          liveAssetDurationMs,
          cachedAssetDurationMs,
          catalogueDurationMs,
        }),
      });

      // The next track has already been authorised by either the full album
      // session or the bounded anonymous sample session. Completion telemetry
      // must never delay the deck handoff on a locked/background device.
      const completionDurationMs =
        liveAssetDurationMs || cachedAssetDurationMs || catalogueDurationMs;

      void reportTelemetryComplete({
        recordingId: cur.recordingId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs: currentTimeMs,
        durationMs: completionDurationMs || null,
      });

      const standbyReady = await prepareStandbyForTrack(nextTrack, true);

      if (!standbyReady) {
        sendAudioDebug({
          event: "standby-not-ready-fallback-state-advance",
          albumId: s.queueContextId ?? null,
          recordingId: cur.recordingId,
          playbackId: cur.muxPlaybackId ?? null,
          source: "AudioEngine",
          detail: `next=${nextTrack.recordingId}`,
        });

        if (engineBlockedRef.current) {
          hardStopAll();
          mediaSurface.setStatus("blocked");
          pRef.current.setStatusExternal("paused");
          pRef.current.setLoadingReasonExternal(undefined);
          pRef.current.clearIntent();
          return;
        }

        playIntentRef.current = true;
        pRef.current.advanceFromEngine();
        return;
      }

      const activeMeta = metaByDeckRef.current[activeDeckRef.current];

      const shouldUseAppleMobileActiveDeckAdvance =
        isAppleMobileWebKit() &&
        typeof document !== "undefined" &&
        document.visibilityState === "hidden" &&
        activeMeta?.hlsPath === "static-m4a";

      if (shouldUseAppleMobileActiveDeckAdvance) {
        sendAudioDebug({
          event: "apple-mobile-static-active-deck-advance",
          albumId: s.queueContextId ?? null,
          recordingId: cur.recordingId,
          playbackId: cur.muxPlaybackId ?? null,
          source: `AudioEngine.${activeDeckRef.current}`,
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

    const hasPreparedStandbyForTrack = (nextTrack: PlayerTrack): boolean => {
      if (isAppleMobileWebKit()) return false;

      const playbackId = (nextTrack.muxPlaybackId ?? "").trim();
      const prepared = standbyRef.current;

      if (
        !playbackId ||
        prepared?.recordingId !== nextTrack.recordingId ||
        prepared?.playbackId !== playbackId
      ) {
        return false;
      }

      const meta = metaByDeckRef.current[prepared.deckId];

      return Boolean(
        meta?.prepared &&
        meta.attachKey === prepared.attachKey &&
        meta.recordingId === nextTrack.recordingId &&
        meta.playbackId === playbackId,
      );
    };

    const armEarlyHandoff = (args: {
      deckId: DeckId;
      currentTrack: PlayerTrack;
      nextTrack: PlayerTrack;
    }): void => {
      if (
        GAPLESS_EARLY_PROMOTION_LEAD_MS <= 0 ||
        isAppleMobileWebKit() ||
        earlyHandoffFrame != null
      ) {
        return;
      }

      const currentPlaybackId = (args.currentTrack.muxPlaybackId ?? "").trim();
      const handoffKey = `${args.currentTrack.recordingId}:${
        args.nextTrack.recordingId
      }:${telemetrySessionIdRef.current ?? currentPlaybackId}`;

      if (earlyHandoffKey === handoffKey) return;
      earlyHandoffKey = handoffKey;

      const tick = () => {
        earlyHandoffFrame = null;

        const activeAudio = getAudio(args.deckId);
        const player = pRef.current;
        const currentTrack = player.current;
        const playbackId = (currentTrack?.muxPlaybackId ?? "").trim();

        if (
          !activeAudio ||
          activeDeckRef.current !== args.deckId ||
          currentTrack?.recordingId !== args.currentTrack.recordingId ||
          playbackId !== currentPlaybackId ||
          activeAudio.paused ||
          activeAudio.ended
        ) {
          earlyHandoffKey = null;
          return;
        }

        const durationMs =
          readFiniteMediaDurationMs(activeAudio) ||
          (playbackId
            ? (player.assetDurationByPlaybackId[playbackId] ?? 0)
            : 0) ||
          player.durationByRecordingId[currentTrack.recordingId] ||
          currentTrack.durationMs ||
          0;

        if (durationMs <= 0) {
          earlyHandoffKey = null;
          return;
        }

        const remainingMs =
          durationMs - Math.floor(Math.max(0, activeAudio.currentTime) * 1000);

        if (remainingMs > GAPLESS_EARLY_PROMOTION_LEAD_MS) {
          earlyHandoffFrame = window.requestAnimationFrame(tick);
          return;
        }

        earlyHandoffKey = null;

        if (remainingMs < 0 || !hasPreparedStandbyForTrack(args.nextTrack)) {
          return;
        }

        sendAudioDebug({
          event: "gapless-early-promotion",
          albumId: player.queueContextId ?? null,
          recordingId: currentTrack.recordingId,
          playbackId,
          source: `AudioEngine.${args.deckId}`,
          detail: `remaining=${remainingMs};next=${args.nextTrack.recordingId}`,
        });

        void handleAutoAdvance();
      };

      earlyHandoffFrame = window.requestAnimationFrame(tick);
    };

    const maybeSendProgressHeartbeat = (
      deckId: DeckId,
      recordingId: string,
      progressMs: number,
      durationMs: number,
    ): void => {
      const heartbeatBucket = Math.floor(progressMs / 60_000);
      if (heartbeatBucket <= 0) return;

      const heartbeatKey = `${recordingId}:${heartbeatBucket}`;
      if (debugProgressHeartbeatRef.current === heartbeatKey) return;

      debugProgressHeartbeatRef.current = heartbeatKey;
      sendAudioDebug({
        event: "playback-progress-heartbeat",
        albumId: pRef.current.queueContextId ?? null,
        recordingId,
        playbackId: pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${deckId}`,
        detail: `progress=${progressMs};duration=${durationMs}`,
      });
    };

    const maybeConfirmStaticM4aProgress = (args: {
      deckId: DeckId;
      audio: HTMLMediaElement;
      recordingId: string;
      progressMs: number;
    }): void => {
      const deckMeta = metaByDeckRef.current[args.deckId];
      const proofKey = `${args.recordingId}:${
        telemetrySessionIdRef.current ?? ""
      }`;

      if (
        deckMeta?.hlsPath !== "static-m4a" ||
        args.progressMs < 5_000 ||
        staticM4aProgressProofRef.current === proofKey
      ) {
        return;
      }

      staticM4aProgressProofRef.current = proofKey;

      sendAudioDebug({
        event: "static-m4a-progress-confirmed",
        albumId: pRef.current.queueContextId ?? null,
        recordingId: args.recordingId,
        playbackId: pRef.current.current?.muxPlaybackId ?? null,
        source: `AudioEngine.${args.deckId}`,
        detail: JSON.stringify({
          visibility:
            typeof document === "undefined" ? null : document.visibilityState,
          currentTimeSec: Number(args.audio.currentTime.toFixed(3)),
          bufferedAheadSec: Number(bufferedAheadSeconds(args.audio).toFixed(3)),
        }),
      });
    };

    const maybeWarmNextTrack = (args: {
      recordingId: string;
      nextTrack: PlayerTrack | null;
      remainingMs: number;
    }): void => {
      if (
        !args.nextTrack ||
        args.remainingMs <= 0 ||
        args.remainingMs > STANDBY_PREPARE_WINDOW_MS
      ) {
        return;
      }

      const warmKey = `${args.recordingId}:${args.nextTrack.recordingId}:${
        telemetrySessionIdRef.current ?? ""
      }`;

      if (nearEndWarmKeyRef.current === warmKey) return;

      nearEndWarmKeyRef.current = warmKey;
      void prefetchCurrentQueueAlbumSession();
      void prepareStandbyForTrack(args.nextTrack);
    };

    const maybeArmEarlyHandoff = (args: {
      deckId: DeckId;
      currentTrack: PlayerTrack | null | undefined;
      nextTrack: PlayerTrack | null;
      remainingMs: number;
    }): void => {
      if (
        !args.currentTrack ||
        !args.nextTrack ||
        args.remainingMs <= GAPLESS_EARLY_PROMOTION_LEAD_MS ||
        args.remainingMs > GAPLESS_EARLY_PROMOTION_ARM_WINDOW_MS
      ) {
        return;
      }

      armEarlyHandoff({
        deckId: args.deckId,
        currentTrack: args.currentTrack,
        nextTrack: args.nextTrack,
      });
    };

    const maybeReportTelemetryComplete = (args: {
      recordingId: string;
      progressMs: number;
      durationMs: number;
    }): void => {
      if (args.progressMs / args.durationMs < 0.9) return;

      void reportTelemetryComplete({
        recordingId: args.recordingId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs: args.progressMs,
        durationMs: args.durationMs,
      });
    };

    const onTime = (deckId: DeckId) => {
      if (deckId !== activeDeckRef.current) return;

      const audio = getAudio(deckId);
      if (!audio) return;

      const progressMs = Math.floor(audio.currentTime * 1000);
      mediaSurface.setTime(progressMs);
      pRef.current.setPositionMs(progressMs);

      const currentTrack = pRef.current.current;
      const recordingId = currentTrack?.recordingId ?? "";
      const currentPlaybackId = (currentTrack?.muxPlaybackId ?? "").trim();

      const catalogueDurationMs =
        (recordingId
          ? pRef.current.durationByRecordingId[recordingId]
          : 0) ||
        currentTrack?.durationMs ||
        0;

      const cachedAssetDurationMs = currentPlaybackId
        ? (pRef.current.assetDurationByPlaybackId[currentPlaybackId] ?? 0)
        : 0;

      const liveAssetDurationMs = readFiniteMediaDurationMs(audio);
      const durationMs =
        liveAssetDurationMs || cachedAssetDurationMs || catalogueDurationMs;

      if (durationMs <= 0) return;

      mediaSurface.setTrackProgress01(progressMs / durationMs);

      maybeSendProgressHeartbeat(
        deckId,
        recordingId,
        progressMs,
        durationMs,
      );

      setMediaSessionPositionStateSafe({
        durationSec: durationMs / 1000,
        positionSec: progressMs / 1000,
        playbackRate: 1,
      });

      reportTelemetryPlay({
        recordingId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs,
        durationMs,
      });

      reportTelemetryProgress({
        recordingId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs,
        durationMs,
      });

      maybeConfirmStaticM4aProgress({
        deckId,
        audio,
        recordingId,
        progressMs,
      });

      const remainingMs = durationMs - progressMs;
      const nextTrack = getNextTrack();

      maybeWarmNextTrack({
        recordingId,
        nextTrack,
        remainingMs,
      });

      maybeArmEarlyHandoff({
        deckId,
        currentTrack,
        nextTrack,
        remainingMs,
      });

      maybeReportTelemetryComplete({
        recordingId,
        progressMs,
        durationMs,
      });
    };

    const onLoadedMeta = (deckId: DeckId) => {
      const a = getAudio(deckId);
      const meta = metaByDeckRef.current[deckId];

      if (!a || !meta) return;

      const assetDurationMs = readFiniteMediaDurationMs(a);

      if (assetDurationMs > 0) {
        pRef.current.setAssetDurationMs(meta.playbackId, assetDurationMs);
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

      const pendingProgrammaticPauses =
        programmaticPauseCountByDeckRef.current[deckId];

      if (pendingProgrammaticPauses > 0) {
        programmaticPauseCountByDeckRef.current[deckId] =
          pendingProgrammaticPauses - 1;

        sendAudioDebug({
          event: "media-programmatic-pause-ignored",
          albumId: pRef.current.queueContextId ?? null,
          recordingId: pRef.current.current?.recordingId ?? null,
          playbackId: pRef.current.current?.muxPlaybackId ?? null,
          source: `AudioEngine.${deckId}`,
          detail: `remaining=${pendingProgrammaticPauses - 1};active=${activeDeckRef.current}`,
        });
        return;
      }

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

      const currentTrack = pRef.current.current;
      const recordingId = currentTrack?.recordingId ?? "";
      const currentPlaybackId = (currentTrack?.muxPlaybackId ?? "").trim();
      const activeAudio = getAudio(deckId);

      const liveDurationMs = activeAudio
        ? readFiniteMediaDurationMs(activeAudio)
        : 0;

      const fallbackDurationMs =
        (currentPlaybackId
          ? (pRef.current.assetDurationByPlaybackId[currentPlaybackId] ?? 0)
          : 0) ||
        pRef.current.durationByRecordingId[recordingId] ||
        currentTrack?.durationMs ||
        0;

      const progressMs = activeAudio
        ? Math.floor(Math.max(0, activeAudio.currentTime) * 1000)
        : fallbackDurationMs;

      void reportTelemetryComplete({
        recordingId,
        playbackId: telemetrySessionIdRef.current ?? "",
        progressMs,
        durationMs: liveDurationMs || fallbackDurationMs || null,
      });

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
      if (earlyHandoffFrame != null) {
        window.cancelAnimationFrame(earlyHandoffFrame);
      }

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
    revokeAnonymousFuturePlaybackAuthority,
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

    const player = pRef.current;
    const currentTrack = player.current;

    if (currentTrack) {
      const currentPlaybackId = (currentTrack.muxPlaybackId ?? "").trim();
      const durationMs =
        readFiniteMediaDurationMs(a) ||
        (currentPlaybackId
          ? (player.assetDurationByPlaybackId[currentPlaybackId] ?? 0)
          : 0) ||
        player.durationByRecordingId[currentTrack.recordingId] ||
        currentTrack.durationMs ||
        0;

      if (durationMs > 0) {
        mediaSurface.setTrackProgress01(ms / durationMs);
      }
    }

    pRef.current.clearPendingSeek();
  }, [getActiveAudio, p.seekNonce, p.pendingSeekMs]);

  React.useEffect(() => {
    const a = getActiveAudio();
    if (!a) return;

    if (engineBlockedRef.current) {
      if (p.intent === "play") {
        resurfacePlaybackGate();
        pRef.current.clearIntent();
      }

      playIntentRef.current = false;
      return;
    }

    if (p.intent === "pause") {
      playIntentRef.current = false;

      // Explicit pause intent is authoritative. Internal deck teardown can
      // leave a queued programmatic-pause suppression behind, but that must
      // never prevent the active transport from publishing its paused state.
      programmaticPauseCountByDeckRef.current[activeDeckRef.current] = 0;

      a.pause();
      mediaSurface.setStatus("paused");

      if (hasMediaSession()) {
        try {
          navigator.mediaSession.playbackState = "paused";
        } catch {}
      }

      pRef.current.setStatusExternal("paused");
      pRef.current.setLoadingReasonExternal(undefined);
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
  }, [attachActiveTrack, getActiveAudio, p.intent, resurfacePlaybackGate]);

  React.useEffect(() => {
    const onAuthResumeTarget = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { track?: PlayerTrack } | null)
          : null;

      const track = detail?.track;
      const recordingId = (track?.recordingId ?? "").trim();
      const playbackId = (track?.muxPlaybackId ?? "").trim();

      if (!track || !recordingId || !playbackId) return;

      // An engine-level denial knows the exact failed handoff target and may
      // already have armed this ref. Do not replace it with a less-specific
      // UI target.
      if (!resumeAfterAuthTrackRef.current) {
        resumeAfterAuthTrackRef.current = track;
      }
    };

    window.addEventListener(
      "af:playback-auth-resume-target",
      onAuthResumeTarget,
    );

    return () => {
      window.removeEventListener(
        "af:playback-auth-resume-target",
        onAuthResumeTarget,
      );
    };
  }, []);

  React.useEffect(() => {
    const onMemberRuntimeReady = () => {
      const resumeTrack = resumeAfterAuthTrackRef.current;

      // The old anonymous gate and its cached authority belong to the previous
      // identity. The refreshed server member runtime is now authoritative.
      clearPlaybackGate();

      albumSessionAbortRef.current?.abort();
      albumSessionAbortRef.current = null;

      tokenAbortRef.current?.abort();
      tokenAbortRef.current = null;

      loadSeq.current += 1;
      albumSessionCacheRef.current.clear();
      albumSessionInFlightRef.current.clear();
      tokenCacheRef.current.clear();
      blockedNonceRef.current.clear();
      standbyRef.current = null;
      anonSampleSessionRef.current = null;

      if (!resumeTrack) return;

      resumeAfterAuthTrackRef.current = null;
      playIntentRef.current = true;

      // Re-enter through PlayerState rather than attaching media directly.
      // This preserves the fresh authenticated /api/access/check and Mux
      // issuance boundaries before playback is allowed to continue.
      pRef.current.play(resumeTrack);
    };

    window.addEventListener(
      "af:session-runtime-member-ready",
      onMemberRuntimeReady,
    );

    return () => {
      window.removeEventListener(
        "af:session-runtime-member-ready",
        onMemberRuntimeReady,
      );
    };
  }, [clearPlaybackGate]);

  React.useEffect(() => {
    if (!shouldPurgeContinuityCaches()) return;

    albumSessionAbortRef.current?.abort();
    albumSessionAbortRef.current = null;

    albumSessionCacheRef.current.clear();
    albumSessionInFlightRef.current.clear();
    tokenCacheRef.current.clear();
    standbyRef.current = null;
    anonSampleSessionRef.current = null;
  }, [shouldPurgeContinuityCaches]);

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
    const artwork = getMediaSessionArtwork(player.queueContextArtworkUrl);

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork,
      });
    } catch {}

    try {
      navigator.mediaSession.playbackState =
        mediaSessionPlaybackStateForStatus(p.status);
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
    const currentTrack = player.current;
    const curId = currentTrack?.recordingId ?? "";
    const playbackId = (currentTrack?.muxPlaybackId ?? "").trim();

    const durMs =
      (playbackId ? (player.assetDurationByPlaybackId[playbackId] ?? 0) : 0) ||
      (curId ? player.durationByRecordingId[curId] : 0) ||
      currentTrack?.durationMs ||
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
    p.current?.muxPlaybackId,
    p.assetDurationByPlaybackId,
    p.durationByRecordingId,
    p.positionMs,
  ]);

  React.useEffect(() => {
    const resume = () => {
      if (engineBlockedRef.current) {
        resurfacePlaybackGate();
        return;
      }

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
  }, [
    attachActiveTrack,
    getActiveAudio,
    prefetchCurrentQueueAlbumSession,
    resurfacePlaybackGate,
  ]);

  return (
    <>
      <audio
        ref={audioARef}
        crossOrigin="anonymous"
        preload="metadata"
        style={{ display: "none" }}
      />
      <audio
        ref={audioBRef}
        crossOrigin="anonymous"
        preload="metadata"
        style={{ display: "none" }}
      />
    </>
  );
}
