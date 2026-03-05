// web/app/home/player/share.ts
"use client";

import type { AlbumInfo, PlayerTrack } from "@/lib/types";
import { buildShareTarget, performShare, type ShareMethod } from "@/lib/share";

export type PlayerShareContext = {
  albumSlug?: string;
  albumId?: string;
  albumTitle?: string;
  albumArtist?: string;
};

function clean(s?: string | null) {
  const t = (s ?? "").toString().trim();
  return t.length ? t : undefined;
}

type AlbumResolveOk = {
  ok: true;
  album: {
    id: string;
    catalogueId: string | null;
    slug: string;
    // `displayTitle` should be the human/stylised title (e.g. "GOD DEFEND").
    // `title` remains as a fallback.
    displayTitle?: string | null;
    title: string;
    artist?: string;
    artworkUrl: string | null;
  };
};

type AlbumResolveErr = { ok: false; error: string };
type AlbumResolveResponse = AlbumResolveOk | AlbumResolveErr;

async function resolveAlbumMeta(
  ctx: PlayerShareContext,
  opts?: { origin?: string },
): Promise<
  Required<Pick<PlayerShareContext, "albumSlug">> & PlayerShareContext
> {
  const existingSlug = clean(ctx.albumSlug);
  if (existingSlug) return { ...ctx, albumSlug: existingSlug };

  const albumId = clean(ctx.albumId);
  if (!albumId) {
    throw new Error("Cannot share: missing albumSlug and albumId.");
  }

  const base = clean(opts?.origin);
  const url = base
    ? `${base.replace(/\/+$/, "")}/api/albums/by-id?albumId=${encodeURIComponent(albumId)}`
    : `/api/albums/by-id?albumId=${encodeURIComponent(albumId)}`;

  const res = await fetch(url, { method: "GET" });
  const data = (await res
    .json()
    .catch(() => null)) as AlbumResolveResponse | null;

  if (!res.ok || !data || data.ok !== true) {
    const msg =
      data && data.ok === false
        ? data.error
        : `Album resolve failed (${res.status})`;
    throw new Error(`Cannot share: ${msg}`);
  }

  const resolvedSlug = clean(data.album.slug);
  if (!resolvedSlug)
    throw new Error("Cannot share: resolved album is missing slug.");

  const resolvedTitle =
    clean(data.album.displayTitle) ?? clean(data.album.title);

  return {
    ...ctx,
    albumSlug: resolvedSlug,
    albumTitle: clean(ctx.albumTitle) ?? resolvedTitle,
    albumArtist: clean(ctx.albumArtist) ?? clean(data.album.artist),
  };
}

export async function shareAlbum(
  ctx: PlayerShareContext,
  opts?: { methodHint?: ShareMethod; origin?: string },
) {
  const full = await resolveAlbumMeta(ctx, { origin: opts?.origin });

  const target = buildShareTarget({
    type: "album",
    methodHint: opts?.methodHint,
    origin: opts?.origin,
    album: {
      slug: full.albumSlug,
      id: full.albumId,
      title: clean(full.albumTitle) ?? "Album",
      artistName: clean(full.albumArtist),
    },
  });
  return performShare(target);
}

export async function shareTrack(
  ctx: PlayerShareContext,
  t: PlayerTrack,
  opts?: { methodHint?: ShareMethod; origin?: string },
) {
  const full = await resolveAlbumMeta(ctx, { origin: opts?.origin });

  const target = buildShareTarget({
    type: "track",
    methodHint: opts?.methodHint,
    origin: opts?.origin,
    album: {
      slug: full.albumSlug,
      id: full.albumId,
      title: clean(full.albumTitle) ?? "Album",
      artistName: clean(full.albumArtist ?? t.artist),
    },
    track: {
      recordingId: t.recordingId,
      displayId: t.displayId,
      title: clean(t.title) ?? t.displayId,
    },
  });
  return performShare(target);
}

export function deriveShareContext(args: {
  albumSlug?: string;
  album: AlbumInfo | null;
  queueArtist?: string;
  albumId?: string;
}): PlayerShareContext {
  const albumId = args.albumId ?? args.album?.catalogueId ?? args.album?.id;

  const displayTitle = clean(
    (args.album as { displayTitle?: string | null } | null)?.displayTitle,
  );

  return {
    albumSlug: clean(args.albumSlug),
    albumId: clean(albumId),
    albumTitle: displayTitle ?? clean(args.album?.title),
    albumArtist: clean(args.album?.artist ?? args.queueArtist),
  };
}
