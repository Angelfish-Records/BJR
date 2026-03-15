// web/app/home/modules/badges/BuildRevealMaskCanvas.tsx
"use client";

import React from "react";

type Props = {
  imageUrl: string;
  label: string;
  isActive: boolean;
  revealDelayMs?: number;
  revealDurationMs?: number;
  className?: string;
};

const CANVAS_SIZE = 192;
const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(value: number): number {
  const t = clamp(value, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0);
}

function drawRevealMaskFrame(
  context: CanvasRenderingContext2D,
  progress: number,
  seed: number,
): void {
  const size = CANVAS_SIZE;
  const centre = size / 2;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "black";
  context.fillRect(0, 0, size, size);

  if (progress <= 0) {
    return;
  }

  if (progress >= 0.999) {
    context.fillStyle = "white";
    context.fillRect(0, 0, size, size);
    return;
  }

  const eased = easeOutCubic(progress);
  const softened = easeInOutQuad(progress);
  const maxRadius = size * 0.72;
  const baseRadius = size * 0.045 + maxRadius * eased;

  const wavePhaseA = seed * 0.0007;
  const wavePhaseB = seed * 0.0011;
  const wavePhaseC = seed * 0.0017;
  const driftPhase = softened * 2.8;

  context.save();
  context.filter = "blur(7px)";
  context.fillStyle = "white";
  context.beginPath();

  const pointCount = 84;

  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * TAU;

    const wobbleA = 0.16 * Math.sin(angle * 3 + wavePhaseA);
    const wobbleB = 0.1 * Math.sin(angle * 5 - wavePhaseB);
    const wobbleC = 0.065 * Math.cos(angle * 7 + wavePhaseC);
    const drift = 0.06 * Math.sin(angle * 2.6 + driftPhase);

    const directionBoost =
      0.08 *
      Math.max(
        Math.sin(angle - 0.55 + wavePhaseA),
        Math.sin(angle + 1.85 - wavePhaseB),
      );

    const radius = Math.max(
      size * 0.03,
      baseRadius * (1 + wobbleA + wobbleB + wobbleC + drift + directionBoost),
    );

    const x = centre + Math.cos(angle) * radius;
    const y = centre + Math.sin(angle) * radius;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
  context.fill();
  context.restore();

  const lobeDistance = baseRadius * 0.42;

  const lobeOffsets = [
    { angle: -0.95 + wavePhaseA, rx: 0.24, ry: 0.18, start: 0.22 },
    { angle: 0.5 - wavePhaseB, rx: 0.2, ry: 0.24, start: 0.34 },
    { angle: 2.05 + wavePhaseC, rx: 0.22, ry: 0.16, start: 0.42 },
    { angle: -2.3 + wavePhaseB, rx: 0.18, ry: 0.2, start: 0.54 },
  ] as const;

  context.save();
  context.filter = "blur(6px)";
  context.fillStyle = "white";

  for (const lobe of lobeOffsets) {
    const localProgress = clamp((progress - lobe.start) / 0.5, 0, 1);
    if (localProgress <= 0) continue;

    const lobeStrength = easeOutCubic(localProgress);
    const cx = centre + Math.cos(lobe.angle) * lobeDistance * lobeStrength;
    const cy = centre + Math.sin(lobe.angle) * lobeDistance * lobeStrength;
    const rx = size * lobe.rx * (0.35 + lobeStrength);
    const ry = size * lobe.ry * (0.35 + lobeStrength);

    context.beginPath();
    context.ellipse(cx, cy, rx, ry, lobe.angle, 0, TAU);
    context.fill();
  }

  context.restore();

  context.save();
  context.filter = "blur(3px)";
  context.fillStyle = "white";

  const coreRadius = size * (0.065 + progress * 0.045);
  context.beginPath();
  context.arc(centre, centre, coreRadius, 0, TAU);
  context.fill();

  context.restore();

  context.save();
  context.filter = "blur(1.5px)";
  context.fillStyle = "white";
  context.beginPath();

  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * TAU;

    const wobbleA = 0.12 * Math.sin(angle * 3 + wavePhaseA);
    const wobbleB = 0.07 * Math.sin(angle * 5 - wavePhaseB);
    const wobbleC = 0.04 * Math.cos(angle * 7 + wavePhaseC);
    const drift = 0.04 * Math.sin(angle * 2.6 + driftPhase);

    const radius = Math.max(
      size * 0.03,
      baseRadius * (1 + wobbleA + wobbleB + wobbleC + drift),
    );

    const x = centre + Math.cos(angle) * radius;
    const y = centre + Math.sin(angle) * radius;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.closePath();
  context.fill();
  context.restore();
}

function buildSolidMaskDataUrl(): string {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = "white";
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  return canvas.toDataURL("image/png");
}

export default function BuildRevealMaskCanvas(props: Props) {
  const {
    imageUrl,
    label,
    isActive,
    revealDelayMs = 1080,
    revealDurationMs = 920,
    className,
  } = props;

  const [maskDataUrl, setMaskDataUrl] = React.useState<string>("");
  const seed = React.useMemo(() => hashString(`${imageUrl}::${label}`), [
    imageUrl,
    label,
  ]);

  React.useEffect(() => {
    if (!isActive) {
      setMaskDataUrl("");
      return;
    }

    if (typeof window === "undefined") return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      setMaskDataUrl(buildSolidMaskDataUrl());
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    const context = canvas.getContext("2d");
    if (!context) return;

    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const rawProgress = (elapsed - revealDelayMs) / revealDurationMs;
      const progress = clamp(rawProgress, 0, 1);

      drawRevealMaskFrame(context, progress, seed);
      setMaskDataUrl(canvas.toDataURL("image/png"));

      if (progress < 1) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isActive, label, imageUrl, revealDelayMs, revealDurationMs, seed]);

  if (!isActive || !maskDataUrl) return null;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: `url("${imageUrl}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "contain",
        WebkitMaskImage: `url("${maskDataUrl}")`,
        maskImage: `url("${maskDataUrl}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}