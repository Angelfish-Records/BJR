import type { AlbumInfo, PlayerTrack } from "@/lib/types";

type JsonLd = Record<string, unknown>;

function iso8601DurationFromMs(ms: number): string | null {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Schema.org accepts ISO 8601 durations like PT3M28S
  return `PT${minutes}M${seconds}S`;
}

function stripUndefined<T>(v: T): T {
  // JSON.stringify already drops undefined in objects; this is just for clarity in composition.
  return v;
}

export function musicAlbumJsonLd(args: {
  album: AlbumInfo;
  tracks: PlayerTrack[];
  pageUrl: string; // canonical URL for *this* rendering of the album
}): JsonLd {
  const { album, tracks, pageUrl } = args;

  const sameAs =
    Array.isArray(album.platformLinks) && album.platformLinks.length
      ? album.platformLinks
          .map((x) => (typeof x?.url === "string" ? x.url.trim() : ""))
          .filter((u) => u.startsWith("https://"))
      : [];

  const trackItems = Array.isArray(tracks)
    ? tracks
        .map((t, idx) => {
          const name =
            typeof t.title === "string" && t.title.trim().length
              ? t.title.trim()
              : t.id;

          const dur = typeof t.durationMs === "number" ? iso8601DurationFromMs(t.durationMs) : null;

          const rec: JsonLd = {
            "@type": "MusicRecording",
            name,
            position: idx + 1,
            // Use canonical IDs if present
            identifier: t.catalogId
              ? {
                  "@type": "PropertyValue",
                  propertyID: "catalogId",
                  value: t.catalogId,
                }
              : undefined,
            duration: dur ?? undefined,
            // Optional: mark explicit content if you want machines to know (kept simple)
            // contentRating: t.explicit ? "Explicit" : undefined,
          };

          return rec;
        })
        .filter(Boolean)
    : [];

  const byArtistName =
    (typeof album.artist === "string" && album.artist.trim()) || "Unknown Artist";

  const image =
    typeof album.artworkUrl === "string" && album.artworkUrl.startsWith("https://")
      ? album.artworkUrl
      : undefined;

  // Prefer embargo/public releaseAt if you store it in policy, else year
  const datePublished =
    (album.policy?.releaseAt && typeof album.policy.releaseAt === "string" && album.policy.releaseAt.trim())
      ? album.policy.releaseAt
      : (typeof album.year === "number" && Number.isFinite(album.year))
        ? `${album.year}-01-01`
        : undefined;

  const out: JsonLd = stripUndefined({
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: album.title ?? "Untitled",
    url: pageUrl,
    image,
    datePublished,
    byArtist: {
      "@type": "MusicGroup",
      name: byArtistName,
    },
    identifier: album.catalogId
      ? {
          "@type": "PropertyValue",
          propertyID: "catalogId",
          value: album.catalogId,
        }
      : undefined,
    numTracks: Array.isArray(tracks) ? tracks.length : undefined,
    track: trackItems.length ? trackItems : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  });

  return out;
}
