// web/app/(site)/(session)/@runtime/album/[slug]/track/[recordingId]/page.tsx
import React from "react";
import AlbumRuntimePage from "../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AlbumTrackRuntimePage(props: {
  params: Promise<{ slug: string; recordingId: string }>;
}) {
  const { slug } = await props.params;
  return <AlbumRuntimePage params={Promise.resolve({ slug })} />;
}