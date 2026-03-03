//web/app/home/gating/gate.ts
import type {
  GateAction,
  GateCode,
  GateCodeRaw,
  GateDomain,
  GateReason,
  GateUiMode,
} from "@/app/home/gating/gateTypes";
import { canonicalizeLegacyCapCode } from "@/app/home/gating/gateTypes";

export type GateVerb =
  | "play"
  | "download"
  | "openComposer"
  | "postComment"
  | "vote"
  | "report"
  | "edit"
  | "claimName"
  | "readFullThread"
  | "markSeen";

export type GateAttempt = {
  verb: GateVerb;
  domain: GateDomain;
};

export type GateContext = {
  isSignedIn: boolean;

  /**
   * Whether this attempt was driven by explicit user intent (click/tap)
   * versus passive system behavior (prefetch, background hydration, queue priming).
   * Used for spotlight eligibility.
   */
  intent?: "passive" | "explicit";

  // optional capability flags (fill per-domain as you adopt)
  hasEntitlement?: boolean;
  hasTierAccess?: boolean;

  // lifecycle flags
  isEmbargoed?: boolean;
  isProvisioning?: boolean;

  // caps (domain-explicit)
  playbackCapReached?: boolean;
  readReceiptsCapReached?: boolean;
  journalReadCapReached?: boolean;
  exegesisThreadReadCapReached?: boolean;
};

export type GateOk = { ok: true };

export type GateBlocked = {
  ok: false;
  reason: GateReason & { code: GateCode };
  uiMode: GateUiMode;
  cta: { action: GateAction; label: string };
};

export type GateResult = GateOk | GateBlocked;

function defaultMessageFor(code: GateCode, verb: GateVerb): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Sign in to continue.";
    case "ENTITLEMENT_REQUIRED":
      return verb === "download"
        ? "Downloads are for members."
        : "This is for members.";
    case "TIER_REQUIRED":
      return "Upgrade your membership to access this.";
    case "EMBARGO":
      return "This content isn’t available yet.";
    case "PROVISIONING":
      return "Still setting things up. Try again shortly.";
    case "READ_RECEIPTS_CAP_REACHED":
      return "You’ve reached the anonymous activity limit.";
    case "PLAYBACK_CAP_REACHED":
      return "You’ve reached the anonymous playback limit.";
    case "JOURNAL_READ_CAP_REACHED":
      return "You’ve reached the anonymous reading limit.";
    case "EXEGESIS_THREAD_READ_CAP_REACHED":
      return "Sign in to keep reading.";
    case "INVALID_REQUEST":
      return "That request couldn’t be processed.";
  }
}

function defaultActionFor(code: GateCode): GateAction {
  switch (code) {
    case "AUTH_REQUIRED":
      return "login";
    case "ENTITLEMENT_REQUIRED":
    case "TIER_REQUIRED":
    case "READ_RECEIPTS_CAP_REACHED":
    case "PLAYBACK_CAP_REACHED":
    case "JOURNAL_READ_CAP_REACHED":
    case "EXEGESIS_THREAD_READ_CAP_REACHED":
      return "subscribe";
    case "EMBARGO":
    case "PROVISIONING":
      return "wait";
    case "INVALID_REQUEST":
      return "wait";
  }
}

function defaultUiModeFor(
  domain: GateDomain,
  code: GateCode,
  verb: GateVerb,
  intent: "passive" | "explicit",
): GateUiMode {
  // Invariants: receipts, journal, and exegesis read caps never spotlight (inline only).
  if (code === "READ_RECEIPTS_CAP_REACHED") return "inline";
  if (code === "JOURNAL_READ_CAP_REACHED") return "inline";
  if (code === "EXEGESIS_THREAD_READ_CAP_REACHED") return "inline";

  // Playback cap is the canonical “spotlight eligible” gate when intent is explicit.
  if (code === "PLAYBACK_CAP_REACHED" && intent === "explicit")
    return "spotlight";

  // Primary intent blocks tend to be global (but non-spotlight).
  if (domain === "playback" && verb === "play") return "global";
  if (verb === "download") return "global";

  // Everything else defaults to inline (action-only gating).
  return "inline";
}

/**
 * Pure policy brain. No React, no side effects.
 * You can call this from adapters or from a future GateBroker.
 */
export function gate(attempt: GateAttempt, ctx: GateContext): GateResult {
  const intent = ctx.intent ?? "passive";

  // Verbs that are allowed for anonymous users (product invariant: “read stays broadly available”).
  // You can tighten/expand this list per module over time.
  const anonAllowedVerb: boolean =
    attempt.verb === "play" ||
    attempt.verb === "readFullThread" ||
    attempt.verb === "markSeen";

  // 1) Embargo / provisioning are domain-agnostic “wait” gates.
  if (ctx.isEmbargoed) {
    const code: GateCode = "EMBARGO";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Not yet" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  if (ctx.isProvisioning) {
    const code: GateCode = "PROVISIONING";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Try again" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  // 2) Caps (domain explicit). These can apply to anonymous users.
  if (attempt.domain === "playback" && ctx.playbackCapReached) {
    const code: GateCode = "PLAYBACK_CAP_REACHED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Unlock playback" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  if (attempt.domain === "journal" && ctx.journalReadCapReached) {
    const code: GateCode = "JOURNAL_READ_CAP_REACHED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Unlock journal" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  if (attempt.domain === "exegesis" && ctx.exegesisThreadReadCapReached) {
    const code: GateCode = "EXEGESIS_THREAD_READ_CAP_REACHED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Sign in" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  if (ctx.readReceiptsCapReached) {
    const code: GateCode = "READ_RECEIPTS_CAP_REACHED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Unlock identity" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  // 3) Auth gate (only for verbs that are not allowed anonymously).
  if (!ctx.isSignedIn && !anonAllowedVerb) {
    const code: GateCode = "AUTH_REQUIRED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Sign in" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  // 4) Tier / entitlement gates (when provided by adapters).
  // These should generally be evaluated only when signed-in; otherwise you’ll prefer AUTH_REQUIRED.
  if (ctx.isSignedIn && ctx.hasTierAccess === false) {
    const code: GateCode = "TIER_REQUIRED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Upgrade" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  if (ctx.isSignedIn && ctx.hasEntitlement === false) {
    const code: GateCode = "ENTITLEMENT_REQUIRED";
    const action = defaultActionFor(code);
    return {
      ok: false,
      uiMode: defaultUiModeFor(attempt.domain, code, attempt.verb, intent),
      cta: { action, label: "Become a member" },
      reason: {
        code,
        action,
        message: defaultMessageFor(code, attempt.verb),
        domain: attempt.domain,
      },
    };
  }

  return { ok: true };
}

/**
 * Helper for normalizing server-provided codes when you know the domain.
 * This is intentionally here (engine layer) so adapters use the same rules.
 */
export function normalizeServerGateCode(
  raw: GateCodeRaw,
  domain: GateDomain,
): GateCodeRaw {
  return canonicalizeLegacyCapCode(raw, domain);
}
