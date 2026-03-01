// web/app/(site)/(session)/layout.tsx
import React from "react";
import ShadowHomeFrame from "@/app/home/ShadowHomeFrame";

export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function SessionLayout(props: {
  // Parallel route slot:
  // we render ALL “player vs portal” runtime inside this slot.
  runtime: React.ReactNode;
}) {
  return (
    <ShadowHomeFrame lyricsOverlayZIndex={50} stageHeight={560} shadowHomeSlug="home">
      {props.runtime}
    </ShadowHomeFrame>
  );
}