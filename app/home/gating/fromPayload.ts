// web/app/home/gating/fromPayload.ts
import { gate } from "@/app/home/gating/gate";
import type {
  GateAttempt,
  GateContext,
  GateResult,
} from "@/app/home/gating/gate";
import type { GatePayload, GateDomain } from "@/app/home/gating/gateTypes";
import { canonicalizeLegacyCapCode } from "@/app/home/gating/gateTypes";

/** Narrow unknown -> GatePayload (bare or wrapped). */
function extractGatePayload(raw: unknown): GatePayload | null {
  if (!raw || typeof raw !== "object") return null;

  // Wrapped: { ok:false; gate:{...} }
  const r = raw as Record<string, unknown>;
  if (r.ok === false && "gate" in r) {
    const g = r.gate as unknown;
    if (g && typeof g === "object") {
      const gg = g as Record<string, unknown>;
      if (
        typeof gg.code === "string" &&
        typeof gg.action === "string" &&
        typeof gg.domain === "string" &&
        typeof gg.message === "string"
      ) {
        return g as GatePayload;
      }
    }
  }

  // Bare payload: { code, action, domain, message, ... }
  if (
    typeof r.code === "string" &&
    typeof r.action === "string" &&
    typeof r.domain === "string" &&
    typeof r.message === "string"
  ) {
    return raw as GatePayload;
  }

  return null;
}

/** Canonicalize legacy CAP_* to domain-specific cap codes, plus hygiene. */
function normalizePayload(payload: GatePayload): GatePayload {
  const domain = (payload.domain ?? "unknown") as GateDomain;
  const code = canonicalizeLegacyCapCode(payload.code, domain);

  return {
    ...payload,
    domain,
    code,
    message: (payload.message ?? "").trim(),
    correlationId: payload.correlationId ?? null,
  };
}

function ctxFromCode(
  codeRaw: GatePayload["code"],
  domain: GatePayload["domain"],
) {
  const code = canonicalizeLegacyCapCode(codeRaw, domain);

  return {
    readReceiptsCapReached: code === "READ_RECEIPTS_CAP_REACHED",
    playbackCapReached: code === "PLAYBACK_CAP_REACHED",
    journalReadCapReached: code === "JOURNAL_READ_CAP_REACHED",
    exegesisThreadReadCapReached: code === "EXEGESIS_THREAD_READ_CAP_REACHED",
    isEmbargoed: code === "EMBARGO",
    isProvisioning: code === "PROVISIONING",
    // tier/entitlement are “negative capability flags”
    hasTierAccess: code === "TIER_REQUIRED" ? false : undefined,
    hasEntitlement: code === "ENTITLEMENT_REQUIRED" ? false : undefined,
  } as const;
}

/**
 * Compute UI policy (uiMode + CTA) locally, based on gate() engine.
 * Server supplies only the reason (code/action/domain/message).
 *
 * This variant assumes you already have a GatePayload.
 */
export function gateResultFromPayload(opts: {
  payload: GatePayload;
  attempt: GateAttempt;
  isSignedIn?: boolean;
  intent: "passive" | "explicit";
}): GateResult {
  const payload = normalizePayload(opts.payload);

  const flags = ctxFromCode(payload.code, payload.domain);

  const ctx: GateContext = {
    isSignedIn: opts.isSignedIn ?? false,
    intent: opts.intent,
    ...flags,
  };

  const res = gate(opts.attempt, ctx);

  // Prefer server message when blocked (so copy can be server-authored),
  // but keep engine invariants for uiMode + CTA.
  if (!res.ok) {
    return {
      ...res,
      reason: {
        ...res.reason,
        // keep canonical code/action/domain from engine, but message from server
        message: payload.message || res.reason.message,
        correlationId: payload.correlationId ?? null,
      },
    };
  }

  return res;
}

/**
 * Convenience: accept unknown API JSON and (if it contains a gate) produce GateResult.
 * Returns null when no gate payload is present.
 */
export function gateResultFromUnknown(opts: {
  raw: unknown;
  attempt: GateAttempt;
  isSignedIn?: boolean;
  intent: "passive" | "explicit";
}): GateResult | null {
  const payload = extractGatePayload(opts.raw);
  if (!payload) return null;

  return gateResultFromPayload({
    payload,
    attempt: opts.attempt,
    isSignedIn: opts.isSignedIn,
    intent: opts.intent,
  });
}

/**
 * Convenience: extract + normalize just the payload (handy when you need to forward it).
 * Returns null when no gate payload is present.
 */
export function gatePayloadFromUnknown(raw: unknown): GatePayload | null {
  const payload = extractGatePayload(raw);
  return payload ? normalizePayload(payload) : null;
}
