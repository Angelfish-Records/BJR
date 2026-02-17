"use client";

import React from "react";

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
  | { ok: false; error?: string };

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

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

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
        const data = (await res.json().catch(() => null)) as DownloadResponse | null;
        const msg =
          data && data.ok === false && data.error
            ? data.error
            : retryAfter
              ? `Please wait ${retryAfter}s and try again.`
              : "Please wait and try again.";
        setErr(msg);
        return;
      }

      const data = (await res.json().catch(() => null)) as DownloadResponse | null;

      if (!res.ok || !data || data.ok !== true || !("url" in data) || !data.url) {
        const msg =
          data && data.ok === false && data.error
            ? data.error
            : "Could not start download.";
        setErr(msg);
        return;
      }

      window.location.assign(data.url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Network error.";
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

  const buttonText =
    busy ? "Preparing download…"
    : coolingDown ? `Download started. Button inactive for ${Math.ceil(remainingMs / 1000)}s`
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
