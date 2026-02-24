import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ trackId: string }>;
}): Promise<Metadata> {
  const { trackId } = await props.params;

  const raw = decodeURIComponent(trackId ?? "").trim();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonical = appUrl
    ? `${appUrl}/exegesis/${encodeURIComponent(raw || trackId)}`
    : `/exegesis/${encodeURIComponent(raw || trackId)}`;

  return {
    title: raw || trackId,
    alternates: { canonical },
  };
}

export default function ExegesisTrackCanonicalPage() {
  // Canonical URL surface only.
  // Render happens in /(session)/@runtime/exegesis/[trackId]/page.tsx
  return null;
}