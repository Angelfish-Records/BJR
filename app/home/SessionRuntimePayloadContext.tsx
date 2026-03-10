//web/app/home/SessionRuntimePayloadContext.tsx
"use client";

import React from "react";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

type SessionRuntimePayloadRecord = {
  routeKey: string;
  payload: SessionRuntimePayload;
};

type SessionRuntimePayloadContextValue = {
  record: SessionRuntimePayloadRecord | null;
  setRecord: React.Dispatch<
    React.SetStateAction<SessionRuntimePayloadRecord | null>
  >;
};

const SessionRuntimePayloadContext =
  React.createContext<SessionRuntimePayloadContextValue | null>(null);

export function SessionRuntimePayloadProvider(props: {
  children: React.ReactNode;
}) {
  const [record, setRecord] =
    React.useState<SessionRuntimePayloadRecord | null>(null);

  const value = React.useMemo<SessionRuntimePayloadContextValue>(
    () => ({ record, setRecord }),
    [record],
  );

  return (
    <SessionRuntimePayloadContext.Provider value={value}>
      {props.children}
    </SessionRuntimePayloadContext.Provider>
  );
}

function useSessionRuntimePayloadContext(): SessionRuntimePayloadContextValue {
  const value = React.useContext(SessionRuntimePayloadContext);
  if (!value) {
    throw new Error(
      "SessionRuntimePayloadContext is missing. Wrap with SessionRuntimePayloadProvider.",
    );
  }
  return value;
}

export function useSessionRuntimePayloadRecord(): SessionRuntimePayloadRecord | null {
  return useSessionRuntimePayloadContext().record;
}

export function SessionRuntimePayloadBridge(props: {
  routeKey: string;
  payload: SessionRuntimePayload;
}) {
  const { routeKey, payload } = props;
  const { setRecord } = useSessionRuntimePayloadContext();

  React.useLayoutEffect(() => {
    setRecord({ routeKey, payload });

    return () => {
      setRecord((current) => {
        if (!current) return current;
        if (current.routeKey !== routeKey) return current;
        return null;
      });
    };
  }, [routeKey, payload, setRecord]);

  return null;
}