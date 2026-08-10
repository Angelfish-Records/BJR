//web/app/home/gating/GateBroker.tsx
"use client";

import React from "react";
import type {
  GateAction,
  GateCodeRaw,
  GateDomain,
  GateReason,
  GateUiMode,
} from "@/app/home/gating/gateTypes";
import { canonicalizeLegacyCapCode } from "@/app/home/gating/gateTypes";

export type GateReport = {
  code: GateCodeRaw;
  action: GateAction;
  message: string;
  domain: GateDomain;
  uiMode: GateUiMode; // REQUIRED: adapters must ask engine
  correlationId?: string | null;
};

export type GateState = {
  active: GateReason | null;
  uiMode: GateUiMode;
  lastSetAtMs: number | null;
};

type Ctx = {
  gate: GateState;
  reportGate: (r: GateReport) => void;
  clearGate: (opts?: { domain?: GateDomain }) => void;
};

const GateBrokerContext = React.createContext<Ctx | null>(null);

export function GateBrokerProvider(
  props: Readonly<{ children: React.ReactNode }>,
) {
  const [gate, setGate] = React.useState<GateState>({
    active: null,
    uiMode: "none",
    lastSetAtMs: null,
  });

  const reportGate = React.useCallback((r: GateReport) => {
    const normalized = canonicalizeLegacyCapCode(r.code, r.domain);

    setGate((prev) => {
      const nextReason: GateReason = {
        code: normalized,
        action: r.action,
        message: r.message,
        correlationId: r.correlationId ?? null,
        domain: r.domain,
      };

      // Idempotent-ish: don’t churn state if nothing meaningful changed.
      const prevActive = prev.active;
      const same =
        prevActive?.code === nextReason.code &&
        prevActive?.action === nextReason.action &&
        prevActive?.message === nextReason.message &&
        (prevActive?.correlationId ?? null) ===
          (nextReason.correlationId ?? null) &&
        (prevActive?.domain ?? "generic") ===
          (nextReason.domain ?? "generic");

      if (same) return prev;

      if (!r.uiMode) {
        // This should be impossible once adapters are spine-aligned.
        // Keep the crash dev-only so prod sessions don't brick if an edge path regresses.
        if (process.env.NODE_ENV !== "production") {
          throw new Error(
            `[GateBroker] Missing uiMode in reportGate (domain=${r.domain}, code=${normalized})`,
          );
        }
      }

      return {
        active: nextReason,
        uiMode: r.uiMode ?? "inline",
        lastSetAtMs: Date.now(),
      };
    });
  }, []);

  const clearGate = React.useCallback((opts?: { domain?: GateDomain }) => {
    setGate((prev) => {
      if (!prev.active) return prev;
      if (opts?.domain && (prev.active.domain ?? "generic") !== opts.domain)
        return prev;
      return { active: null, uiMode: "none", lastSetAtMs: prev.lastSetAtMs };
    });
  }, []);

  const value = React.useMemo<Ctx>(
    () => ({ gate, reportGate, clearGate }),
    [gate, reportGate, clearGate],
  );

  return (
    <GateBrokerContext.Provider value={value}>
      {props.children}
    </GateBrokerContext.Provider>
  );
}

export function useGateBroker(): Ctx {
  const ctx = React.useContext(GateBrokerContext);
  if (!ctx) {
    throw new Error("useGateBroker must be used within GateBrokerProvider");
  }
  return ctx;
}
