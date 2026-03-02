// web/app/home/player/PlaybackGateReporter.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { usePlayer } from "@/app/home/player/PlayerState";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type { GateAction } from "@/app/home/gating/gateTypes";
import {
  canonicalizeLegacyCapCode,
  parseGateCodeRaw,
} from "@/app/home/gating/gateTypes";
import { gate } from "@/app/home/gating/gate";

function isRecent(ms: number | undefined, withinMs: number): boolean {
  if (typeof ms !== "number") return false;
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < withinMs;
}

/**
 * Playback → Broker adapter.
 * Replaces the PortalArea mirror. Keeps policy in gate.ts, orchestration in Broker.
 */
export default function PlaybackGateReporter(): React.ReactElement | null {
  const p = usePlayer();
  const { reportGate, clearGate } = useGateBroker();
  const { isSignedIn: isSignedInRaw } = useAuth();
  const isSignedIn = Boolean(isSignedInRaw);

  React.useEffect(() => {
    // Explicit intent signal (used ONLY for spotlight eligibility).
    // Must be computed before narrowing p.status to "blocked".
    const explicitIntent =
      p.intent === "play" || isRecent(p.lastPlayAttemptAtMs, 12_000);

    if (p.status !== "blocked") {
      clearGate({ domain: "playback" });
      return;
    }

    const raw = parseGateCodeRaw(p.blockedCode ?? null);
    if (!raw) return;

    const normalized = canonicalizeLegacyCapCode(raw, "playback");

    const action: GateAction =
      p.blockedAction ??
      (normalized === "AUTH_REQUIRED" ? "login" : "subscribe");

    // Ask engine for presentation (uiMode), not for whether a gate exists.
    const res = gate(
      { verb: "play", domain: "playback" },
      {
        isSignedIn,
        intent: explicitIntent ? "explicit" : "passive",
        playbackCapReached: normalized === "PLAYBACK_CAP_REACHED",
      },
    );

    reportGate({
      code: normalized,
      action,
      message: (p.lastError ?? "Playback blocked.").trim(),
      correlationId: p.blockedCorrelationId ?? null,
      domain: "playback",
      uiMode: res.ok ? undefined : res.uiMode,
    });
  }, [
    p.status,
    p.blockedCode,
    p.blockedAction,
    p.blockedCorrelationId,
    p.lastError,
    p.intent,
    p.lastPlayAttemptAtMs,
    isSignedIn,
    reportGate,
    clearGate,
  ]);

  return null;
}
