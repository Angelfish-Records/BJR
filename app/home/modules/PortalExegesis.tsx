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
    trackIds: string[]; // legacy
    tracks?: Array<{
      trackId: string;
      title: string | null;
      artist: string | null;
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
  const trackId = (trackIdFromPath ?? exegesisTrackId ?? "").trim() || null;

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
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <button
            className="text-sm opacity-70 hover:opacity-100 underline underline-offset-4"
            onClick={() => {
              setExegesisTrackId(null);
              router.push(`/exegesis${search}`);
            }}
          >
            ← Back to all tracks
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
    <div className="mx-auto max-w-5xl px-4 py-6">
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
        <div className="mt-6 space-y-6">
          {catalogue.albums.map((a) => {
            const label = a.albumTitle || a.albumSlug || a.albumId || "Album";
            return (
              <div key={a.albumId} className="rounded-xl bg-white/5 p-4">
                <div className="text-sm font-semibold opacity-90">{label}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(a.tracks && a.tracks.length
                    ? a.tracks
                    : (a.trackIds ?? []).map((tid) => ({
                        trackId: tid,
                        title: null,
                        artist: null,
                      }))
                  ).map((t) => {
                    const tid = (t.trackId ?? "").trim();
                    if (!tid) return null;

                    const label = (t.title ?? "").trim() || tid;

                    return (
                      <Link
                        key={tid}
                        href={`/exegesis/${encodeURIComponent(tid)}${search}`}
                        onMouseEnter={() => prefetchTrack(tid)}
                        onFocus={() => prefetchTrack(tid)}
                        className="rounded-md bg-black/20 px-3 py-2 text-sm hover:bg-white/10"
                        title={tid}
                      >
                        {label}
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
