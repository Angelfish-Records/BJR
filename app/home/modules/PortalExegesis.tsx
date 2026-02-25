// web/app/home/modules/PortalExegesis.tsx
"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ExegesisTrackClient from "@/app/(site)/exegesis/[trackId]/ExegesisTrackClient";

type CatalogueOk = {
  ok: true;
  albums: Array<{
    albumId: string;
    albumSlug: string | null;
    albumTitle: string | null;
    tracks: Array<{
      trackId: string;
      title: string | null;
      artist?: string | null;
    }>;
    trackIds?: string[]; // legacy fallback if ever present
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
  catalogue: CatalogueOk | null,
  trackId: string | null,
): { title: string | null; artist: string | null } {
  const tid = (trackId ?? "").trim();
  if (!catalogue || !tid) return { title: null, artist: null };

  for (const a of catalogue.albums ?? []) {
    for (const t of a.tracks ?? []) {
      if ((t.trackId ?? "").trim() === tid) {
        return {
          title: (t.title ?? "").trim() || null,
          artist: (t.artist ?? "").trim() || null,
        };
      }
    }
  }
  return { title: null, artist: null };
}

export default function PortalExegesis(props: { title?: string }) {
  const title = props.title ?? "Exegesis";

  const pathname = usePathname() ?? "";
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp?.toString() ? `?${sp.toString()}` : "";

  const trackId = extractTrackIdFromPath(pathname);

  // -------- index state --------
  const [catalogue, setCatalogue] = React.useState<CatalogueOk | null>(null);
  const [catalogueErr, setCatalogueErr] = React.useState("");
  const [catalogueLoading, setCatalogueLoading] = React.useState(false);

  // -------- track state --------
  const [lyrics, setLyrics] = React.useState<LyricsOk | null>(null);
  const [lyricsErr, setLyricsErr] = React.useState("");
  const [lyricsLoading, setLyricsLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    async function loadIndex() {
      setCatalogueLoading(true);
      setCatalogueErr("");
      try {
        const r = await fetch("/api/lyrics/catalogue", { cache: "no-store" });
        const j = (await r.json()) as CatalogueOk | CatalogueErr;
        if (!alive) return;
        if (!j.ok) {
          setCatalogueErr(j.error || "Failed to load catalogue.");
          setCatalogue(null);
          return;
        }
        setCatalogue(j);
      } catch {
        if (!alive) return;
        setCatalogueErr("Failed to load catalogue.");
        setCatalogue(null);
      } finally {
        if (!alive) return;
        setCatalogueLoading(false);
      }
    }

    if (!trackId) void loadIndex();

    return () => {
      alive = false;
    };
  }, [trackId]);

  React.useEffect(() => {
    let alive = true;

    async function loadTrack(tid: string) {
      setLyricsLoading(true);
      setLyricsErr("");
      setLyrics(null);

      try {
        const url = `/api/lyrics/by-track?trackId=${encodeURIComponent(tid)}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as LyricsOk | LyricsErr;
        if (!alive) return;

        if (!j.ok) {
          setLyricsErr(j.error || "Failed to load lyrics.");
          return;
        }

        setLyrics(j);
      } catch {
        if (!alive) return;
        setLyricsErr("Failed to load lyrics.");
      } finally {
        if (!alive) return;
        setLyricsLoading(false);
      }
    }

    if (trackId) void loadTrack(trackId);

    return () => {
      alive = false;
    };
  }, [trackId]);

  // -------- render --------
  if (trackId) {
    const meta = getTrackMeta(catalogue, trackId);
    const trackTitle = meta.title;
    const trackArtist = meta.artist;
    return (
      <div style={{ minWidth: 0 }}>
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <button
            className="text-sm opacity-70 hover:opacity-100 underline underline-offset-4"
            onClick={() => router.push(`/exegesis${search}`)}
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
          <ExegesisTrackClient
            trackId={lyrics.trackId}
            trackTitle={trackTitle}
            trackArtist={trackArtist}
            lyrics={lyrics}
            canonicalPath={`/exegesis/${encodeURIComponent(lyrics.trackId)}`}
          />
        ) : null}
      </div>
    );
  }

  // index
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="text-xs opacity-60 tracking-[0.14em]">EXEGESIS</div>
      <h1 className="mt-1 text-xl font-semibold">{title}</h1>
      <div className="mt-1 text-sm opacity-70">
        Choose a track to read lyrics and discuss line-by-line.
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
                  {(a.tracks ?? []).map((t) => {
                    const tid = (t.trackId ?? "").trim();
                    if (!tid) return null;

                    const label = (t.title ?? "").trim() || tid;

                    return (
                      <Link
                        key={tid}
                        href={`/exegesis/${encodeURIComponent(tid)}${search}`}
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
