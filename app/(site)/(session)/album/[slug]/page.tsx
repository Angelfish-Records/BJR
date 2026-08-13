// web/app/(site)/(session)/album/[slug]/page.tsx
import type { Metadata } from "next";
import { getAlbumCanonicalMetadataBySlug } from "@/lib/albums";

function normTitle(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  const decodedSlug = decodeURIComponent((slug ?? "").trim());
  const albumSlug = decodedSlug.toLowerCase();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  const doc = await getAlbumCanonicalMetadataBySlug(decodedSlug);

  const display =
    normTitle(doc?.displayTitle) || normTitle(doc?.title) || decodedSlug;

  const canonicalPath = `/${encodeURIComponent(doc?.slug ?? albumSlug)}`;
  const canonical = appUrl ? `${appUrl}${canonicalPath}` : canonicalPath;
  const artworkUrl = normTitle(doc?.artworkUrl) || undefined;

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
              alt: `${display} album artwork`,
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

export default function AlbumCanonicalPage() {
  // Canonical URL surface only.
  // Actual render happens in /(session)/@runtime/album/[slug]/page.tsx.
  return null;
}
