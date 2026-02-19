// web/app/(site)/album/[slug]/track/[trackId]/page.tsx
import React from "react";
import AlbumCanonicalPage from "../../page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AlbumTrackCanonicalPage(props: {
  params: Promise<{ slug: string; trackId: string }>;
}) {
  // AlbumCanonicalPage will render the runtime; PortalArea will read trackId from pathname.
  const { slug } = await props.params;
  return <AlbumCanonicalPage params={Promise.resolve({ slug })} />;
}
