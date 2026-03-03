//web/app/home/gating/gateTypes.ts
export type GateUiMode = "none" | "inline" | "global" | "spotlight";
export type GateAction = "login" | "subscribe" | "buy" | "wait";

export type GateDomain =
  | "playback"
  | "downloads"
  | "journal"
  | "exegesis"
  | "mailbag"
  | "generic";

/**
 * Canonical, domain-explicit reasons (stable vocabulary).
 */
export type GateCode =
  | "AUTH_REQUIRED"
  | "ENTITLEMENT_REQUIRED"
  | "TIER_REQUIRED"
  | "EMBARGO"
  | "PROVISIONING"
  | "READ_RECEIPTS_CAP_REACHED"
  | "PLAYBACK_CAP_REACHED"
  | "JOURNAL_READ_CAP_REACHED"
  | "EXEGESIS_THREAD_READ_CAP_REACHED"
  | "INVALID_REQUEST";

/**
 * Temporary compatibility codes still emitted by legacy endpoints.
 * These MUST be normalized at boundaries (AudioEngine, adapters, server responses).
 */
export type LegacyGateCode = "ANON_CAP_REACHED" | "CAP_REACHED";

/**
 * “Raw” is what the outside world may hand us while migration is in progress.
 * Internal gate policy should use canonical GateCode where possible.
 */
export type GateCodeRaw = GateCode | LegacyGateCode;

export type GateReason = {
  code: GateCodeRaw;
  action: GateAction;
  message: string;
  correlationId?: string | null;
  domain: GateDomain;
};

/**
 * Normalize any raw/legacy string into a known code (canonical or legacy).
 * Unknown strings => null.
 */
export function normalizeGateCodeRaw(
  raw: string | null | undefined,
): GateCodeRaw | null {
  const c = (raw ?? "").trim();
  if (!c) return null;

  switch (c) {
    // canonical
    case "AUTH_REQUIRED":
    case "ENTITLEMENT_REQUIRED":
    case "TIER_REQUIRED":
    case "EMBARGO":
    case "PROVISIONING":
    case "READ_RECEIPTS_CAP_REACHED":
    case "PLAYBACK_CAP_REACHED":
    case "JOURNAL_READ_CAP_REACHED":
    case "INVALID_REQUEST":
      return c;

    // legacy
    case "ANON_CAP_REACHED":
    case "CAP_REACHED":
      return c;

    default:
      return null;
  }
}

/**
 * Helper for adapters that only have “raw string” codes.
 * Unknown strings => null.
 */
export function parseGateCodeRaw(
  raw: string | null | undefined,
): GateCodeRaw | null {
  return normalizeGateCodeRaw(raw);
}

/**
 * One-way canonicalization helper for legacy cap codes.
 * Use at boundaries when you KNOW the domain context (e.g. playback vs receipts).
 */
export function canonicalizeLegacyCapCode(
  raw: GateCodeRaw,
  domain: GateDomain,
): GateCodeRaw {
  if (raw !== "ANON_CAP_REACHED" && raw !== "CAP_REACHED") return raw;

  switch (domain) {
    case "playback":
      return "PLAYBACK_CAP_REACHED";
    case "journal":
      return "JOURNAL_READ_CAP_REACHED";
    case "exegesis":
      return "EXEGESIS_THREAD_READ_CAP_REACHED";
    default:
      // No silent semantic drift: if a legacy cap arrives without a known mapping,
      // keep it legacy and let the adapter/engine handle it explicitly.
      return raw;
  }
}

/**
 * Standard server->client blocked payload shape (future-proof).
 * (Not yet enforced repo-wide; introduced now so endpoints can converge.)
 */
export type GatePayload = {
  code: GateCodeRaw;
  action: GateAction;
  domain: GateDomain;
  message: string;
  correlationId?: string | null;

  /**
   * Optional extra detail for logs / UX copy variants.
   * Keep as string so the server doesn't leak UI policy.
   */
  reason?: string;
};
