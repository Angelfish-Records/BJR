"use client";

import React from "react";

type Props = {
  albumSlug: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;

  // NEW
  variant?: "default" | "primary" | "ghost" | "link";
  fullWidth?: boolean;
  buttonStyle?: React.CSSProperties;
};

type CreateCheckoutResponse =
  | { ok: true; url: string }
  | { ok: false; error?: string };

function mergeStyle(
  a: React.CSSProperties | undefined,
  b: React.CSSProperties | undefined,
) {
  return { ...(a ?? {}), ...(b ?? {}) };
}

export default function BuyAlbumButton(props: Props) {
  const {
    albumSlug,
    label = "Buy digital album",
    disabled,
    className,
    style,

    variant = "default",
    fullWidth = false,
    buttonStyle,
  } = props;

  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const onClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setErr(null);

    try {
      const res = await fetch("/api/stripe/create-album-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ albumSlug }),
      });

      const data = (await res
        .json()
        .catch(() => null)) as CreateCheckoutResponse | null;

      if (!res.ok || !data || data.ok !== true || !data.url) {
        const msg =
          data && data.ok === false && data.error
            ? data.error
            : "Could not start checkout.";
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
    borderRadius: 14, // more Bandcamp-y than pill
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 650,
    cursor: busy || disabled ? "not-allowed" : "pointer",
    opacity: busy || disabled ? 0.55 : 1,
    width: fullWidth ? "100%" : undefined,
  };

  const variants: Record<NonNullable<Props["variant"]>, React.CSSProperties> = {
    default: {
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.04)",
      fontSize: 13,
      fontWeight: 600,
      padding: "8px 12px",
      opacity: busy || disabled ? 0.55 : 0.9,
    },
    primary: {
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.92)", // “white screenshot” energy
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

  return (
    <div className={className} style={style}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        style={computed}
      >
        {busy ? "Opening checkout…" : label}
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
