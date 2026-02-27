"use client";

import React from "react";

type Props = {
  disabled?: boolean;
  variant?: "button" | "link";
  label?: string;
};

export default function CancelSubscriptionButton({
  disabled,
  variant = "button",
  label,
}: Props) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const [confirming, setConfirming] = React.useState(false);
  const confirmTimerRef = React.useRef<number | null>(null);

  function clearConfirmTimer() {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  React.useEffect(() => {
    return () => clearConfirmTimer();
  }, []);

  const CONFIRM_MS = 6500;

  async function onCancel() {
    // Step 1: arm confirmation
    if (!confirming) {
      setMsg(null);
      setConfirming(true);
      clearConfirmTimer();
      confirmTimerRef.current = window.setTimeout(() => {
        setConfirming(false);
        confirmTimerRef.current = null;
      }, CONFIRM_MS);
      return;
    }

    // Step 2: confirmed -> execute
    clearConfirmTimer();
    setConfirming(false);

    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        canceled?: string[]; // legacy
        updated?: Array<{ id: string; cancel_at_period_end: boolean }>;
        cancelAtPeriodEnd?: boolean;
        accessUntil?: string | null; // ISO
        note?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setMsg(data?.error ?? "Cancellation failed");
        return;
      }

      const canceledCount =
        (Array.isArray(data?.canceled) ? data?.canceled.length : 0) ||
        (Array.isArray(data?.updated) ? data?.updated.length : 0);

      const until =
        typeof data?.accessUntil === "string" ? data.accessUntil : null;
      const untilLabel = until
        ? new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date(until))
        : null;

      setMsg(
        canceledCount > 0
          ? untilLabel
            ? `Cancellation successful. Your access won't change until ${untilLabel}.`
            : "Cancellation successful. Your access won't change until the end of your billing period."
          : (data?.note ?? "No active subscription found."),
      );

      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Cancellation failed");
    } finally {
      setBusy(false);
      setConfirming(false);
      clearConfirmTimer();
    }
  }

  const text = busy
    ? "Cancelling…"
    : confirming
      ? "Confirm cancellation"
      : (label ??
        (variant === "link"
          ? "Cancel subscription"
          : "Cancel subscription (now)"));

  const isDisabled = busy || !!disabled;

  return (
    <div
      style={{
        display: "grid",
        gap: variant === "link" ? 6 : 8,
        justifyItems: variant === "link" ? "start" : "center",
      }}
    >
      <style jsx>{`
        .confirmPill {
          -webkit-tap-highlight-color: transparent;
        }
        .confirmDrain {
          position: absolute;
          inset: 0;
          z-index: 1;
          background: rgba(0, 0, 0, 0.16);
          transform: translateX(0%);
          animation-name: drainLeftToRight;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
        }
        .confirmSheen {
          position: absolute;
          inset: -40% -40%;
          z-index: 1;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.12) 45%,
            rgba(255, 255, 255, 0) 70%
          );
          transform: translateX(-35%);
          mix-blend-mode: screen;
          animation-name: sheenSweep;
          animation-timing-function: linear;
          animation-fill-mode: forwards;
          pointer-events: none;
        }

        @keyframes drainLeftToRight {
          from {
            transform: translateX(0%);
          }
          to {
            transform: translateX(100%);
          }
        }

        @keyframes sheenSweep {
          from {
            transform: translateX(-35%);
            opacity: 0.9;
          }
          to {
            transform: translateX(35%);
            opacity: 0.25;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .confirmDrain,
          .confirmSheen {
            animation: none !important;
          }
        }
      `}</style>
      <button
        onClick={onCancel}
        disabled={isDisabled}
        className={confirming ? "confirmPill" : undefined}
        style={
          confirming
            ? {
                // one “final stage” container (no “original cancel” styling shown here)
                width: "max-content",
                maxWidth: "min(92vw, 520px)",
                justifySelf: "center",
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,90,90,0.35)",
                background:
                  "linear-gradient(180deg, rgba(255,80,80,0.26), rgba(255,35,35,0.18))",
                color: "rgba(255,255,255,0.92)",
                cursor: isDisabled ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.01em",
                opacity: isDisabled ? 0.6 : 1,
                position: "relative",
                overflow: "hidden",
                textAlign: "left",
                boxShadow:
                  "0 16px 44px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.12)",
              }
            : variant === "link"
              ? {
                  padding: 0,
                  margin: 0,
                  border: "none",
                  background: "transparent",
                  color:
                    "color-mix(in srgb, var(--accent) 70%, rgba(255,255,255,0.88))",
                  fontSize: 12,
                  lineHeight: "16px",
                  fontWeight: 600,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.6 : 0.95,
                  textAlign: "left",
                  justifySelf: "start",
                }
              : {
                  padding: "11px 16px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.22)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.90)",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  fontSize: 14,
                  opacity: isDisabled ? 0.6 : 1,
                }
        }
        onMouseDown={(e) => {
          if (variant === "link") e.preventDefault();
        }}
      >
        {confirming ? (
          <>
            {/* timer visual: drain + shimmer runs for CONFIRM_MS then disappears */}
            <span
              aria-hidden
              className="confirmDrain"
              style={{ animationDuration: `${CONFIRM_MS}ms` }}
            />
            <span
              aria-hidden
              className="confirmSheen"
              style={{ animationDuration: `${CONFIRM_MS}ms` }}
            />
            <span
              style={{
                position: "relative",
                zIndex: 2,
                whiteSpace: "nowrap",
              }}
            >
              Confirm cancellation
            </span>
          </>
        ) : (
          text
        )}
      </button>

      {msg ? (
        <div
          style={{
            fontSize: 12,
            opacity: 0.75,
            maxWidth: 640,
            textAlign: variant === "link" ? "left" : "center",
          }}
        >
          {msg}
        </div>
      ) : null}
    </div>
  );
}
