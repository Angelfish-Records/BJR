"use client";

import React from "react";

type CancelVariant = "button" | "link";

type Props = Readonly<{
  disabled?: boolean;
  variant?: CancelVariant;
  label?: string;
}>;

type CancellationResponse = Readonly<{
  ok?: boolean;
  error?: string;
  canceled?: readonly string[];
  updated?: ReadonlyArray<
    Readonly<{
      id: string;
      cancel_at_period_end: boolean;
    }>
  >;
  cancelAtPeriodEnd?: boolean;
  accessUntil?: string | null;
  note?: string;
}>;

type ConfirmationWindow = Readonly<{
  confirming: boolean;
  armConfirmation: () => void;
  disarmConfirmation: () => void;
}>;

type CancellationController = Readonly<{
  busy: boolean;
  confirming: boolean;
  message: string | null;
  isDisabled: boolean;
  cancel: () => Promise<void>;
}>;

type CancelButtonViewProps = Readonly<{
  variant: CancelVariant;
  text: string;
  message: string | null;
  confirming: boolean;
  isDisabled: boolean;
  onCancel: () => Promise<void>;
}>;

type CancelButtonContentProps = Readonly<{
  confirming: boolean;
  text: string;
}>;

const LINK_BUTTON_HEIGHT = 28;
const CONFIRM_MS = 6500;
const RELOAD_DELAY_MS = 1200;
const CONFIRMATION_TEXT = "Confirm cancellation";

function cancellationCount(data: CancellationResponse): number {
  const legacyCount = Array.isArray(data.canceled) ? data.canceled.length : 0;
  if (legacyCount > 0) return legacyCount;

  return Array.isArray(data.updated) ? data.updated.length : 0;
}

function formatAccessUntil(accessUntil: string | null | undefined): string | null {
  if (!accessUntil) return null;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(accessUntil));
}

function cancellationSuccessMessage(data: CancellationResponse): string {
  if (cancellationCount(data) === 0) {
    return data.note ?? "No active subscription found.";
  }

  const untilLabel = formatAccessUntil(data.accessUntil);
  if (untilLabel) {
    return `Cancellation successful. Your access won't change until ${untilLabel}.`;
  }

  return "Cancellation successful. Your access won't change until the end of your billing period.";
}

function cancellationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Cancellation failed";
}

function cancelButtonText(
  busy: boolean,
  confirming: boolean,
  label: string | undefined,
  variant: CancelVariant,
): string {
  if (busy) return "Cancelling…";
  if (confirming) return CONFIRMATION_TEXT;
  if (label != null) return label;
  if (variant === "link") return "Cancel subscription";
  return "Cancel subscription (now)";
}

function rootStyle(variant: CancelVariant): React.CSSProperties {
  return {
    display: "grid",
    gap: variant === "link" ? 6 : 8,
    justifyItems: variant === "link" ? "start" : "center",
  };
}

function buttonContainerStyle(
  variant: CancelVariant,
): React.CSSProperties | undefined {
  if (variant !== "link") return undefined;

  return {
    position: "relative",
    display: "inline-grid",
    alignItems: "center",
    justifyItems: "start",
  };
}

function confirmingButtonStyle(
  variant: CancelVariant,
  isDisabled: boolean,
): React.CSSProperties {
  const isLink = variant === "link";

  return {
    gridArea: isLink ? "1 / 1" : undefined,
    width: isLink ? "100%" : "max-content",
    maxWidth: "min(92vw, 520px)",
    justifySelf: isLink ? "start" : "center",
    height: isLink ? LINK_BUTTON_HEIGHT : undefined,
    padding: isLink ? "0 10px" : "8px 12px",
    borderRadius: isLink ? 999 : 14,
    border: "1px solid rgba(255,90,90,0.35)",
    background:
      "linear-gradient(180deg, rgba(255,80,80,0.26), rgba(255,35,35,0.18))",
    color: "rgba(255,255,255,0.92)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: "0.01em",
    opacity: isDisabled ? 0.6 : 1,
    position: "relative",
    overflow: "hidden",
    textAlign: "left",
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 16px 44px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.12)",
  };
}

function linkButtonStyle(isDisabled: boolean): React.CSSProperties {
  return {
    gridArea: "1 / 1",
    width: "100%",
    height: LINK_BUTTON_HEIGHT,
    padding: "0 10px",
    margin: 0,
    border: "1px solid transparent",
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
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
  };
}

function defaultButtonStyle(isDisabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.90)",
    cursor: isDisabled ? "not-allowed" : "pointer",
    fontSize: 14,
    opacity: isDisabled ? 0.6 : 1,
  };
}

function cancelButtonStyle(
  variant: CancelVariant,
  confirming: boolean,
  isDisabled: boolean,
): React.CSSProperties {
  if (confirming) return confirmingButtonStyle(variant, isDisabled);
  if (variant === "link") return linkButtonStyle(isDisabled);
  return defaultButtonStyle(isDisabled);
}

function messageTextAlign(
  variant: CancelVariant,
): React.CSSProperties["textAlign"] {
  if (variant === "link") return "left";
  return "center";
}

function preventLinkMouseDown(
  event: React.MouseEvent<HTMLButtonElement>,
  variant: CancelVariant,
): void {
  if (variant === "link") event.preventDefault();
}

async function requestCancellation(): Promise<CancellationResponse> {
  const response = await fetch("/api/stripe/cancel-subscription", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  const data = (await response.json().catch(() => null)) as
    | CancellationResponse
    | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error ?? "Cancellation failed");
  }

  return data;
}

function scheduleMembershipReload(): void {
  window.setTimeout(() => {
    window.location.reload();
  }, RELOAD_DELAY_MS);
}

function useConfirmationWindow(durationMs: number): ConfirmationWindow {
  const [confirming, setConfirming] = React.useState(false);
  const confirmTimerRef = React.useRef<number | null>(null);

  const clearConfirmTimer = React.useCallback(() => {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }, []);

  const armConfirmation = React.useCallback(() => {
    setConfirming(true);
    clearConfirmTimer();
    confirmTimerRef.current = window.setTimeout(() => {
      setConfirming(false);
      confirmTimerRef.current = null;
    }, durationMs);
  }, [clearConfirmTimer, durationMs]);

  const disarmConfirmation = React.useCallback(() => {
    clearConfirmTimer();
    setConfirming(false);
  }, [clearConfirmTimer]);

  React.useEffect(() => clearConfirmTimer, [clearConfirmTimer]);

  return {
    confirming,
    armConfirmation,
    disarmConfirmation,
  };
}

function useCancellationController(disabled: boolean): CancellationController {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const { confirming, armConfirmation, disarmConfirmation } =
    useConfirmationWindow(CONFIRM_MS);

  async function cancel(): Promise<void> {
    if (!confirming) {
      setMessage(null);
      armConfirmation();
      return;
    }

    disarmConfirmation();
    setMessage(null);
    setBusy(true);

    try {
      const data = await requestCancellation();
      setMessage(cancellationSuccessMessage(data));
      scheduleMembershipReload();
    } catch (error) {
      setMessage(cancellationErrorMessage(error));
    } finally {
      setBusy(false);
      disarmConfirmation();
    }
  }

  return {
    busy,
    confirming,
    message,
    isDisabled: busy || disabled,
    cancel,
  };
}

function ConfirmationStyles() {
  return (
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
  );
}

function LinkWidthReserve(props: Readonly<{ variant: CancelVariant }>) {
  if (props.variant !== "link") return null;

  return (
    <span
      aria-hidden
      style={{
        visibility: "hidden",
        whiteSpace: "nowrap",
        gridArea: "1 / 1",
        height: LINK_BUTTON_HEIGHT,
        display: "inline-flex",
        alignItems: "center",
        padding: "0 10px",
        border: "1px solid transparent",
        fontSize: 12,
        fontWeight: 650,
        letterSpacing: "0.01em",
        boxSizing: "border-box",
      }}
    >
      {CONFIRMATION_TEXT}
    </span>
  );
}

function CancelButtonContent(props: CancelButtonContentProps) {
  const { confirming, text } = props;
  if (!confirming) return <>{text}</>;

  return (
    <>
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
        {CONFIRMATION_TEXT}
      </span>
    </>
  );
}

function CancellationMessage(
  props: Readonly<{
    message: string | null;
    variant: CancelVariant;
  }>,
) {
  const { message, variant } = props;
  if (!message) return null;

  return (
    <div
      style={{
        fontSize: 12,
        opacity: 0.75,
        maxWidth: 640,
        textAlign: messageTextAlign(variant),
      }}
    >
      {message}
    </div>
  );
}

function CancelButtonView(props: CancelButtonViewProps) {
  const {
    variant,
    text,
    message,
    confirming,
    isDisabled,
    onCancel,
  } = props;

  return (
    <div style={rootStyle(variant)}>
      <ConfirmationStyles />

      <div style={buttonContainerStyle(variant)}>
        <LinkWidthReserve variant={variant} />

        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={isDisabled}
          className={confirming ? "confirmPill" : undefined}
          style={cancelButtonStyle(variant, confirming, isDisabled)}
          onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) =>
            preventLinkMouseDown(event, variant)
          }
        >
          <CancelButtonContent confirming={confirming} text={text} />
        </button>
      </div>

      <CancellationMessage message={message} variant={variant} />
    </div>
  );
}

export default function CancelSubscriptionButton(props: Props) {
  const {
    disabled = false,
    variant = "button",
    label,
  } = props;
  const controller = useCancellationController(disabled);
  const text = cancelButtonText(
    controller.busy,
    controller.confirming,
    label,
    variant,
  );

  return (
    <CancelButtonView
      variant={variant}
      text={text}
      message={controller.message}
      confirming={controller.confirming}
      isDisabled={controller.isDisabled}
      onCancel={controller.cancel}
    />
  );
}