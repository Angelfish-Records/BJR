// web/app/(site)/(session)/album/[slug]/page.tsx
import type { Metadata } from "next";
import { client } from "@/sanity/lib/client";

type AlbumTitleDoc = {
  title?: string | null;
  displayTitle?: string | null;
  slug?: { current?: string | null } | null;
};

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

  const doc = await client.fetch<AlbumTitleDoc | null>(
    `*[_type == "album" && slug.current == $slug][0]{
      title,
      displayTitle,
      slug
    }`,
    { slug: decodedSlug },
  );

  const display =
    normTitle(doc?.displayTitle) || normTitle(doc?.title) || decodedSlug;

  const canonicalPath = `/${encodeURIComponent(doc?.slug?.current ?? albumSlug)}`;
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
  // Canonical URL surface only.
  // Actual render happens in /(session)/@runtime/album/[slug]/page.tsx.
  return null;
}
