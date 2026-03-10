// web/app/(site)/(session)/album/layout.tsx
import React from "react";
import ShadowHomeFrame from "@/app/home/ShadowHomeFrame";

export default async function AlbumLayout(props: {
  children: React.ReactNode;
}) {
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
