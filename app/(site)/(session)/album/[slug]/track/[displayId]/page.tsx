// web/app/(site)/(session)/album/[slug]/track/[displayId]/page.tsx
import type { Metadata } from "next";
import { getTrackCanonicalMetadataBySlugAndDisplayId } from "@/lib/albums";

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

  const doc = await getTrackCanonicalMetadataBySlugAndDisplayId({
    slug: albumSlug,
    displayId: decodedDisplayId,
  });

  const trackTitle = normTitle(doc?.trackTitle) || decodedDisplayId;
  const albumTitle =
    normTitle(doc?.albumDisplayTitle) || normTitle(doc?.albumTitle);

  const display = albumTitle ? `${trackTitle} | ${albumTitle}` : trackTitle;

  const canonicalSlug = doc?.albumSlug ?? albumSlug;
  const canonicalDisplayId = normTitle(doc?.displayId) || decodedDisplayId;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonicalPath = `/${encodeURIComponent(canonicalSlug)}/${encodeURIComponent(
    canonicalDisplayId,
  )}`;
  const canonical = appUrl ? `${appUrl}${canonicalPath}` : canonicalPath;
  const artworkUrl = normTitle(doc?.artworkUrl) || undefined;
  const artworkAlt = albumTitle
    ? `${albumTitle} album artwork`
    : `${display} artwork`;

  return {
    title: display,
    alternates: { canonical },
    openGraph: {
      title: display,
      url: canonical,
      images: artworkUrl
        ? [
            {
              url: artworkUrl,
              width: 1200,
              height: 1200,
              alt: artworkAlt,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      title: display,
      images: artworkUrl ? [artworkUrl] : undefined,
    },
  };
}

export default function AlbumTrackCanonicalPage() {
  // Canonical URL surface only.
  // Actual render happens in /(session)/@runtime/album/[slug]/track/[displayId]/page.tsx.
  return null;
}
