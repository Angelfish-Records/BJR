// web/app/home/gating/fromPayload.ts
import { gate } from "@/app/home/gating/gate";
import type {
  GateAttempt,
  GateContext,
  GateResult,
} from "@/app/home/gating/gate";
import type { GatePayload } from "@/app/home/gating/gateTypes";
import { canonicalizeLegacyCapCode } from "@/app/home/gating/gateTypes";

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
 */
export function gateResultFromPayload(opts: {
  payload: GatePayload;
  attempt: GateAttempt;
  isSignedIn: boolean;
  intent: "passive" | "explicit";
}): GateResult {
  const flags = ctxFromCode(opts.payload.code, opts.payload.domain);

  const ctx: GateContext = {
    isSignedIn: opts.isSignedIn,
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
        message: opts.payload.message || res.reason.message,
        correlationId: opts.payload.correlationId ?? null,
      },
    };
  }

  return res;
}
