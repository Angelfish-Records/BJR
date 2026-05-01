// web/app/home/modules/GiftAlbumButton.tsx
"use client";

import React from "react";

type Props = {
  albumTitle: string;
  albumSlug: string;
  ctaLabel?: string;
  className?: string;
  variant?: "default" | "primary" | "ghost" | "link";
  fullWidth?: boolean;
  style?: React.CSSProperties;
  buttonStyle?: React.CSSProperties;
};

type GiftCreateOk = {
  ok: true;
  giftId: string;
  albumSlug: string;
  recipientEmail: string;
  checkoutUrl: string;
  stripeCheckoutSessionId?: string;
  correlationId?: string;
  note?: string;
};

type GiftCreateErr = { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isGiftCreateOk(v: unknown): v is GiftCreateOk {
  if (!isRecord(v)) return false;
  return (
    v.ok === true &&
    typeof v.giftId === "string" &&
    typeof v.albumSlug === "string" &&
    typeof v.recipientEmail === "string" &&
    typeof v.checkoutUrl === "string"
  );
}

function isGiftCreateErr(v: unknown): v is GiftCreateErr {
  if (!isRecord(v)) return false;
  return v.ok === false && typeof v.error === "string";
}

function mergeStyle(
  a: React.CSSProperties | undefined,
  b: React.CSSProperties | undefined,
): React.CSSProperties {
  return { ...(a ?? {}), ...(b ?? {}) };
}

export default function GiftAlbumButton(props: Props) {
  const {
    albumTitle,
    albumSlug,
    ctaLabel = "Send as gift",
    className,
    variant = "default",
    fullWidth = false,
    style,
    buttonStyle,
  } = props;

  const [open, setOpen] = React.useState(false);
  const [toEmail, setToEmail] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailInputRef = React.useRef<HTMLInputElement | null>(null);

  const canSubmit =
    toEmail.trim().length >= 3 && toEmail.includes("@") && !busy;

  React.useEffect(() => {
    if (!open) return;

    const timeout = window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 80);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false);
  };

  async function createGift(): Promise<GiftCreateOk> {
    const returnTo = `${window.location.pathname}${window.location.search}`;

    const res = await fetch("/api/gifts/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        albumSlug,
        recipientEmail: toEmail.trim(),
        message: note,
        returnTo,
      }),
    });

    const rawText = await res.text();
    const raw: unknown = (() => {
      try {
        return JSON.parse(rawText);
      } catch {
        return null;
      }
    })();

    if (isGiftCreateOk(raw)) return raw;
    if (isGiftCreateErr(raw)) throw new Error(raw.error);

    throw new Error(
      rawText ? `HTTP_${res.status}: ${rawText}` : `HTTP_${res.status}`,
    );
  }

  const onContinueToStripe = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    try {
      const created = await createGift();
      setOpen(false);
      window.location.href = created.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    padding: "12px 14px",
    fontSize: 14,
    fontWeight: 650,
    cursor: "pointer",
    width: fullWidth ? "100%" : undefined,
    transition:
      "transform 160ms ease, border-color 160ms ease, background 160ms ease, opacity 160ms ease",
  };

  const variants: Record<NonNullable<Props["variant"]>, React.CSSProperties> = {
    default: {
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.14)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.025))",
      fontSize: 13,
      fontWeight: 600,
      padding: "10px 14px",
      opacity: 0.94,
      color: "rgba(255,255,255,0.92)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
    },
    primary: {
      border: "1px solid rgba(255,255,255,0.22)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.82))",
      color: "rgba(0,0,0,0.92)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    },
    ghost: {
      border: "1px solid rgba(255,255,255,0.16)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))",
      color: "rgba(255,255,255,0.92)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
    },
    link: {
      border: "none",
      background: "transparent",
      color: "rgba(255,255,255,0.86)",
      padding: "8px 6px",
      textDecoration: "underline",
      textUnderlineOffset: 3,
      borderRadius: 10,
    },
  };

  const triggerStyle = mergeStyle(
    mergeStyle(base, variants[variant]),
    buttonStyle,
  );

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.065), rgba(255,255,255,0.035))",
    padding: "14px 15px",
    color: "rgba(255,255,255,0.94)",
    outline: "none",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 34px rgba(0,0,0,0.18)",
    fontSize: 15,
  };

  const secondaryButtonStyle: React.CSSProperties = {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.035)",
    color: "rgba(255,255,255,0.86)",
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 650,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.55 : 1,
  };

  const primaryButtonStyle: React.CSSProperties = {
    borderRadius: 999,
    border: canSubmit
      ? "1px solid rgba(255,255,255,0.28)"
      : "1px solid rgba(255,255,255,0.08)",
    background: canSubmit
      ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(225,225,225,0.86))"
      : "rgba(255,255,255,0.055)",
    color: canSubmit ? "rgba(5,5,5,0.92)" : "rgba(255,255,255,0.36)",
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 760,
    cursor: canSubmit ? "pointer" : "not-allowed",
    boxShadow: canSubmit ? "0 16px 38px rgba(0,0,0,0.34)" : "none",
  };

  return (
    <div style={mergeStyle({ display: "inline-block" }, style)}>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true);
          setError(null);
          setBusy(false);
        }}
        style={triggerStyle}
      >
        {ctaLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Send ${albumTitle} as a gift`}
          onMouseDown={onBackdropMouseDown}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "radial-gradient(circle at 18% 12%, rgba(255,255,255,0.12), transparent 28%), radial-gradient(circle at 82% 86%, rgba(126,119,255,0.14), transparent 34%), rgba(0,0,0,0.68)",
            backdropFilter: "blur(14px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            overflowX: "clip",
            maxWidth: "100vw",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(640px, 100%)",
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.16)",
              background:
                "linear-gradient(145deg, rgba(24,24,27,0.94), rgba(12,12,14,0.94) 58%, rgba(20,20,26,0.94))",
              boxShadow:
                "0 30px 100px rgba(0,0,0,0.66), inset 0 1px 0 rgba(255,255,255,0.08)",
              padding: 24,
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 0% 20%, rgba(255,255,255,0.105), transparent 28%), radial-gradient(circle at 100% 0%, rgba(160,145,255,0.105), transparent 34%)",
                pointerEvents: "none",
              }}
            />

            <div style={{ position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", justifyItems: "start" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.045)",
                      borderRadius: 999,
                      padding: "6px 10px",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Gift album
                  </div>

                  <h2
                    style={{
                      margin: "30px 0 0",
                      color: "rgba(255,255,255,0.94)",
                      fontSize: "clamp(24px, 4vw, 34px)",
                      lineHeight: 1.05,
                      letterSpacing: "-0.045em",
                      fontWeight: 760,
                    }}
                  >
                    Send the record on.
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    flex: "0 0 auto",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.035)",
                    color: "rgba(255,255,255,0.82)",
                    padding: "9px 13px",
                    fontSize: 13,
                    fontWeight: 650,
                    cursor: "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                >
                  Close
                </button>
              </div>

              <p
                style={{
                  margin: "18px 0 0",
                  maxWidth: 520,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.66)",
                }}
              >
                You’ll be sent to Stripe to purchase{" "}
                <span style={{ color: "rgba(255,255,255,0.92)" }}>
                  {albumTitle}
                </span>{" "}
                as a gift. The recipient will receive access after checkout.
              </p>

              <div
                style={{
                  marginTop: 24,
                  display: "grid",
                  gap: 16,
                }}
              >
                <label style={{ display: "grid", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.58)",
                      fontWeight: 700,
                      letterSpacing: "0.045em",
                      textTransform: "uppercase",
                    }}
                  >
                    Recipient email
                  </span>
                  <input
                    ref={emailInputRef}
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="name@example.com"
                    inputMode="email"
                    autoComplete="email"
                    style={fieldStyle}
                  />
                </label>

                <label style={{ display: "grid", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.58)",
                      fontWeight: 700,
                      letterSpacing: "0.045em",
                      textTransform: "uppercase",
                    }}
                  >
                    Note (optional)
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={5}
                    placeholder="A short message…"
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 132,
                      lineHeight: 1.45,
                    }}
                  />
                </label>

                {error ? (
                  <div
                    style={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,105,105,0.28)",
                      background:
                        "linear-gradient(180deg, rgba(255,80,80,0.12), rgba(255,80,80,0.065))",
                      padding: "12px 14px",
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: "rgba(255,225,225,0.92)",
                    }}
                  >
                    <strong>Gift error:</strong> {error}
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  marginTop: 24,
                  paddingTop: 18,
                  borderTop: "1px solid rgba(255,255,255,0.09)",
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={onContinueToStripe}
                  style={primaryButtonStyle}
                >
                  {busy ? "Opening Stripe…" : "Continue to Stripe"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
