// web/app/home/modules/PortalExegesis.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ExegesisTrackClient from "@/app/(site)/exegesis/[trackId]/ExegesisTrackClient";
import { usePortalViewer } from "@/app/home/PortalViewerProvider";

type CatalogueOk = {
  ok: true;
  albums: Array<{
    albumId: string;
    albumSlug: string | null;
    albumTitle: string | null;
    coverUrl?: string | null; // ✅ add (source from same place as FullPlayer)
    trackIds: string[]; // legacy
    tracks?: Array<{
      trackId: string;
      title: string | null;
      artist: string | null;
      trackNo?: number | null; // optional; we can compute from index if absent
    }>;
  }>;
};
type CatalogueErr = { ok: false; error: string };

type LyricsApiCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};
type LyricsOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];

  trackTitle?: string | null;
  trackArtist?: string | null;
  trackCatalogueId?: string | null;
  albumTitle?: string | null;
  albumSlug?: string | null;
  albumCatalogueId?: string | null;
};

type LyricsErr = { ok: false; error: string };

function extractTrackIdFromPath(pathname: string): string | null {
  // We only care about the canonical path segment, query is separate.
  // Expected: /exegesis or /exegesis/<trackId>
  const parts = (pathname ?? "")
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean);
  const idx = parts.indexOf("exegesis");
  if (idx < 0) return null;
  const next = parts[idx + 1] ?? "";
  const raw = decodeURIComponent(next).trim();
  return raw ? raw : null;
}

function getTrackMeta(
  cat: CatalogueOk | null,
  tid: string,
): { title: string | null; artist: string | null } {
  const t = (tid ?? "").trim();
  if (!cat || !t) return { title: null, artist: null };
  for (const a of cat.albums ?? []) {
    for (const tr of a.tracks ?? []) {
      if ((tr.trackId ?? "").trim() === t)
        return { title: tr.title ?? null, artist: tr.artist ?? null };
    }
  }
  return { title: null, artist: null };
}

// ---- module-level caches (persist across route transitions) ----
let CATALOGUE_CACHE: CatalogueOk | null = null;
let CATALOGUE_PROMISE: Promise<CatalogueOk> | null = null;

function loadCatalogueCached(signal?: AbortSignal): Promise<CatalogueOk> {
  if (CATALOGUE_CACHE) return Promise.resolve(CATALOGUE_CACHE);
  if (CATALOGUE_PROMISE) return CATALOGUE_PROMISE;

  CATALOGUE_PROMISE = (async () => {
    const r = await fetch("/api/lyrics/catalogue", { signal });
    const j = (await r.json()) as CatalogueOk | CatalogueErr;
    if (!j.ok) throw new Error(j.error || "Failed to load catalogue.");
    CATALOGUE_CACHE = j;
    return j;
  })().finally(() => {
    // keep cache, clear in-flight
    CATALOGUE_PROMISE = null;
  });

  return CATALOGUE_PROMISE;
}

const TRACK_CACHE = new Map<string, LyricsOk>();
const TRACK_PROMISES = new Map<string, Promise<LyricsOk>>();

function loadTrackCached(tid: string, signal?: AbortSignal): Promise<LyricsOk> {
  const key = tid.trim();
  if (!key) return Promise.reject(new Error("Missing trackId"));

  const hit = TRACK_CACHE.get(key);
  if (hit) return Promise.resolve(hit);

  const inflight = TRACK_PROMISES.get(key);
  if (inflight) return inflight;

  const p = (async () => {
    const url = `/api/lyrics/by-track?trackId=${encodeURIComponent(key)}`;
    const r = await fetch(url, { cache: "no-store", signal });
    const j = (await r.json()) as LyricsOk | LyricsErr;
    if (!j.ok) throw new Error(j.error || "Failed to load lyrics.");
    TRACK_CACHE.set(key, j);
    return j;
  })().finally(() => {
    TRACK_PROMISES.delete(key);
  });

  TRACK_PROMISES.set(key, p);
  return p;
}

function prefetchTrack(tid: string) {
  // Fire-and-forget warm-up
  void loadTrackCached(tid).catch(() => {});
}

export default function PortalExegesis(props: { title?: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp?.toString() ? `?${sp.toString()}` : "";

  const { exegesisTrackId, setExegesisTrackId } = usePortalViewer();

  const trackIdFromPath = extractTrackIdFromPath(pathname);
  const trackId = (exegesisTrackId ?? trackIdFromPath ?? "").trim() || null;

  // If we had to fall back to pathname parsing, persist it into context so other
  // components (and subsequent renders) have a stable single source of truth.
  React.useEffect(() => {
    if (!exegesisTrackId && trackIdFromPath) {
      setExegesisTrackId(trackIdFromPath);
    }
  }, [exegesisTrackId, trackIdFromPath, setExegesisTrackId]);

  // -------- index state --------
  const [catalogue, setCatalogue] = React.useState<CatalogueOk | null>(null);
  const [catalogueErr, setCatalogueErr] = React.useState("");
  const [catalogueLoading, setCatalogueLoading] = React.useState(false);

  // -------- track state --------
  const [lyrics, setLyrics] = React.useState<LyricsOk | null>(null);
  const [lyricsErr, setLyricsErr] = React.useState("");
  const [lyricsLoading, setLyricsLoading] = React.useState(false);

  React.useEffect(() => {
    const ac = new AbortController();

    setCatalogueErr("");

    // If already cached, set synchronously-ish and avoid a “loading” flash
    if (CATALOGUE_CACHE) {
      setCatalogue(CATALOGUE_CACHE);
      setCatalogueLoading(false);
      return;
    }

    setCatalogueLoading(true);

    loadCatalogueCached(ac.signal)
      .then((j) => setCatalogue(j))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCatalogue(null);
        setCatalogueErr("Failed to load catalogue.");
      })
      .finally(() => setCatalogueLoading(false));

    return () => ac.abort();
  }, []);

  React.useEffect(() => {
    if (!trackId) {
      setLyrics(null);
      setLyricsErr("");
      setLyricsLoading(false);
      return;
    }

    const ac = new AbortController();
    const tid = trackId;

    setLyricsErr("");

    // If cached, render immediately with zero spinner
    const cached = TRACK_CACHE.get(tid);
    if (cached) {
      setLyrics(cached);
      setLyricsLoading(false);
      return () => ac.abort();
    }

    setLyricsLoading(true);
    setLyrics(null);

    loadTrackCached(tid, ac.signal)
      .then((j) => setLyrics(j))
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setLyricsErr("Failed to load lyrics.");
      })
      .finally(() => setLyricsLoading(false));

    return () => ac.abort();
  }, [trackId]);

  // -------- render --------
  if (trackId) {
    const meta = getTrackMeta(catalogue, trackId);

    const resolvedTitle =
      (lyrics?.trackTitle ?? meta.title ?? "").trim() || null;

    const resolvedArtist =
      (lyrics?.trackArtist ?? meta.artist ?? "").trim() || null;

    const noCatalogueYet = !catalogue && catalogueLoading; // still fetching

    return (
      <div style={{ minWidth: 0 }}>
        <div className="w-full px-4 pt-6">
          <button
            type="button"
            aria-label="Back to all tracks"
            className="inline-flex items-center gap-2 rounded-md p-1 opacity-70 hover:opacity-100 hover:bg-white/5"
            onClick={() => {
              setExegesisTrackId(null);
              router.push(`/exegesis${search}`);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M 9 2 A 1.0001 1.0001 0 0 0 8 3 L 8 8 A 1 1 0 0 0 9 9 A 1 1 0 0 0 10 8 L 10 4 L 18 4 L 18 20 L 10 20 L 10 16 A 1 1 0 0 0 9 15 A 1 1 0 0 0 8 16 L 8 21 A 1.0001 1.0001 0 0 0 9 22 L 19 22 A 1.0001 1.0001 0 0 0 20 21 L 20 3 A 1.0001 1.0001 0 0 0 19 2 L 9 2 z M 7.0292969 9 A 1 1 0 0 0 6.2929688 9.2929688 L 4.3125 11.273438 L 4.2929688 11.292969 A 1.0001 1.0001 0 0 0 4.2832031 11.302734 A 1 1 0 0 0 4.2363281 11.355469 A 1 1 0 0 0 4.1855469 11.421875 A 1 1 0 0 0 4.1464844 11.482422 A 1.0001 1.0001 0 0 0 4.1289062 11.509766 A 1 1 0 0 0 4.0996094 11.566406 A 1 1 0 0 0 4.0683594 11.638672 A 1.0001 1.0001 0 0 0 4.0644531 11.650391 A 1 1 0 0 0 4.0410156 11.714844 A 1.0001 1.0001 0 0 0 4.0332031 11.75 A 1 1 0 0 0 4.0234375 11.791016 A 1.0001 1.0001 0 0 0 4.015625 11.828125 A 1 1 0 0 0 4.0078125 11.871094 A 1.0001 1.0001 0 0 0 4.0019531 11.943359 A 1.0001 1.0001 0 0 0 4 11.988281 A 1 1 0 0 0 4 12 A 1 1 0 0 0 4.0019531 12.029297 A 1.0001 1.0001 0 0 0 4.0039062 12.066406 A 1 1 0 0 0 4.0078125 12.117188 A 1.0001 1.0001 0 0 0 4.0117188 12.146484 A 1 1 0 0 0 4.0253906 12.222656 A 1 1 0 0 0 4.0410156 12.28125 A 1.0001 1.0001 0 0 0 4.0546875 12.324219 A 1 1 0 0 0 4.0585938 12.337891 A 1.0001 1.0001 0 0 0 4.0878906 12.408203 A 1.0001 1.0001 0 0 0 4.1210938 12.474609 A 1 1 0 0 0 4.1347656 12.501953 A 1.0001 1.0001 0 0 0 4.1640625 12.546875 A 1 1 0 0 0 4.1777344 12.568359 A 1.0001 1.0001 0 0 0 4.2011719 12.601562 A 1 1 0 0 0 4.21875 12.623047 A 1.0001 1.0001 0 0 0 4.265625 12.677734 A 1 1 0 0 0 4.2851562 12.699219 A 1.0001 1.0001 0 0 0 4.2929688 12.707031 A 1 1 0 0 0 4.3339844 12.746094 L 6.2929688 14.707031 A 1 1 0 0 0 7.7070312 14.707031 A 1 1 0 0 0 7.7070312 13.292969 L 7.4140625 13 L 14 13 A 1 1 0 0 0 15 12 A 1 1 0 0 0 14 11 L 7.4140625 11 L 7.7070312 10.707031 A 1 1 0 0 0 7.7070312 9.2929688 A 1 1 0 0 0 7.0292969 9 z"
                fill="currentColor"
              />
            </svg>
            <span className="sr-only">Back to all tracks</span>
          </button>
        </div>

        {lyricsLoading ? (
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm opacity-75">
            Loading…
          </div>
        ) : lyricsErr ? (
          <div className="mx-auto max-w-5xl px-4 py-6">
            <div className="rounded-md bg-white/5 p-3 text-sm">{lyricsErr}</div>
          </div>
        ) : lyrics ? (
          // ✅ Gate: if catalogue is still loading, show a tiny header skeleton instead of flashing trackId
          noCatalogueYet ? (
            <div className="mx-auto max-w-5xl px-4 py-6">
              <div className="h-6 w-72 rounded bg-white/10 animate-pulse" />
              <div className="mt-2 h-4 w-40 rounded bg-white/5 animate-pulse" />
            </div>
          ) : (
            <ExegesisTrackClient
              trackId={lyrics.trackId}
              trackTitle={resolvedTitle}
              trackArtist={resolvedArtist}
              lyrics={lyrics}
              canonicalPath={`/exegesis/${encodeURIComponent(lyrics.trackId)}`}
            />
          )
        ) : null}
      </div>
    );
  }

  // index
  return (
    <div className="w-full px-4 py-6">
      <div className="text-xs opacity-60 tracking-[0.14em]">EXEGESIS</div>
      <div className="mt-1 text-sm opacity-70">
        Choose a track to read and discuss lyrics.
      </div>

      {catalogueLoading ? (
        <div className="mt-6 text-sm opacity-75">Loading…</div>
      ) : catalogueErr ? (
        <div className="mt-6 rounded-md bg-white/5 p-3 text-sm">
          {catalogueErr}
        </div>
      ) : !catalogue || (catalogue.albums ?? []).length === 0 ? (
        <div className="mt-6 text-sm opacity-60">No lyrics found.</div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.albums.map((a) => {
            const label = a.albumTitle || a.albumSlug || a.albumId || "Album";
            return (
              <div key={a.albumId} className="rounded-xl bg-white/5 p-4">
                {/* Album hero */}
                <div className="flex items-center gap-3">
                  <div
                    className="h-14 w-14 shrink-0 rounded-md border border-white/10 bg-white/5"
                    style={{
                      background: a.coverUrl
                        ? `url(${a.coverUrl}) center/cover no-repeat`
                        : undefined,
                    }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold opacity-90 truncate">
                      {label}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(a.tracks ?? []).map((t, i) => {
                    const tid = (t.trackId ?? "").trim();
                    if (!tid) return null;

                    const label = (t.title ?? "").trim() || tid;
                    const n =
                      typeof t.trackNo === "number" && t.trackNo > 0
                        ? t.trackNo
                        : i + 1;

                    return (
                      <Link
                        key={tid}
                        href={`/exegesis/${encodeURIComponent(tid)}${search}`}
                        onMouseEnter={() => prefetchTrack(tid)}
                        onFocus={() => prefetchTrack(tid)}
                        className="flex items-baseline justify-between rounded-md bg-black/20 px-3 py-2 text-sm hover:bg-white/10"
                        title={tid}
                      >
                        <span className="min-w-0 flex items-baseline gap-2">
                          <span className="w-6 shrink-0 text-[11px] opacity-40 tabular-nums">
                            {n}
                          </span>
                          <span className="truncate">{label}</span>
                        </span>

                        <span className="text-xs opacity-45">Lyrics</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
