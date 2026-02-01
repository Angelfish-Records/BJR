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

function OverlayPanel(props: { open: boolean; children: React.ReactNode }) {
  const { open, children } = props;
  return (
    <div
      style={{
        transform: open ? "translateY(0px)" : "translateY(-6px)",
        opacity: open ? 1 : 0,
        maxHeight: open ? 520 : 0, // large enough; we clip via maxHeight when closed
        overflow: open ? "visible" : "hidden",
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
              0 18px 42px rgba(0,0,0,0.55),      /* lift */
              0 0 0 1px rgba(255,255,255,0.04),  /* subtle edge definition */
              0 40px 120px rgba(0,0,0,0.85)      /* ambient separation */
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

export default function ActivationGate(props: Props) {
  const {
    children,
    attentionMessage = null,
    canManageBilling = false,
    isPatron = false,
    tier = null,
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

  const EMAIL_W = 360;
  const OTP_W = EMAIL_W; // 360
  const BILLING_W = 450; // matches .afTopBarRightInner maxWidth
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

  // Close billing if auth state changes
  useEffect(() => {
    if (!isActive || !canManageBilling) setBillingOpen(false);
  }, [isActive, canManageBilling]);

  // Click-outside closes billing dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!billingOpen) return;
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setBillingOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [billingOpen]);

  const toggleOn = isActive || phase === "code" || isSending || isVerifying;
  const otpOpen = !isActive && phase === "code";
  const showBillingTrigger = isActive && canManageBilling;

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
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          position: "relative",
          zIndex: 42,
          width: "100%",
          minWidth: 0,
          maxWidth: EMAIL_W,
          display: "grid",
          gap: 4,
          justifyItems: "end",
          alignContent: "end",
        }}
      >
        {/* HEADER ROW */}
        <div
          style={{
            position: "relative",
            width: "100%",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0 12px",
              width: "100%",
              minWidth: 0,
              justifyContent: "flex-end",
            }}
          >
            <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth: EMAIL_W }}>
              {!isActive ? (
                <PatternRingOutline
                  ringPx={2}
                  glowPx={18}
                  blurPx={10}
                  seed={888}
                  opacity={0.92}
                  disabled={!clerkLoaded}
                  innerBg="rgb(10, 10, 14)"
                >
                  <input
                    type="email"
                    placeholder="Enter email for access."
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: 32,
                      padding: "0 14px",
                      fontSize: 12,
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
                    justifyItems: "end",
                    rowGap: 0,
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
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
                        textAlign: "right",
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
                      justifyContent: "flex-end",
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
                        onClick={() => setBillingOpen((v) => !v)}
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

          {/* OVERLAY STACK anchored to header row (true dropdown; no layout shift) */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              zIndex: 60,
              pointerEvents: otpOpen || billingOpen ? "auto" : "none",

              // let children choose their own width; we just anchor to the right edge
              display: "grid",
              justifyItems: "end",
              width: "max-content",
              maxWidth: "min(92vw, 520px)", // safety on small screens
            }}
          >
            {/* OTP dropdown */}
            {!isActive && (
              <div style={{ width: OTP_W, maxWidth: "92vw" }}>
                <OverlayPanel open={otpOpen}>
                  <div
                    style={{ display: "grid", gap: 10, justifyItems: "center" }}
                  >
                    <OtpBoxes
                      maxWidth={EMAIL_W}
                      value={code}
                      onChange={(next) => setCode(normalizeDigits(next))}
                      disabled={isVerifying}
                    />

                    {(isSending || !flow) && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Sending code…
                      </div>
                    )}
                    {isVerifying && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        Verifying…
                      </div>
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
                </OverlayPanel>
              </div>
            )}

            {/* Billing dropdown */}
            {isActive && canManageBilling && (
              <div style={{ width: BILLING_W, maxWidth: "92vw" }}>
                <OverlayPanel open={billingOpen}>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        fontSize: 12,
                        lineHeight: "16px",
                        opacity: 0.82,
                      }}
                    >
                      {isFriend
                        ? "Support future work, access exclusive content. Secured by Stripe."
                        : "Switch tier, or cancel."}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        alignItems: "stretch",
                      }}
                    >
                      <SubscribeButton
                        loggedIn={true}
                        variant="card"
                        tier="patron"
                        disabled={isPatron}
                        current={isPatron}
                        label={isPatron ? "Current" : "Choose Patron"}
                        card={{
                          title: "Patron",
                          price: "$5 / month",
                          bullets: [
                            "All downloads",
                            "Early access",
                            "Posts and Q&A",
                          ],
                        }}
                      />

                      <SubscribeButton
                        loggedIn={true}
                        variant="card"
                        tier="partner"
                        disabled={isPartner}
                        current={isPartner}
                        label={isPartner ? "Current" : "Choose Partner"}
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

                    {(isPatron || isPartner) && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
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
                </OverlayPanel>
              </div>
            )}
          </div>
        </div>

        {isActive && <>{children}</>}
      </div>
    </div>
  );
}
