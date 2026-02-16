"use client";

import React from "react";
import { VisualizerSnapshotCanvas } from "@/app/home/player/VisualizerPattern";

type CardSpec = {
  title: string;
  price: string;
  bullets: string[];
};

type Props = {
  loggedIn: boolean;
  variant?: "link" | "button" | "card";
  label?: string;
  tier?: "patron" | "partner";
  card?: CardSpec;

  // NEW: current-tier “affirmation” state
  disabled?: boolean;
  current?: boolean;
};

function TickIcon(props: { size?: number }) {
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
function FeatureRows(props: { items: string[] }) {
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
function PriceBlock(props: { price: string; subcopy: string }) {
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

function CardGlowRing(props: {
  radius?: number;
  seed?: number;
  opacity?: number;
  ringPx?: number;
  glowPx?: number;
  blurPx?: number;
}) {
  const {
    radius = 16,
    seed = 913,
    opacity = 0.92,
    ringPx = 2,
    glowPx = 18,
    blurPx = 10,
  } = props;
  const pad = ringPx + glowPx;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: -pad,
        borderRadius: radius,
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

  async function go() {
    if (disabled) return;
    const res = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const data = (await res.json()) as { url?: string };
    if (data?.url) window.location.assign(data.url);
  }

  if (!loggedIn) return null;

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={go}
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

  if (variant === "card") {
    const spec: CardSpec = card ?? {
      title: tier === "partner" ? "Partner" : "Patron",
      price: tier === "partner" ? "$20 / mo" : "$5 / mo",
      bullets: ["Benefit 1", "Benefit 2", "Benefit 3"],
    };

    const isHovering = hover && !disabled;
    const radius = 16;

    const subcopy =
      tier === "partner"
        ? "Billed annually. Cancel anytime."
        : "Billed monthly. Cancel anytime.";

    return (
      <button
        type="button"
        onClick={go}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: "relative",
          textAlign: "left",
          width: "100%",
          borderRadius: radius,

          border: current
            ? "1px solid rgba(255,255,255,0.26)"
            : isHovering
              ? "1px solid rgba(255,255,255,0.22)"
              : "1px solid rgba(255,255,255,0.14)",

          background: current
            ? "rgba(255,255,255,0.075)"
            : isHovering
              ? "rgba(255,255,255,0.07)"
              : "rgba(255,255,255,0.045)",

          padding: 16,
          cursor: disabled ? "default" : "pointer",
          color: "rgba(255,255,255,0.92)",

          boxShadow: current
            ? "0 18px 46px rgba(0,0,0,0.46)"
            : isHovering
              ? "0 18px 42px rgba(0,0,0,0.42)"
              : "0 14px 34px rgba(0,0,0,0.34)",

          transform: current
            ? "translateY(-1px)"
            : isHovering
              ? "translateY(-1px)"
              : "translateY(0px)",
          transition:
            "transform 180ms cubic-bezier(.2,.8,.2,1), background 180ms ease, border-color 180ms ease, box-shadow 220ms ease, opacity 180ms ease",

          opacity: disabled && !current ? 0.75 : 1,
          overflow: "visible",
          alignSelf: "stretch",
        }}
      >
        {/* Current-tier glow ring */}
        {current && (
          <CardGlowRing
            radius={radius}
            seed={tier === "partner" ? 972 : 913}
            opacity={0.92}
          />
        )}

        {/* “Current” badge */}
        {current && (
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
            Current
          </div>
        )}

        {/* Two-column layout:
            - left: title + features
            - right: price block, vertically centered */}
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

            {Array.isArray(spec.bullets) && spec.bullets.length > 0 ? (
              <FeatureRows items={spec.bullets.slice(0, 3)} />
            ) : null}
          </div>

          <PriceBlock price={spec.price} subcopy={subcopy} />
        </div>
      </button>
    );
  }

  // default: pill button
  return (
    <button
      type="button"
      onClick={go}
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
