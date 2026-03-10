//web/app/home/StableSessionShell.tsx
"use client";

import React from "react";
import PortalArea from "@/app/home/PortalArea";
import {
  SessionRuntimePayloadProvider,
  useSessionRuntimePayloadRecord,
} from "@/app/home/SessionRuntimePayloadContext";

function StableSessionViewport(props: { runtime: React.ReactNode }) {
  const record = useSessionRuntimePayloadRecord();
  const payload = record?.payload ?? null;

  return (
    <>
      <div aria-hidden="true" hidden>
        {props.runtime}
      </div>

      {payload ? <PortalArea {...payload} /> : null}
    </>
  );
}

export default function StableSessionShell(props: {
  runtime: React.ReactNode;
}) {
  return (
    <SessionRuntimePayloadProvider>
      <StableSessionViewport runtime={props.runtime} />
    </SessionRuntimePayloadProvider>
  );
}
