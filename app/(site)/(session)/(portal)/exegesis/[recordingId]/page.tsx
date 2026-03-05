// web/app/(site)/(session)/(portal)/exegesis/[recordingId]/page.tsx
import type { Metadata } from "next";

export async function generateMetadata(props: {
  params: Promise<{ recordingId: string }>;
}): Promise<Metadata> {
  const { recordingId } = await props.params;

  const raw = decodeURIComponent(recordingId ?? "").trim();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonical = appUrl
    ? `${appUrl}/exegesis/${encodeURIComponent(raw || recordingId)}`
    : `/exegesis/${encodeURIComponent(raw || recordingId)}`;

  return {
    title: raw || recordingId,
    alternates: { canonical },
  };
}

export default function ExegesisTrackCanonicalPage() {
  // Canonical URL surface only.
  // Actual render happens in /(session)/@runtime/exegesis/[recordingId]/page.tsx.
  return null;
}
