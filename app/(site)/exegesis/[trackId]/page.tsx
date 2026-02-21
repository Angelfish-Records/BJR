import React from "react";
import { notFound } from "next/navigation";
import ExegesisTrackClient from "./ExegesisTrackClient";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type LyricsApiCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};

type LyricsApiOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];
};


async function fetchLyrics(trackId: string): Promise<LyricsApiOk | null> {
  const qs = `/api/lyrics/by-track?trackId=${encodeURIComponent(trackId)}`;

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const url =
    base && /^https?:\/\//i.test(base)
      ? `${base.replace(/\/$/, "")}${qs}`
      : qs;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const unknownJson: unknown = await res.json().catch(() => null);
  if (!isLyricsApiOk(unknownJson)) return null;

  return unknownJson;
}

function isLyricsApiOk(value: unknown): value is LyricsApiOk {
  if (!value || typeof value !== "object") return false;

  const v = value as Record<string, unknown>;

  if (v.ok !== true) return false;
  if (typeof v.trackId !== "string") return false;
  if (typeof v.offsetMs !== "number") return false;
  if (typeof v.version !== "string") return false;

  if (
    v.geniusUrl !== null &&
    typeof v.geniusUrl !== "string" &&
    v.geniusUrl !== undefined
  ) {
    return false;
  }

  if (!Array.isArray(v.cues)) return false;

  for (const cue of v.cues) {
    if (!cue || typeof cue !== "object") return false;
    const c = cue as Record<string, unknown>;
    if (typeof c.lineKey !== "string") return false;
    if (typeof c.tMs !== "number") return false;
    if (typeof c.text !== "string") return false;
    if (
      c.endMs !== undefined &&
      typeof c.endMs !== "number"
    ) {
      return false;
    }
  }

  return true;
}

export default async function ExegesisTrackPage(props: {
  params: Promise<{ trackId: string }>;
}) {
  const { trackId: raw } = await props.params;
  const trackId = (raw ?? "").trim();
  if (!trackId) return notFound();

  const lyrics = await fetchLyrics(trackId);
  if (!lyrics) return notFound();

  // inside default async function ExegesisTrackPage...

  return (
    <ExegesisTrackClient
      trackId={trackId}
      lyrics={lyrics}
    />
  );
}