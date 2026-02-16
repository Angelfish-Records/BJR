// web/app/home/ActivationGate.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import SubscribeButton from "@/app/home/SubscribeButton";
import CancelSubscriptionButton from "@/app/home/CancelSubscriptionButton";
import {
  PatternPillUnderlay,
  VisualizerSnapshotCanvas,
} from "@/app/home/player/VisualizerPattern";

type Phase = "idle" | "code";
type Flow = "signin" | "signup" | null;

type Props = {
  children: React.ReactNode;
  attentionMessage?: string | null;
  canManageBilling?: boolean;
  isPatron?: boolean;
  tier?: string | null;

  /**
   * - "topbar": native top-right layout (dropdown panels are absolutely positioned)
   * - "modal": centered CTA layout (panels render inline and expand the card)
   */
  placement?: "topbar" | "modal";
};

function getClerkErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "Something went wrong";
  const e = err as {
    errors?: Array<{ message?: unknown; code?: unknown }>;
    message?: unknown;
  };
  const firstMsg = e.errors?.[0]?.message;
  if (typeof firstMsg === "string" && firstMsg.trim()) return firstMsg;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  return "Something went wrong";
}

function getClerkFirstErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { errors?: Array<{ code?: unknown }> };
  const c = e.errors?.[0]?.code;
  return typeof c === "string" ? c : null;
}

function looksLikeNoAccountError(err: unknown): boolean {
  const msg = getClerkErrorMessage(err).toLowerCase();
  const code = (getClerkFirstErrorCode(err) ?? "").toLowerCase();

  if (code.includes("not_found") || code.includes("identifier")) return true;
  if (msg.includes("couldn't find your account")) return true;
  if (msg.includes("could not find your account")) return true;
  if (msg.includes("account not found")) return true;

  return false;
}

/**
 * Patterned OUTLINE ring: a wrapper that shows the visualizer snapshot only in the ring.
 */
function PatternRingOutline(props: {
  children: React.ReactNode;
  radius?: number;
  ringPx?: number;
  seed?: number;
  opacity?: number;
  disabled?: boolean;
  innerBg?: string;
  glowPx?: number;
  blurPx?: number;
}) {
  const {
    children,
    radius = 999,
    ringPx = 2,
    seed = 888,
    opacity = 0.92,
    disabled,
    innerBg = "rgb(10, 10, 14)",
    glowPx = 18,
    blurPx = 8,
  } = props;

  const pad = ringPx + glowPx;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius,
        padding: 0,
        overflow: "visible",
        opacity: disabled ? 0.7 : 1,
        transition: "opacity 180ms ease",
        transform: "translateZ(0)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: -pad,
          borderRadius: radius,
          pointerEvents: "none",

          padding: pad,
          boxSizing: "border-box",
          WebkitMaskImage:
            "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
          WebkitMaskClip: "padding-box, content-box",
          WebkitMaskComposite: "xor",
          WebkitMaskRepeat: "no-repeat",

          filter: `blur(${blurPx}px) contrast(1.45) saturate(1.45)`,
          mixBlendMode: "screen",
        }}
      >
        <VisualizerSnapshotCanvas
          opacity={opacity}
          fps={12}
          sourceRect={{ mode: "random", seed, scale: 0.6 }}
          active
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          background: innerBg,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function Toggle(props: {
  checked: boolean;
  disabled?: boolean;
  onClick?: () => void;
  mode: "anon" | "auth";
}) {
  const { checked, disabled, onClick, mode } = props;

  const w = 56;
  const h = 32;
  const pad = 3;
  const knob = h - pad * 2;
  const travel = w - pad * 2 - knob;

  const ANON_BG_OFF = "rgb(10, 10, 14)";
  const ANON_BG_ON = "color-mix(in srgb, var(--accent) 22%, rgb(10, 10, 14))";

  const AUTH_BG_OFF = "rgba(255,255,255,0.10)";
  const AUTH_BG_ON =
    "color-mix(in srgb, var(--accent) 26%, rgba(255,255,255,0.10))";

  const button = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-checked={checked}
      role="switch"
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        border:
          mode === "anon"
            ? "0px solid transparent"
            : "1px solid rgba(255,255,255,0.18)",
        background:
          mode === "anon"
            ? checked
              ? ANON_BG_ON
              : ANON_BG_OFF
            : checked
              ? AUTH_BG_ON
              : AUTH_BG_OFF,
        position: "relative",
        padding: 0,
        outline: "none",
        cursor: disabled ? "default" : "pointer",
        transition:
          "background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, opacity 180ms ease",
        boxShadow:
          mode === "anon"
            ? "0 10px 26px rgba(0,0,0,0.28)"
            : checked
              ? "0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 10px 26px rgba(0,0,0,0.35)"
              : "0 10px 26px rgba(0,0,0,0.28)",
        opacity: disabled ? 0.65 : 1,
        overflow: "hidden",
        display: "grid",
        alignItems: "center",
      }}
    >
      {mode === "auth" && (
        <PatternPillUnderlay
          active
          opacity={checked ? 0.78 : 0.56}
          seed={777}
        />
      )}

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 1,
          borderRadius: 999,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.00))",
          pointerEvents: "none",
          opacity: checked ? 0.6 : 0.46,
          transition: "opacity 180ms ease",
        }}
      />

      <div
        aria-hidden
        style={{
          width: knob,
          height: knob,
          borderRadius: 999,
          position: "absolute",
          top: pad,
          left: pad,
          transform: `translateX(${checked ? travel : 0}px)`,
          transition:
            "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease",
          background: "rgba(255,255,255,0.98)",
          boxShadow: checked
            ? "0 10px 22px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.65) inset"
            : "0 10px 22px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.45) inset",
        }}
      />
    </button>
  );

  return mode === "anon" ? (
    <PatternRingOutline
      ringPx={2}
      glowPx={26}
      blurPx={10}
      seed={888}
      opacity={0.92}
      disabled={disabled}
      innerBg="rgb(10, 10, 14)"
    >
      {button}
    </PatternRingOutline>
  ) : (
    button
  );
}

function normalizeDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

function LockIcon(props: { size?: number }) {
  const { size = 12 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.8 11h8.4c.99 0 1.8.81 1.8 1.8v6.4c0 .99-.81 1.8-1.8 1.8H7.8c-.99 0-1.8-.81-1.8-1.8v-6.4c0-.99.81-1.8 1.8-1.8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OtpBoxes(props: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  maxWidth?: number;
}) {
  const { value, onChange, disabled, maxWidth = 360 } = props;
  const digits = (value + "______").slice(0, 6).split("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focus(i: number) {
    refs.current[i]?.focus();
  }

  const gap = 10;

  return (
    <div style={{ width: "100%", display: "grid", justifyItems: "center" }}>
      <div
        style={{
          width: "100%",
          maxWidth,
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap,
        }}
      >
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            value={d === "_" ? "" : d}
            disabled={disabled}
            onChange={(e) => {
              const n = normalizeDigits(e.target.value);
              const ch = n.slice(-1);
              const arr = value.split("");
              while (arr.length < 6) arr.push("");
              arr[i] = ch;
              onChange(normalizeDigits(arr.join("")));
              if (ch && i < 5) focus(i + 1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                const cur = digits[i];
                if (!cur || cur === "_") {
                  if (i > 0) focus(i - 1);
                } else {
                  const arr = value.split("");
                  while (arr.length < 6) arr.push("");
                  arr[i] = "";
                  onChange(normalizeDigits(arr.join("")));
                }
              }
              if (e.key === "ArrowLeft" && i > 0) focus(i - 1);
              if (e.key === "ArrowRight" && i < 5) focus(i + 1);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text") || "";
              const pasted = normalizeDigits(text);
              if (!pasted) return;
              e.preventDefault();
              onChange(pasted);
              const idx = Math.min(5, pasted.length - 1);
              setTimeout(() => focus(idx), 0);
            }}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(0,0,0,0.35)",
              color: "rgba(255,255,255,0.92)",
              textAlign: "center",
              fontSize: 18,
              outline: "none",
              boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
              boxSizing: "border-box",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OverlayPanel(props: {
  open: boolean;
  children: React.ReactNode;
  maxHeightOpen?: number;
  yOffsetClosed?: number;
}) {
  const { open, children, maxHeightOpen = 520, yOffsetClosed = -6 } = props;
  return (
    <div
      style={{
        transform: open ? "translateY(0px)" : `translateY(${yOffsetClosed}px)`,
        opacity: open ? 1 : 0,
        maxHeight: open ? maxHeightOpen : 0,
        overflow: "hidden",
        transition:
          "max-height 240ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)",
        pointerEvents: open ? "auto" : "none",
      }}
    >
      <div
        style={{
          borderRadius: 16,
          border: open
            ? "1px solid rgba(255,255,255,0.14)"
            : "0px solid transparent",
          background: open ? "rgba(10,10,14,0.96)" : "transparent",
          backdropFilter: open ? "blur(10px)" : "none",
          padding: open ? 12 : 0,
          boxShadow: open
            ? `
              0 18px 42px rgba(0,0,0,0.55),
              0 0 0 1px rgba(255,255,255,0.04),
              0 40px 120px rgba(0,0,0,0.85)
            `
            : "none",
          transition:
            "padding 240ms cubic-bezier(.2,.8,.2,1), border-width 240ms cubic-bezier(.2,.8,.2,1), background 240ms ease, box-shadow 240ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CrossfadeSwap(props: {
  mode: "privacy" | "otp";
  privacy: React.ReactNode;
  otp: React.ReactNode;
}) {
  const { mode, privacy, otp } = props;
  const isOtp = mode === "otp";

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        aria-hidden={isOtp}
        style={{
          position: isOtp ? "absolute" : "relative",
          inset: isOtp ? 0 : undefined,
          opacity: isOtp ? 0 : 1,
          transform: isOtp ? "translateY(-3px)" : "translateY(0px)",
          transition: "opacity 140ms ease, transform 180ms ease",
          pointerEvents: isOtp ? "none" : "auto",
          width: "100%",
        }}
      >
        {privacy}
      </div>

      <div
        aria-hidden={!isOtp}
        style={{
          position: isOtp ? "relative" : "absolute",
          inset: isOtp ? undefined : 0,
          opacity: isOtp ? 1 : 0,
          transform: isOtp ? "translateY(0px)" : "translateY(3px)",
          transition: "opacity 140ms ease, transform 180ms ease",
          pointerEvents: isOtp ? "auto" : "none",
          width: "100%",
        }}
      >
        {otp}
      </div>
    </div>
  );
}

export default function ActivationGate(props: Props) {
  const {
    children,
    attentionMessage = null,
    canManageBilling = false,
    isPatron = false,
    tier = null,
    placement = "topbar",
  } = props;

  const router = useRouter();

  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const {
    signIn,
    setActive: setActiveSignIn,
    isLoaded: signInLoaded,
  } = useSignIn();
  const {
    signUp,
    setActive: setActiveSignUp,
    isLoaded: signUpLoaded,
  } = useSignUp();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [flow, setFlow] = useState<Flow>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [billingOpen, setBillingOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // “briefly while typing” privacy notice timer
  const [isTypingEmail, setIsTypingEmail] = useState(false);
  const typingTimerRef = useRef<number | null>(null);

  const isActive = !!isSignedIn;
  const clerkLoaded = signInLoaded && signUpLoaded;

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    [email],
  );

  const displayEmail =
    (user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      "") ||
    email;

  // Unified widths: everything should line up cleanly
  const CONTENT_W = placement === "modal" ? 420 : 360;
  const EMAIL_W = CONTENT_W;
  const OTP_W = CONTENT_W;

  // New membership modal sizing (bigger, centered)
  const BILLING_MODAL_MAX_W = 860;
  const BILLING_MODAL_MIN_W = 640;

  const needsAttention = !isActive && !!attentionMessage;
  const toggleClickable =
    !isActive && phase === "idle" && emailValid && clerkLoaded;

  const tierLower = (tier ?? "").toLowerCase();
  const isPartner = tierLower.includes("partner");
  const isFriend = !isPatron && !isPartner;

  async function startEmailCode() {
    if (!clerkLoaded || !emailValid) return;
    if (!signIn || !signUp) return;

    setError(null);
    setCode("");
    setFlow(null);
    setIsVerifying(false);
    setIsSending(true);
    setPhase("code");

    try {
      await signIn.create({ identifier: email, strategy: "email_code" });
      setFlow("signin");
      setIsSending(false);
      return;
    } catch (err) {
      if (!looksLikeNoAccountError(err)) {
        setError(getClerkErrorMessage(err));
        setIsSending(false);
        setPhase("idle");
        return;
      }
    }

    try {
      await signUp.create({ emailAddress: email });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setFlow("signup");
      setIsSending(false);
    } catch (err) {
      setError(getClerkErrorMessage(err));
      setIsSending(false);
      setPhase("idle");
    }
  }

  async function verifyCode(submitCode: string) {
    if (!clerkLoaded || submitCode.length !== 6) return;
    if (!flow) return;

    setError(null);
    setIsVerifying(true);

    try {
      if (flow === "signin") {
        if (!signIn || !setActiveSignIn) throw new Error("Sign-in not ready");
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: submitCode,
        });
        if (result.status === "complete") {
          const sid = (result as unknown as { createdSessionId?: string })
            .createdSessionId;
          if (sid) await setActiveSignIn({ session: sid });
          router.refresh();
          return;
        }
        setError("Verification incomplete");
        return;
      }

      if (!signUp || !setActiveSignUp) throw new Error("Sign-up not ready");
      const result = await signUp.attemptEmailAddressVerification({
        code: submitCode,
      });
      if (result.status === "complete") {
        const sid = (result as unknown as { createdSessionId?: string })
          .createdSessionId;
        if (sid) await setActiveSignUp({ session: sid });
        router.refresh();
        return;
      }
      setError("Verification incomplete");
    } catch (err) {
      setError(getClerkErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  }

  useEffect(() => {
    if (phase !== "code") return;
    if (code.length !== 6) return;
    void verifyCode(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, phase]);

  // Modal: billing dropdown isn't used (keep state clean)
  useEffect(() => {
    if (placement === "modal") setBillingOpen(false);
  }, [placement]);

  // Close billing if auth state changes
  useEffect(() => {
    if (!isActive || !canManageBilling) setBillingOpen(false);
  }, [isActive, canManageBilling]);

  // Close membership modal via Escape (but don't interfere with OTP)
  useEffect(() => {
    if (!billingOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // If OTP is open, don't steal Escape; membership modal only.
      if (!isActive) return;
      e.preventDefault();
      e.stopPropagation();
      setBillingOpen(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [billingOpen, isActive]);

  // If we leave idle/email phase, stop the “typing” state
  useEffect(() => {
    if (phase !== "idle") setIsTypingEmail(false);
  }, [phase]);

  // Modal UX: when the gate is demanding attention, focus email input
  useEffect(() => {
    if (placement !== "modal") return;
    if (isActive) return;
    if (!needsAttention) return;
    const t = window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(t);
  }, [placement, isActive, needsAttention]);

  const toggleOn = isActive || phase === "code" || isSending || isVerifying;
  const otpOpen = !isActive && phase === "code";
  const showBillingTrigger = isActive && canManageBilling;

  // Privacy notice opens briefly while typing (and never when OTP is open)
  const privacyOpen =
    !isActive &&
    phase === "idle" &&
    !otpOpen &&
    !!email &&
    (isTypingEmail || needsAttention);

  const overlayOpen = otpOpen || privacyOpen; // billing no longer lives in the topbar overlay stack

  const overlayMode: "otp" | "privacy" | "none" = otpOpen
    ? "otp"
    : privacyOpen
      ? "privacy"
      : "none";

  function scheduleTypingFade() {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setIsTypingEmail(false);
      typingTimerRef.current = null;
    }, 2600);
  }

  function onEmailChange(nextRaw: string) {
    const next = nextRaw.trim();
    setEmail(next);
    setIsTypingEmail(true);
    scheduleTypingFade();
  }

  function submitFromEnter() {
    if (!toggleClickable) return;
    void startEmailCode();
  }

  const modalCentered = placement === "modal";

  const inlinePanelOpen = overlayMode === "otp" || overlayMode === "privacy";
  const inlineMaxHeight =
    overlayMode === "otp" ? 520 : overlayMode === "privacy" ? 160 : 0;

  const privacyNode = (
    <div style={{ width: "100%", display: "grid", gap: 8 }}>
      <div
        style={{
          width: "100%",
          border: "none",
          background: "rgba(0,0,0,0.32)",
          boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
          padding: "12px 12px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 11,
            lineHeight: "15px",
            opacity: 0.82,
            textAlign: "left",
          }}
        >
          By signing up, you agree to receive occasional emails about releases,
          events, and account activity. Unsubscribe anytime.
        </div>
      </div>
    </div>
  );

  const otpNode = (
    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <OtpBoxes
        maxWidth={EMAIL_W}
        value={code}
        onChange={(next) => setCode(normalizeDigits(next))}
        disabled={isVerifying}
      />

      {(isSending || !flow) && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Sending code…</div>
      )}
      {isVerifying && (
        <div style={{ fontSize: 12, opacity: 0.7 }}>Verifying…</div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.88,
            color: "#ffb4b4",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );

  const membershipModalOpen = billingOpen && isActive && canManageBilling;

  const membershipModal = membershipModalOpen ? (
    <div
      aria-hidden={false}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 5000,
        // allow the page to remain interactable by default
        pointerEvents: "none",
      }}
    >
      {/* Backdrop: click-catcher + subtle blur/lift. */}
      <div
        aria-hidden
        onMouseDown={() => setBillingOpen(false)}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "auto",
          // minimal tint; mostly blur, not blockade
          background: "rgba(0,0,0,0.06)",
        }}
      />

      {/* Centered modal container */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: "min(8vh, 56px) 16px",
          pointerEvents: "none",
        }}
      >
        {/* Gradient border frame */}
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Membership options"
          onMouseDown={(e) => {
            // prevent backdrop click from closing when clicking inside modal
            e.stopPropagation();
          }}
          style={{
            width: "100%",
            maxWidth: `min(92vw, ${BILLING_MODAL_MAX_W}px)`,
            minWidth: `min(92vw, ${BILLING_MODAL_MIN_W}px)`,
            borderRadius: 26,
            padding: 1, // gradient border thickness
            pointerEvents: "auto",
            background:
              "linear-gradient(135deg, rgba(255,215,130,0.62), rgba(255,234,170,0.18) 38%, rgba(255,215,130,0.46) 65%, rgba(255,255,255,0.10))",
            boxShadow:
              "0 30px 90px rgba(0,0,0,0.55), 0 60px 160px rgba(0,0,0,0.55)",
            transform: "translateZ(0)",
          }}
        >
          {/* Inner panel */}
          <div
            style={{
              borderRadius: 25,
              background: "rgba(10,10,14,0.92)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.06)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.03) inset, 0 18px 52px rgba(0,0,0,0.35)",
              padding: 18,
              display: "grid",
              gap: 14,
              maxHeight: "min(82vh, 680px)",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  minWidth: 0,
                  flex: "1 1 auto",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: "18px",
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    color: "rgba(255,255,255,0.92)",
                  }}
                >
                  Membership
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: "16px",
                    opacity: 0.82,
                    maxWidth: "calc(100% - 58px)", // 34 (button) + 12 (gap) + 12 (breathing room)
                  }}
                >
                  {isFriend
                    ? "Support future work, access exclusive content."
                    : "Change or cancel your membership below. Thank you for supporting future work on this independent platform."}
                </div>
              </div>

              <button
                type="button"
                aria-label="Close membership"
                onClick={() => setBillingOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.88)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  lineHeight: 1,
                  fontSize: 18,
                  userSelect: "none",
                  flex: "0 0 auto",
                }}
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Cards row (keeps the 2-up layout, but with more vertical room) */}
            <div
              style={{
                display: "grid",
                // Two-up when there's room, single column when not.
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 14,
                alignItems: "stretch",
                width: "100%",
                minWidth: 0,
              }}
            >
              <SubscribeButton
                loggedIn={true}
                variant="card"
                tier="patron"
                disabled={isPatron}
                current={isPatron}
                label={isPatron ? "Active" : "Choose Patron"}
                card={{
                  title: "Patron",
                  price: "$5 / month",
                  bullets: [
                    "All downloads",
                    "First listener access",
                    "Artist posts and Q&A",
                  ],
                }}
              />

              <SubscribeButton
                loggedIn={true}
                variant="card"
                tier="partner"
                disabled={isPartner}
                current={isPartner}
                label={isPartner ? "Active" : "Choose Partner"}
                card={{
                  title: "Partner",
                  price: "$299 / year",
                  bullets: [
                    "Release credits",
                    "Creative livestreams",
                    "Something else",
                  ],
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                marginTop: 2,
                fontSize: 11,
                lineHeight: "14px",
                opacity: 0.7,
              }}
            >
              <LockIcon size={12} />
              <span>
                Secured by Stripe. Your payment is protected and we will never
                share your data.
              </span>
            </div>

            {(isPatron || isPartner) && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <CancelSubscriptionButton
                  variant="link"
                  label="Cancel subscription"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: modalCentered ? "center" : "flex-end",
      }}
    >
      {/* Membership modal: centered overlay (non-blocking scroll) */}
      {membershipModal}

      <div
        style={{
          position: "relative",
          zIndex: 42,
          width: "100%",
          minWidth: 0,
          maxWidth: modalCentered ? 520 : CONTENT_W,
          display: "grid",
          gap: modalCentered ? 10 : 4,
          justifyItems: "center",
          alignContent: modalCentered ? "center" : "end",
        }}
      >
        <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitFromEnter();
            }}
            style={{ margin: 0 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0 12px",
                width: "100%",
                minWidth: 0,
                justifyContent: modalCentered ? "center" : "flex-end",
              }}
            >
              <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: EMAIL_W }}>
                {!isActive ? (
                  <PatternRingOutline
                    ringPx={2}
                    glowPx={modalCentered ? 20 : 18}
                    blurPx={10}
                    seed={888}
                    opacity={0.92}
                    disabled={!clerkLoaded}
                    innerBg="rgb(10, 10, 14)"
                  >
                    <input
                      ref={emailInputRef}
                      type="email"
                      placeholder="Enter email for access."
                      value={email}
                      onChange={(e) => onEmailChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          submitFromEnter();
                        }
                      }}
                      style={{
                        width: "100%",
                        minWidth: 0,
                        height: modalCentered ? 40 : 32,
                        padding: modalCentered ? "0 16px" : "0 14px",
                        fontSize: modalCentered ? 13 : 12,
                        lineHeight: "16px",
                        WebkitTextSizeAdjust: "100%",
                        borderRadius: 999,
                        border: "0px solid transparent",
                        background: "rgb(10, 10, 14)",
                        color: "rgba(255,255,255,0.92)",
                        outline: "none",
                        textAlign: "left",
                        boxShadow: needsAttention
                          ? `0 0 0 3px color-mix(in srgb, var(--accent) 32%, transparent),
                          0 0 26px color-mix(in srgb, var(--accent) 40%, transparent),
                          0 14px 30px rgba(0,0,0,0.22)`
                          : "0 14px 30px rgba(0,0,0,0.22)",
                        transition: "box-shadow 220ms ease",
                        boxSizing: "border-box",
                      }}
                    />
                  </PatternRingOutline>
                ) : (
                  <div
                    aria-label="Signed in identity"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: 32,
                      display: "grid",
                      gridTemplateRows: "1fr 1fr",
                      alignItems: "center",
                      justifyItems: modalCentered ? "center" : "end",
                      rowGap: 0,
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: modalCentered ? "center" : "flex-end",
                        gap: 8,
                        color: "rgba(255,255,255,0.82)",
                        fontSize: 12,
                        lineHeight: "16px",
                        letterSpacing: "0.01em",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          display: "grid",
                          placeItems: "center",
                          background:
                            "color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.10))",
                          boxShadow:
                            "0 10px 18px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.18)",
                          flex: "0 0 auto",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            lineHeight: "11px",
                            transform: "translateY(-0.5px)",
                            color: "rgba(255,255,255,0.92)",
                          }}
                        >
                          ✓
                        </span>
                      </span>

                      <span
                        style={{
                          minWidth: 0,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textAlign: modalCentered ? "center" : "right",
                        }}
                        title={displayEmail}
                      >
                        {displayEmail}
                      </span>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: modalCentered ? "center" : "flex-end",
                        gap: 8,
                        fontSize: 12,
                        lineHeight: "16px",
                        minWidth: 0,
                        opacity: 0.95,
                      }}
                    >
                      {tier ? (
                        <>
                          <span style={{ opacity: 0.72 }} title={tier}>
                            {tier}
                          </span>
                          <span aria-hidden style={{ opacity: 0.35 }}>
                            |
                          </span>
                        </>
                      ) : null}

                      {showBillingTrigger ? (
                        <button
                          type="button"
                          onClick={() => setBillingOpen(true)}
                          style={{
                            appearance: "none",
                            border: 0,
                            background: "transparent",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "rgba(255,255,255,0.84)",
                            textDecoration: "underline",
                            textUnderlineOffset: 3,
                            textDecorationColor: "rgba(255,255,255,0.28)",
                          }}
                          title="View membership options"
                        >
                          Membership
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  flex: "0 0 auto",
                  display: "grid",
                  alignItems: "center",
                }}
              >
                <Toggle
                  checked={toggleOn}
                  disabled={!toggleClickable}
                  onClick={startEmailCode}
                  mode={isActive ? "auth" : "anon"}
                />
              </div>
            </div>
          </form>

          {/* MODAL: inline expanding area (smooth downward growth, same width) */}
          {modalCentered && !isActive && (
            <div
              style={{
                width: "100%",
                minWidth: 0,
                display: "grid",
                justifyItems: "center",
                marginTop: 12,
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: OTP_W,
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <OverlayPanel
                  open={inlinePanelOpen}
                  maxHeightOpen={inlineMaxHeight}
                  yOffsetClosed={-4}
                >
                  <div
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    <CrossfadeSwap
                      mode={overlayMode === "otp" ? "otp" : "privacy"}
                      privacy={privacyNode}
                      otp={otpNode}
                    />
                  </div>
                </OverlayPanel>
              </div>
            </div>
          )}

          {/* TOPBAR: absolutely-positioned overlay stack (no layout shift) */}
          {placement === "topbar" && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                zIndex: 60,
                pointerEvents: overlayOpen ? "auto" : "none",

                display: "grid",
                justifyItems: "end",
                width: "max-content",
                maxWidth: "min(92vw, 520px)",
              }}
            >
              {!isActive && (
                <div style={{ width: OTP_W, maxWidth: "92vw" }}>
                  <OverlayPanel
                    open={overlayMode === "otp" || overlayMode === "privacy"}
                    maxHeightOpen={overlayMode === "otp" ? 520 : 140}
                  >
                    <CrossfadeSwap
                      mode={overlayMode === "otp" ? "otp" : "privacy"}
                      privacy={privacyNode}
                      otp={otpNode}
                    />
                  </OverlayPanel>
                </div>
              )}
            </div>
          )}
        </div>

        {isActive && <>{children}</>}
      </div>
    </div>
  );
}
