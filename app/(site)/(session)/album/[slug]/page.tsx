// web/app/(site)/(session)/album/[slug]/page.tsx

import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  const raw = decodeURIComponent(slug ?? "").trim();
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return {
    title: raw || slug,
    alternates: {
      canonical: appUrl
        ? `${appUrl}/album/${encodeURIComponent(raw || slug)}`
        : `/album/${encodeURIComponent(raw || slug)}`,
    },
  };
}

export default function AlbumCanonicalPage() {
  return null;
}