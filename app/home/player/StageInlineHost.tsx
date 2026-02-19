// web/app/home/player/StageInlineHost.tsx
"use client";

import React from "react";
import StageInline, {
  type CuesByTrackId,
  type OffsetByTrackId,
} from "./StageInline";

type Props = {
  height: number;
  cuesJson: string; // JSON.stringify(cuesByTrackId)
  offsetsJson: string; // JSON.stringify(offsetByTrackId)
  sig: string; // stable signature computed on server
};

type Parsed = {
  sig: string;
  cuesByTrackId: Record<string, unknown>;
  offsetByTrackId: Record<string, unknown>;
};

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object") return v as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

/**
 * Prevents StageInline from receiving brand-new object identities
 * on every /home/* server navigation when the content hasn't changed.
 */
export default function StageInlineHost(props: Props) {
  const { height, cuesJson, offsetsJson, sig } = props;

  const [parsed, setParsed] = React.useState<Parsed>(() => ({
    sig,
    cuesByTrackId: safeParse(cuesJson),
    offsetByTrackId: safeParse(offsetsJson),
  }));

  React.useEffect(() => {
    if (parsed.sig === sig) return;

    setParsed({
      sig,
      cuesByTrackId: safeParse(cuesJson),
      offsetByTrackId: safeParse(offsetsJson),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]); // intentionally keyed only on sig

  return (
    <StageInline
      height={height}
      cuesByTrackId={parsed.cuesByTrackId as CuesByTrackId}
      offsetByTrackId={parsed.offsetByTrackId as OffsetByTrackId}
    />
  );
}
