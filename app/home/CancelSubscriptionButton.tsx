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

  async function onCancel() {
    // Step 1: arm confirmation
    if (!confirming) {
      setMsg(null);
      setConfirming(true);
      clearConfirmTimer();
      confirmTimerRef.current = window.setTimeout(() => {
        setConfirming(false);
        confirmTimerRef.current = null;
      }, 6500);
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
      ? "Click again to confirm cancellation"
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
      <button
        onClick={onCancel}
        disabled={isDisabled}
        style={
          variant === "link"
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
                opacity: isDisabled ? 0.6 : confirming ? 0.98 : 0.95,
                textAlign: "left",
                justifySelf: "start",
              }
            : {
                padding: "11px 16px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.22)",
                background: confirming
                  ? "color-mix(in srgb, rgba(255,255,255,0.06) 55%, rgba(255,120,120,0.22))"
                  : "rgba(255,255,255,0.06)",
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
        {text}
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
