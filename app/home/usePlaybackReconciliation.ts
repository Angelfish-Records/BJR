// web/app/home/usePlaybackReconciliation.ts
"use client";

import React from "react";
import type { AlbumNavItem, AlbumPlayerBundle } from "@/lib/types";
import { usePlayer } from "@/app/home/player/PlayerState";
import { getAutoplayFlag } from "./urlState";

function getSavedSt(slug: string): string {
  try {
    return (sessionStorage.getItem(`af_st:${slug}`) ?? "").trim();
  } catch {
    return "";
  }
}

function setSavedSt(slug: string, st: string) {
  try {
    sessionStorage.setItem(`af_st:${slug}`, st);
  } catch {}
}

type PlayerApi = ReturnType<typeof usePlayer>;

export function usePlaybackReconciliation(props: {
  player: PlayerApi;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  route: {
    albumSlug: string | null;
    displayId: string | null;
  };
  isPlayer: boolean;
  sp: URLSearchParams;
  patchQuery: (patch: Record<string, string | null | undefined>) => void;
  forceSurface: (
    surface: "player" | "portal",
    tabId?: string | null,
    mode?: "push" | "replace",
  ) => void;
  routerPush: (href: string) => void;
}) {
  const {
    player,
    bundle,
    route,
    isPlayer,
    sp,
    patchQuery,
    forceSurface,
    routerPush,
  } = props;

  const { setQueue, play, selectTrack, setPendingRecordingId } = player;

  const qAlbum = (isPlayer ? route.albumSlug : null) ?? null;
  const qDisplayId = (isPlayer ? route.displayId : null) ?? null;

  const qTrackRecordingId = React.useMemo(() => {
    if (!qDisplayId) return null;
    const hit = (bundle.tracks ?? []).find(
      (track) => track.displayId === qDisplayId,
    );
    return hit?.recordingId ?? null;
  }, [qDisplayId, bundle.tracks]);

  const qAutoplay = getAutoplayFlag(sp);
  const qShareToken = (sp.get("st") ?? sp.get("share") ?? "").trim() || null;
  const hasSt = Boolean(qShareToken);

  const currentAlbumSlug = bundle.albumSlug;
  const album = bundle.album;
  const tracks = bundle.tracks;

  const onSelectAlbum = React.useCallback(
    (slug: string) => {
      if (!slug) return;

      const out = new URLSearchParams();

      try {
        const cur = new URLSearchParams(window.location.search);

        const st = (cur.get("st") ?? "").trim();
        const share = (cur.get("share") ?? "").trim();
        const autoplay = (cur.get("autoplay") ?? "").trim();

        if (st) out.set("st", st);
        else if (share) out.set("share", share);

        if (autoplay) out.set("autoplay", autoplay);

        for (const [key, value] of cur.entries()) {
          if (key.startsWith("utm_") && value.trim()) {
            out.set(key, value.trim());
          }
        }
      } catch {
        // ignore
      }

      if (!out.get("st") && !out.get("share")) {
        const saved = getSavedSt(slug);
        if (saved) out.set("st", saved);
      }

      const query = out.toString();
      routerPush(`/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`);
    },
    [routerPush],
  );

  const forcedPlayerKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const playbackIntent = Boolean(qDisplayId) || Boolean(qAutoplay);
    if (!playbackIntent) {
      forcedPlayerKeyRef.current = null;
      return;
    }

    const intentKey = `${qAlbum ?? currentAlbumSlug}:${qDisplayId ?? ""}:${qAutoplay ? "autoplay" : ""}`;
    if (forcedPlayerKeyRef.current === intentKey) return;

    if (isPlayer) {
      forcedPlayerKeyRef.current = intentKey;
      return;
    }

    forcedPlayerKeyRef.current = intentKey;
    forceSurface("player", null, "replace");
  }, [qAlbum, currentAlbumSlug, qDisplayId, qAutoplay, isPlayer, forceSurface]);

  React.useEffect(() => {
    if (!qTrackRecordingId) return;
    selectTrack(qTrackRecordingId);
    setPendingRecordingId(undefined);
  }, [qTrackRecordingId, selectTrack, setPendingRecordingId]);

  const primedAlbumKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!album || tracks.length === 0) return;

    const primeKey = `${currentAlbumSlug}:${hasSt ? "shared" : "plain"}:${qDisplayId ?? ""}`;
    if (primedAlbumKeyRef.current === primeKey) return;

    if (player.current || player.queue.length > 0) {
      primedAlbumKeyRef.current = primeKey;
      return;
    }

    if (qDisplayId) {
      primedAlbumKeyRef.current = primeKey;
      return;
    }

    const first = tracks[0];
    if (!first?.recordingId) return;

    const ctxId = hasSt
      ? (album.catalogueId ?? undefined)
      : (album.catalogueId ?? album.id ?? undefined);

    const ctxSlug = qAlbum ?? currentAlbumSlug;

    player.setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    });

    player.selectTrack(first.recordingId);
    player.setPendingRecordingId(undefined);

    primedAlbumKeyRef.current = primeKey;
  }, [album, tracks, hasSt, qAlbum, currentAlbumSlug, qDisplayId, player]);

  const autoplayFiredRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isPlayer) return;
    if (!qAutoplay) return;
    if (!qTrackRecordingId) return;

    if (!qShareToken) {
      patchQuery({ autoplay: null });
      return;
    }

    if (!album || tracks.length === 0) return;

    const key = `${qAlbum ?? ""}:${qTrackRecordingId}:${qShareToken}`;
    if (autoplayFiredRef.current === key) return;
    autoplayFiredRef.current = key;

    const ctxId = hasSt
      ? (album.catalogueId ?? undefined)
      : (album.catalogueId ?? album.id ?? undefined);

    const ctxSlug = qAlbum ?? currentAlbumSlug;

    setQueue(tracks, {
      contextId: ctxId,
      contextSlug: ctxSlug,
      contextTitle: album.title ?? undefined,
      contextArtist: album.artist ?? undefined,
      artworkUrl: album.artworkUrl ?? null,
    });

    const selectedTrack =
      tracks.find((track) => track.recordingId === qTrackRecordingId) ?? null;

    if (selectedTrack) {
      play(selectedTrack);
    }

    patchQuery({ autoplay: null });
  }, [
    isPlayer,
    qAutoplay,
    qTrackRecordingId,
    qAlbum,
    qShareToken,
    album,
    tracks,
    hasSt,
    currentAlbumSlug,
    play,
    setQueue,
    patchQuery,
  ]);

  React.useEffect(() => {
    if (!isPlayer) return;

    const slug = qAlbum ?? currentAlbumSlug;
    if (!slug) return;

    const stFromUrl = (sp.get("st") ?? sp.get("share") ?? "").trim();

    if (stFromUrl) {
      setSavedSt(slug, stFromUrl);
      return;
    }

    const saved = getSavedSt(slug);
    if (saved) {
      patchQuery({ st: saved, share: null });
    }
  }, [isPlayer, qAlbum, currentAlbumSlug, sp, patchQuery]);

  React.useEffect(() => {
    const onOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ albumSlug?: string | null }>;
      const slug = customEvent.detail?.albumSlug ?? null;

      if (slug) {
        onSelectAlbum(slug);
        return;
      }

      forceSurface("player");
    };

    window.addEventListener("af:open-player", onOpen as EventListener);
    return () =>
      window.removeEventListener("af:open-player", onOpen as EventListener);
  }, [onSelectAlbum, forceSurface]);

  return {
    onSelectAlbum,
  };
}
