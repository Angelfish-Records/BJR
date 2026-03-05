// web/app/(site)/(session)/album/[slug]/page.tsx

import type { Metadata } from "next";
// Adjust this import to wherever your Sanity client lives.
// Common patterns in your repo: "@/sanity/lib/client" or "@/sanity/client".
import { client } from "@/sanity/lib/client";

type AlbumTitleDoc = {
  title?: string | null;
  displayTitle?: string | null;
  slug?: { current?: string | null } | null;
};

function normTitle(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  const decodedSlug = decodeURIComponent((slug ?? "").trim());
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  // Fetch the album’s real title(s) from Sanity, never derive from slug.
  const doc = await client.fetch<AlbumTitleDoc | null>(
    `*[_type == "album" && slug.current == $slug][0]{
      title,
      displayTitle,
      slug
    }`,
    { slug: decodedSlug }
  );

  const display =
    normTitle(doc?.displayTitle) || normTitle(doc?.title) || decodedSlug;

  const canonicalPath = `/album/${encodeURIComponent(decodedSlug)}`;
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

export default function AlbumCanonicalPage() {
  return null;
}