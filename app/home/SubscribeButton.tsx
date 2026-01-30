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

          padding: 12,
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
          display: "grid",
          gridTemplateRows: "auto 1fr",
          alignItems: "start",
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

        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.01em" }}
            >
              {spec.title}
            </div>
            <div style={{ fontSize: 12, opacity: 0.78 }}>{spec.price}</div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {spec.bullets.slice(0, 3).map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  lineHeight: "16px",
                  opacity: 0.82,
                }}
              >
                <span aria-hidden style={{ opacity: 0.55 }}>
                  •
                </span>
                <span style={{ minWidth: 0 }}>{b}</span>
              </div>
            ))}
          </div>
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
