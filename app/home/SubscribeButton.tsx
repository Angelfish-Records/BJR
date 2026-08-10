//web/app/home/SubscribeButton.tsx
"use client";

import React from "react";
import { VisualizerSnapshotCanvas } from "@/app/home/player/VisualizerPattern";

type SubscribeTier = "patron" | "partner";
type SubscribeVariant = "link" | "button" | "card";

type CardSpec = Readonly<{
  title: string;
  price: string;
  bullets: readonly string[];
}>;

type Props = Readonly<{
  loggedIn: boolean;
  variant?: SubscribeVariant;
  label?: string;
  tier?: SubscribeTier;
  card?: CardSpec;

  // NEW: current-tier “affirmation” state
  disabled?: boolean;
  current?: boolean;
}>;

function TickIcon(props: Readonly<{ size?: number }>) {
  const { size = 14 } = props;
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
        d="M20 6L9 17l-5-5"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Minimal “feature table” rows:
 * - tick icon instead of bullet
 * - separators between rows
 * - NO outer container border/background
 */
function FeatureRows(props: Readonly<{ items: readonly string[] }>) {
  const { items } = props;

  return (
    <div style={{ width: "100%", display: "grid" }}>
      {items.map((t, i) => (
        <div key={`${t}:${i}`}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "18px 1fr",
              alignItems: "center",
              columnGap: 10,
              padding: "10px 0px",
            }}
          >
            <div style={{ display: "grid", placeItems: "center" }}>
              <TickIcon />
            </div>

            <div
              style={{
                fontSize: 12,
                lineHeight: "16px",
                color: "rgba(255,255,255,0.86)",
                minWidth: 0,
              }}
            >
              {t}
            </div>
          </div>

          {i < items.length - 1 && (
            <div
              aria-hidden
              style={{
                height: 1,
                background: "rgba(255,255,255,0.08)",
                marginLeft: 28, // align divider under text (past icon)
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Price block:
 * - NO pill container/border/background
 * - designed to sit vertically centered in the right column
 */
function PriceBlock(props: Readonly<{ price: string; subcopy: string }>) {
  const { price, subcopy } = props;

  return (
    <div
      style={{
        display: "grid",
        justifyItems: "end",
        textAlign: "center",
        gap: 8,
        alignSelf: "center",
      }}
    >
      <div
        style={{
          fontSize: "clamp(16px, 4.2vw, 20px)",
          lineHeight: "clamp(20px, 5vw, 28px)",
          fontWeight: 750,
          letterSpacing: "0.01em",
          color: "rgba(255,255,255,0.94)",
          whiteSpace: "normal", // allow wrap if needed
        }}
      >
        {price}
      </div>

      <div
        style={{
          fontSize: 11,
          lineHeight: "14px",
          opacity: 0.72,
          maxWidth: "none",
        }}
      >
        {subcopy}
      </div>
    </div>
  );
}

function CardGlowRing(
  props: Readonly<{
    radius?: number;
    seed?: number;
    opacity?: number;
    ringPx?: number;
    glowPx?: number;
    blurPx?: number;
  }>,
) {
  const {
    radius = 16,
    seed = 913,
    opacity = 0.92,
    ringPx = 2,
    glowPx = 18,
    blurPx = 10,
  } = props;
  const pad = ringPx + glowPx;
  const outerRadius = radius + pad;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: -pad,
        borderRadius: outerRadius,
        pointerEvents: "none",

        // Ring mask (padding-box XOR content-box), same trick as your toggle ring.
        padding: pad,
        boxSizing: "border-box",
        WebkitMaskImage: "linear-gradient(#000 0 0), linear-gradient(#000 0 0)",
        WebkitMaskClip: "padding-box, content-box",
        WebkitMaskComposite: "xor",
        WebkitMaskRepeat: "no-repeat",

        filter: `blur(${blurPx}px) contrast(1.45) saturate(1.45)`,
        mixBlendMode: "screen",
        transform: "translateZ(0)",
        opacity,
      }}
    >
      <VisualizerSnapshotCanvas
        opacity={1}
        fps={12}
        sourceRect={{ mode: "random", seed, scale: 0.6 }}
        active
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}

type CheckoutResponse = Readonly<{
  url?: string;
  error?: string;
}>;

type CheckoutActionProps = Readonly<{
  tier: SubscribeTier;
  disabled: boolean;
}>;

type SubscribeControlProps = Readonly<{
  label: string;
  disabled: boolean;
  onCheckout: () => Promise<void>;
}>;

type CardSubscribeControlProps = SubscribeControlProps &
  Readonly<{
    tier: SubscribeTier;
    card?: CardSpec;
    current: boolean;
    hover: boolean;
    onHoverChange: (hover: boolean) => void;
  }>;

type CardVisualState = Readonly<{
  border: string;
  background: string;
  boxShadow: string;
  transform: string;
}>;

function defaultCardSpec(tier: SubscribeTier): CardSpec {
  if (tier === "partner") {
    return {
      title: "Partner",
      price: "$20 / mo",
      bullets: ["Benefit 1", "Benefit 2", "Benefit 3", "Benefit 4"],
    };
  }

  return {
    title: "Patron",
    price: "$5 / mo",
    bullets: ["Benefit 1", "Benefit 2", "Benefit 3", "Benefit 4"],
  };
}

function cardSubcopy(tier: SubscribeTier): string {
  if (tier === "partner") return "Billed annually in NZD. Cancel anytime.";
  return "Billed monthly in NZD. Cancel anytime.";
}

function cardGlowSeed(tier: SubscribeTier): number {
  if (tier === "partner") return 972;
  return 913;
}

function cardVisualState(
  current: boolean,
  isHovering: boolean,
): CardVisualState {
  if (current) {
    return {
      border: "1px solid rgba(255,255,255,0.26)",
      background: "rgba(255,255,255,0.075)",
      boxShadow: "0 18px 46px rgba(0,0,0,0.46)",
      transform: "translateY(-1px)",
    };
  }

  if (isHovering) {
    return {
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.07)",
      boxShadow: "0 18px 42px rgba(0,0,0,0.42)",
      transform: "translateY(-1px)",
    };
  }

  return {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.045)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.34)",
    transform: "translateY(0px)",
  };
}

function featureItems(items: readonly string[]): readonly string[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 5);
}

function checkoutReturnTo(): string {
  return `${window.location.pathname}${window.location.search}`;
}

async function redirectToCheckout(tier: SubscribeTier): Promise<void> {
  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tier,
      returnTo: checkoutReturnTo(),
    }),
  });

  const data = (await res.json().catch(() => null)) as CheckoutResponse | null;

  if (!res.ok) {
    throw new Error(data?.error || "Unable to start checkout session");
  }

  if (!data?.url) {
    throw new Error("Checkout session did not return a redirect URL");
  }

  window.location.assign(data.url);
}

function useCheckoutAction(props: CheckoutActionProps): {
  checkout: () => Promise<void>;
} {
  const { tier, disabled } = props;
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [, setError] = React.useState<string | null>(null);

  async function checkout(): Promise<void> {
    if (disabled || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      await redirectToCheckout(tier);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to start checkout";
      setError(message);
      console.error("SubscribeButton checkout error", {
        tier,
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return { checkout };
}

function LinkSubscribeControl(props: SubscribeControlProps) {
  const { label, disabled, onCheckout } = props;

  return (
    <button
      type="button"
      onClick={() => void onCheckout()}
      disabled={disabled}
      style={{
        appearance: "none",
        border: 0,
        background: "transparent",
        padding: 0,
        margin: 0,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.84)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
        textDecorationColor: "rgba(255,255,255,0.28)",
        opacity: disabled ? 0.75 : 1,
      }}
    >
      {label}
    </button>
  );
}

function CurrentTierBadge() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11,
        lineHeight: "14px",
        letterSpacing: "0.01em",
        color: "rgba(255,255,255,0.92)",
        background: "rgba(0,0,0,0.38)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 10px 22px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      Active
    </div>
  );
}

function CardSubscribeControl(props: CardSubscribeControlProps) {
  const {
    tier,
    card,
    current,
    disabled,
    onCheckout,
    hover,
    onHoverChange,
  } = props;
  const spec = card ?? defaultCardSpec(tier);
  const isHovering = hover && !disabled;
  const radius = 16;
  const visualState = cardVisualState(current, isHovering);
  const features = featureItems(spec.bullets);

  return (
    <button
      type="button"
      onClick={() => void onCheckout()}
      disabled={disabled}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      style={{
        position: "relative",
        textAlign: "left",
        width: "100%",
        borderRadius: radius,
        border: visualState.border,
        background: visualState.background,
        padding: 16,
        cursor: disabled ? "default" : "pointer",
        color: "rgba(255,255,255,0.92)",
        boxShadow: visualState.boxShadow,
        transform: visualState.transform,
        transition:
          "transform 180ms cubic-bezier(.2,.8,.2,1), background 180ms ease, border-color 180ms ease, box-shadow 220ms ease, opacity 180ms ease",
        opacity: disabled && !current ? 0.75 : 1,
        overflow: "visible",
        alignSelf: "stretch",
      }}
    >
      {current && (
        <CardGlowRing
          radius={radius}
          seed={cardGlowSeed(tier)}
          opacity={0.92}
        />
      )}

      {current && <CurrentTierBadge />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 180px)",
          columnGap: 18,
          alignItems: "stretch",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            alignContent: "start",
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "0.01em",
              paddingTop: 2,
            }}
          >
            {spec.title}
          </div>

          {features.length > 0 && <FeatureRows items={features} />}
        </div>

        <PriceBlock price={spec.price} subcopy={cardSubcopy(tier)} />
      </div>
    </button>
  );
}

function PillSubscribeControl(props: SubscribeControlProps) {
  const { label, disabled, onCheckout } = props;

  return (
    <button
      type="button"
      onClick={() => void onCheckout()}
      disabled={disabled}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.08)",
        color: "rgba(255,255,255,0.92)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.75 : 1,
      }}
    >
      {label}
    </button>
  );
}

export default function SubscribeButton(props: Props) {
  const {
    loggedIn,
    variant = "button",
    label = "Become a Patron",
    tier = "patron",
    card,
    disabled = false,
    current = false,
  } = props;
  const [hover, setHover] = React.useState(false);
  const { checkout } = useCheckoutAction({ tier, disabled });

  if (!loggedIn) return null;

  if (variant === "link") {
    return (
      <LinkSubscribeControl
        label={label}
        disabled={disabled}
        onCheckout={checkout}
      />
    );
  }

  if (variant === "card") {
    return (
      <CardSubscribeControl
        label={label}
        tier={tier}
        card={card}
        current={current}
        disabled={disabled}
        onCheckout={checkout}
        hover={hover}
        onHoverChange={setHover}
      />
    );
  }

  return (
    <PillSubscribeControl
      label={label}
      disabled={disabled}
      onCheckout={checkout}
    />
  );
}