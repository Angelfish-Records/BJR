//web/app/home/modules/DownloadAlbumButton.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { gate, type GateVerb } from "@/app/home/gating/gate";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type {
  GateCode,
  GateDomain,
  GatePayload,
} from "@/app/home/gating/gateTypes";
import { gateResultFromPayload } from "@/app/home/gating/fromPayload";

type Props = Readonly<{
  albumSlug: string;
  assetId?: string; // default: bundle_zip
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;

  variant?: "default" | "primary" | "ghost" | "link";
  fullWidth?: boolean;
  buttonStyle?: React.CSSProperties;

  // Optional: client-side cooldown (UX)
  cooldownMs?: number; // default 10s
}>;

type ApiErr = {
  ok: false;
  error?: string;
  gate?: GatePayload;
};

type DownloadOk = {
  ok: true;
  url: string;
  albumSlug: string;
  asset: { id: string; label: string; filename: string };
};

// Back-compat: downloads may still emit a legacy top-level "blocked" payload.
// Treat it as a "gate carrier" only.
type LegacyBlockedGate = {
  ok: false;
  blocked: true;
  code: string;
  action: string;
  domain: string;
  reason?: string;
  message?: string;
  correlationId?: string | null;
};

type DownloadResponse =
  | DownloadOk
  | ApiErr
  | LegacyBlockedGate
  | { ok: false; error?: string };

const DOWNLOAD_DOMAIN: GateDomain = "downloads";
const DOWNLOAD_VERB: GateVerb = "download";

type ReportGate = ReturnType<typeof useGateBroker>["reportGate"];
type ClearGate = ReturnType<typeof useGateBroker>["clearGate"];
type ReportCode = (code: GateCode, message?: string) => void;
type SetError = (message: string | null) => void;

type HttpFailure = Readonly<{
  code: GateCode;
  reportMessage: string;
  errorMessage: string;
}>;

function isApiErrWithGate(v: unknown): v is ApiErr {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.ok !== false) return false;
  if (!("gate" in o)) return false;
  const g = o.gate as unknown;
  return Boolean(g && typeof g === "object");
}

function isLegacyBlockedGate(v: unknown): v is LegacyBlockedGate {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.ok === false && o.blocked === true && typeof o.code === "string";
}

function extractGateFromUnknown(v: unknown): GatePayload | null {
  // Preferred: wrapped envelope { ok:false; gate }
  if (isApiErrWithGate(v)) {
    const g = (v.gate as GatePayload | undefined) ?? null;
    return g;
  }

  // Back-compat: legacy blocked payload
  if (isLegacyBlockedGate(v)) {
    const code = String(v.code);
    const action = String(v.action);
    const domain = String(v.domain) as GateDomain;
    const message = String(v.message ?? v.reason ?? "Access blocked.").trim();
    return {
      code: code as GateCode,
      action: action as GatePayload["action"],
      domain,
      message,
      correlationId: v.correlationId ?? null,
    };
  }

  return null;
}

function mergeStyle(
  a: React.CSSProperties | undefined,
  b: React.CSSProperties | undefined,
) {
  return { ...a, ...b };
}

function readRetryAfterSeconds(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  // Retry-After can be seconds or HTTP date; we handle seconds only.
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function errorMessageFromUnknown(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  return typeof obj.error === "string" ? obj.error : null;
}

function legacyRateLimitErrorFromUnknown(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (obj.ok !== false) return null;
  return typeof obj.error === "string" ? obj.error : null;
}

function rateLimitFallbackMessage(retryAfter: number | null): string {
  if (retryAfter) return `Please wait ${retryAfter}s and try again.`;
  return "Please wait and try again.";
}

function httpFailureForStatus(
  status: number,
  serverMessage: string | null,
): HttpFailure {
  switch (status) {
    case 401: {
      const message = serverMessage ?? "Sign in required.";
      return { code: "AUTH_REQUIRED", reportMessage: message, errorMessage: message };
    }
    case 403: {
      const message = serverMessage ?? "Not entitled.";
      return {
        code: "ENTITLEMENT_REQUIRED",
        reportMessage: message,
        errorMessage: message,
      };
    }
    case 400: {
      const message = serverMessage ?? "Invalid request.";
      return { code: "INVALID_REQUEST", reportMessage: message, errorMessage: message };
    }
    case 404:
      return {
        code: "PROVISIONING",
        reportMessage: serverMessage ?? "Account still provisioning.",
        errorMessage:
          serverMessage ?? "Account still provisioning. Try again shortly.",
      };
    default: {
      const message = serverMessage ?? "Temporary issue. Try again.";
      return { code: "PROVISIONING", reportMessage: message, errorMessage: message };
    }
  }
}

function reportPayloadGate(
  payload: GatePayload,
  isSignedIn: boolean,
  reportGate: ReportGate,
): void {
  const result = gateResultFromPayload({
    payload,
    attempt: { verb: DOWNLOAD_VERB, domain: DOWNLOAD_DOMAIN },
    isSignedIn,
    intent: "explicit",
  });

  if (result.ok) return;

  reportGate({
    code: result.reason.code,
    action: result.reason.action,
    domain: result.reason.domain,
    correlationId: result.reason.correlationId ?? null,
    message: result.reason.message,
    uiMode: result.uiMode,
  });
}

async function handleRateLimitedResponse(
  params: Readonly<{
    res: Response;
    isSignedIn: boolean;
    reportGate: ReportGate;
    setErr: SetError;
    setCooldownForSeconds: (seconds: number) => void;
  }>,
): Promise<void> {
  const { res, isSignedIn, reportGate, setErr, setCooldownForSeconds } = params;
  const retryAfter = readRetryAfterSeconds(res);
  if (retryAfter) setCooldownForSeconds(retryAfter);

  const dataUnknown = (await res.json().catch(() => null)) as unknown;
  const gatePayload = extractGateFromUnknown(dataUnknown);

  if (gatePayload) {
    reportPayloadGate(gatePayload, isSignedIn, reportGate);
    setErr(gatePayload.message);
    return;
  }

  const message =
    legacyRateLimitErrorFromUnknown(dataUnknown) ??
    rateLimitFallbackMessage(retryAfter);
  setErr(message);
}

function handleHttpFailure(
  status: number,
  dataUnknown: unknown,
  reportCode: ReportCode,
  setErr: SetError,
): void {
  const failure = httpFailureForStatus(
    status,
    errorMessageFromUnknown(dataUnknown),
  );
  reportCode(failure.code, failure.reportMessage);
  setErr(failure.errorMessage);
}

function successUrlFromUnknown(dataUnknown: unknown): string | null {
  if (!dataUnknown || typeof dataUnknown !== "object") return null;
  const data = dataUnknown as DownloadResponse;
  if (data.ok !== true) return null;
  if (!data.url) return null;
  return data.url;
}

async function handleDownloadResponse(
  params: Readonly<{
    res: Response;
    isSignedIn: boolean;
    reportGate: ReportGate;
    reportCode: ReportCode;
    setErr: SetError;
    clearGate: ClearGate;
  }>,
): Promise<void> {
  const { res, isSignedIn, reportGate, reportCode, setErr, clearGate } = params;
  const dataUnknown = (await res.json().catch(() => null)) as unknown;

  const gatePayload = extractGateFromUnknown(dataUnknown);
  if (gatePayload) {
    reportPayloadGate(gatePayload, isSignedIn, reportGate);
    setErr(gatePayload.message);
    return;
  }

  if (!res.ok) {
    handleHttpFailure(res.status, dataUnknown, reportCode, setErr);
    return;
  }

  const url = successUrlFromUnknown(dataUnknown);
  if (!url) {
    reportCode("PROVISIONING", "Could not start download.");
    setErr("Could not start download.");
    return;
  }

  clearGate({ domain: DOWNLOAD_DOMAIN });
  window.location.assign(url);
}

function buttonTextForState(
  busy: boolean,
  coolingDown: boolean,
  remainingMs: number,
  label: string,
): string {
  if (busy) return "Preparing download…";
  if (coolingDown) {
    return `Download started`;
  }
  return label;
}

export default function DownloadAlbumButton(props: Props) {
  const {
    albumSlug,
    assetId = "bundle_zip",
    label = "Download",
    disabled,
    className,
    style,

    variant = "default",
    fullWidth = false,
    buttonStyle,

    cooldownMs = 10_000,
  } = props;

  const { isSignedIn } = useAuth();
  const { reportGate, clearGate } = useGateBroker();

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  function reportCode(code: GateCode, message?: string) {
    const result = gate(
      { verb: DOWNLOAD_VERB, domain: DOWNLOAD_DOMAIN },
      {
        isSignedIn: Boolean(isSignedIn),
        intent: "explicit",
        // For now, downloads are server-authoritative on entitlement; we only preflight auth.
        hasEntitlement: code === "ENTITLEMENT_REQUIRED" ? false : undefined,
      },
    );

    if (!result.ok) {
      reportGate({
        ...result.reason,
        // allow a more specific server-derived message when we have it
        message: message ?? result.reason.message,
        uiMode: result.uiMode,
      });
    }
  }

  // --- cooldown state (persisted) ---
  const storageKey = `dlcooldown:${albumSlug}:${assetId}`;
  const [cooldownUntil, setCooldownUntil] = React.useState<number>(0);
  const [now, setNow] = React.useState<number>(() => Date.now());

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n) && n > Date.now()) setCooldownUntil(n);
    } catch {
      // ignore
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!cooldownUntil) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [cooldownUntil]);

  const remainingMs = Math.max(0, cooldownUntil - now);
  const coolingDown = remainingMs > 0;

  const setCooldownForSeconds = React.useCallback(
    (seconds: number) => {
      const ms = Math.max(0, Math.floor(seconds * 1000));
      const until = Date.now() + ms;
      setCooldownUntil(until);
      try {
        localStorage.setItem(storageKey, String(until));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const armCooldown = React.useCallback(() => {
    const until = Date.now() + cooldownMs;
    setCooldownUntil(until);
    try {
      localStorage.setItem(storageKey, String(until));
    } catch {
      // ignore
    }
  }, [cooldownMs, storageKey]);

  const onClick = async () => {
    if (busy || disabled) return;

    // Explicit-intent preflight: don’t even hit the API if auth is required.
    if (!isSignedIn) {
      reportCode("AUTH_REQUIRED");
      setErr("Sign in to download.");
      return;
    }

    if (coolingDown) {
      // Keep it low-friction: gentle hint only.
      setErr(`Please wait ${Math.ceil(remainingMs / 1000)}s before retrying.`);
      return;
    }

    setBusy(true);
    setErr(null);

    // Start cooldown immediately so even fast failures can't be spammed.
    armCooldown();

    try {
      const res = await fetch("/api/downloads/album", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ albumSlug, assetId }),
      });

      if (res.status === 429) {
        await handleRateLimitedResponse({
          res,
          isSignedIn: Boolean(isSignedIn),
          reportGate,
          setErr,
          setCooldownForSeconds,
        });
        return;
      }

      await handleDownloadResponse({
        res,
        isSignedIn: Boolean(isSignedIn),
        reportGate,
        reportCode,
        setErr,
        clearGate,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network error.";
      reportCode("PROVISIONING", msg);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 650,
    cursor: busy || disabled || coolingDown ? "not-allowed" : "pointer",
    opacity: busy || disabled || coolingDown ? 0.55 : 1,
    width: fullWidth ? "100%" : undefined,
    userSelect: "none",
  };

  const variants: Record<NonNullable<Props["variant"]>, React.CSSProperties> = {
    default: {
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.04)",
      padding: "8px 12px",
      fontSize: 13,
      fontWeight: 600,
      opacity: busy || disabled || coolingDown ? 0.55 : 0.9,
    },
    primary: {
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.92)",
      color: "rgba(0,0,0,0.92)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    },
    ghost: {
      border: "1px solid rgba(255,255,255,0.16)",
      background: "rgba(255,255,255,0.04)",
      color: "rgba(255,255,255,0.92)",
    },
    link: {
      border: "none",
      background: "transparent",
      color: "rgba(255,255,255,0.86)",
      fontWeight: 650,
      padding: "8px 6px",
      textDecoration: "underline",
      textUnderlineOffset: 3,
    },
  };

  const computed = mergeStyle(mergeStyle(base, variants[variant]), buttonStyle);

  const buttonText = buttonTextForState(
    busy,
    coolingDown,
    remainingMs,
    label,
  );

  return (
    <div className={className} style={style}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled || coolingDown}
        style={computed}
        aria-disabled={busy || disabled || coolingDown}
      >
        {buttonText}
      </button>

      {err ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            opacity: 0.75,
            lineHeight: 1.45,
          }}
        >
          {err}
        </div>
      ) : null}
    </div>
  );
}