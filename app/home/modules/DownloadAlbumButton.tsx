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

type Props = {
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
};

type DownloadResponse =
  | {
      ok: true;
      url: string;
      albumSlug: string;
      asset: { id: string; label: string; filename: string };
    }
  | GatePayload
  | { ok: false; error?: string };

function isGatePayload(v: unknown): v is GatePayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.ok === false && o.blocked === true && typeof o.code === "string";
}

function mergeStyle(
  a: React.CSSProperties | undefined,
  b: React.CSSProperties | undefined,
) {
  return { ...(a ?? {}), ...(b ?? {}) };
}

function readRetryAfterSeconds(res: Response): number | null {
  const v = res.headers.get("retry-after");
  if (!v) return null;
  // Retry-After can be seconds or HTTP date; we handle seconds only.
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
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

  const domain: GateDomain = "downloads";
  const verb: GateVerb = "download";

  function reportCode(code: GateCode, message?: string) {
    const result = gate(
      { verb, domain },
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

      // If server says "slow down", respect it and extend the cooldown.
      if (res.status === 429) {
        const retryAfter = readRetryAfterSeconds(res);
        if (retryAfter) setCooldownForSeconds(retryAfter);

        const dataUnknown = (await res.json().catch(() => null)) as unknown;

        // Prefer canonical gate payload messaging if present.
        if (isGatePayload(dataUnknown)) {
          const payload = dataUnknown;
          setErr(payload.message ?? payload.reason);
          return;
        }

        // Legacy fallback: { ok:false, error?: string }
        let msg: string | null = null;
        if (dataUnknown && typeof dataUnknown === "object") {
          const obj = dataUnknown as Record<string, unknown>;
          if (
            obj.ok === false &&
            "error" in obj &&
            typeof obj.error === "string"
          ) {
            msg = obj.error;
          }
        }

        setErr(
          msg ??
            (retryAfter
              ? `Please wait ${retryAfter}s and try again.`
              : "Please wait and try again."),
        );
        return;
      }

      const dataUnknown = (await res.json().catch(() => null)) as unknown;

      // Payload-first: if server emitted canonical gate payload, use it.
      if (isGatePayload(dataUnknown)) {
        const payload = dataUnknown;

        const result = gate(
          { verb, domain },
          { isSignedIn: Boolean(isSignedIn), intent: "explicit" },
        );

        if (!result.ok) {
          reportGate({
            code: payload.code,
            action: payload.action,
            domain: payload.domain,
            correlationId: payload.correlationId ?? null,
            message: payload.message ?? payload.reason,
            uiMode: result.uiMode,
          });
        }

        setErr(payload.message ?? payload.reason);
        return;
      }

      const data = dataUnknown as DownloadResponse | null;

      if (!res.ok) {
        let msg: string | null = null;

        if (data && typeof data === "object") {
          const obj = data as Record<string, unknown>;
          if ("error" in obj && typeof obj.error === "string") {
            msg = obj.error;
          }
        }

        // Fallback mapping (only when payload is missing).
        if (res.status === 401) {
          reportCode("AUTH_REQUIRED", msg ?? "Sign in required.");
          setErr(msg ?? "Sign in required.");
          return;
        }
        if (res.status === 403) {
          reportCode("ENTITLEMENT_REQUIRED", msg ?? "Not entitled.");
          setErr(msg ?? "Not entitled.");
          return;
        }
        if (res.status === 400) {
          reportCode("INVALID_REQUEST", msg ?? "Invalid request.");
          setErr(msg ?? "Invalid request.");
          return;
        }
        if (res.status === 404) {
          reportCode("PROVISIONING", msg ?? "Account still provisioning.");
          setErr(msg ?? "Account still provisioning. Try again shortly.");
          return;
        }

        reportCode("PROVISIONING", msg ?? "Temporary issue. Try again.");
        setErr(msg ?? "Temporary issue. Try again.");
        return;
      }

      if (
        !data ||
        typeof data !== "object" ||
        (data as Record<string, unknown>).ok !== true
      ) {
        reportCode("PROVISIONING", "Could not start download.");
        setErr("Could not start download.");
        return;
      }

      const okData = data as {
        ok: true;
        url: string;
        albumSlug: string;
        asset: { id: string; label: string; filename: string };
      };

      if (!okData.url) {
        reportCode("PROVISIONING", "Could not start download.");
        setErr("Could not start download.");
        return;
      }

      clearGate({ domain });
      window.location.assign(okData.url);
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

  const buttonText = busy
    ? "Preparing download…"
    : coolingDown
      ? `Download started. Button disabled for ${Math.ceil(remainingMs / 1000)}s`
      : label;

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
