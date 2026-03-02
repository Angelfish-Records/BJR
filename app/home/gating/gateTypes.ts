export type GateUiMode = "none" | "inline" | "global";
export type GateAction = "login" | "subscribe" | "buy" | "wait";

export type GateCode =
  | "AUTH_REQUIRED"
  | "ENTITLEMENT_REQUIRED"
  | "TIER_REQUIRED"
  | "EMBARGO"
  | "PROVISIONING"
  | "READ_RECEIPTS_CAP_REACHED"
  | "PLAYBACK_CAP_REACHED"
  | "INVALID_REQUEST";

export type GateReason = {
  code: GateCode;
  action: GateAction;
  message: string;
  correlationId?: string | null;
  // optional: for analytics / tailored copy
  domain?: "playback" | "journal" | "exegesis" | "mailbag" | "generic";
};