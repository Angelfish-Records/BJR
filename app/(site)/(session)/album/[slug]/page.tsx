import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  const raw = decodeURIComponent(slug ?? "").trim();
  const safe = raw || slug;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonical = appUrl
    ? `${appUrl}/album/${encodeURIComponent(raw || slug)}`
    : `/album/${encodeURIComponent(raw || slug)}`;

  return {
    title: safe,
    alternates: { canonical },
  };
}

export default async function AlbumCanonicalPage() {
  // Canonical URL surface only.
  // Render happens in /(session)/@runtime/album/[slug]/page.tsx
  return null;
}
