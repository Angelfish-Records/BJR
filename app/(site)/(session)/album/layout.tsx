// web/app/(site)/album/layout.tsx
import React from "react";
import ShadowHomeFrame from "@/app/home/ShadowHomeFrame";

export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function AlbumLayout(props: { children: React.ReactNode }) {
  return (
    <ShadowHomeFrame
      // Album pages previously kept the overlay inert.
      lyricsOverlayZIndex={0}
      stageHeight={560}
      shadowHomeSlug="home"
    >
      {props.children}
    </ShadowHomeFrame>
  );
}