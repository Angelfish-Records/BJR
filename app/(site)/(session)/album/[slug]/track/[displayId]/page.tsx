// web/app/(site)/(session)/album/[slug]/track/[displayId]/page.tsx
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";

type TrackMetadataDoc = {
  albumTitle?: string | null;
  albumDisplayTitle?: string | null;
  albumSlug?: string | null;
  trackTitle?: string | null;
  displayId?: string | null;
};

function normTitle(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string; displayId: string }>;
}): Promise<Metadata> {
  const { slug, displayId } = await props.params;

  const decodedSlug = decodeURIComponent((slug ?? "").trim());
  const decodedDisplayId = decodeURIComponent((displayId ?? "").trim());

  const albumSlug = decodedSlug.toLowerCase();

  const doc = await client.fetch<TrackMetadataDoc | null>(
    `*[_type == "album" && slug.current == $slug][0]{
      "albumTitle": title,
      "albumDisplayTitle": displayTitle,
      "albumSlug": slug.current,
      "trackTitle": tracks[displayId == $displayId][0].title,
      "displayId": tracks[displayId == $displayId][0].displayId
    }`,
    { slug: albumSlug, displayId: decodedDisplayId },
  );

  const trackTitle = normTitle(doc?.trackTitle) || decodedDisplayId;
  const albumTitle =
    normTitle(doc?.albumDisplayTitle) || normTitle(doc?.albumTitle);

  const display = albumTitle ? `${trackTitle} — ${albumTitle}` : trackTitle;

  const canonicalSlug = doc?.albumSlug ?? albumSlug;
  const canonicalDisplayId = normTitle(doc?.displayId) || decodedDisplayId;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonicalPath = `/${encodeURIComponent(canonicalSlug)}/${encodeURIComponent(
    canonicalDisplayId,
  )}`;
  const canonical = appUrl ? `${appUrl}${canonicalPath}` : canonicalPath;

  return {
    title: display,
    alternates: { canonical },
    openGraph: {
      title: display,
      url: canonical,
    },
    twitter: {
      title: display,
    },
  };
}

export default function AlbumTrackCanonicalPage() {
  // Canonical URL surface only.
  // Actual render happens in /(session)/@runtime/album/[slug]/track/[displayId]/page.tsx.
  return null;
}
