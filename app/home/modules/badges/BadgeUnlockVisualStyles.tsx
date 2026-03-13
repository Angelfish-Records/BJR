// web/app/home/modules/badges/BadgeUnlockVisualStyles.tsx
"use client";

import React from "react";

export default function BadgeUnlockVisualStyles() {
  return (
    <style jsx global>{`
      @keyframes portalBadgeLockedPulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.92;
        }
        50% {
          transform: scale(1.035);
          opacity: 1;
        }
      }

      @keyframes portalBadgeUnlockedIdleGlow {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.16;
        }
        50% {
          transform: scale(1.025);
          opacity: 0.24;
        }
      }

      @keyframes portalBadgeEmberRiseA {
        0% {
          transform: translate3d(0, 0, 0) scale(0.72);
          opacity: 0;
        }
        18% {
          transform: translate3d(-1px, -4px, 0) scale(0.82);
          opacity: 0.46;
        }
        42% {
          transform: translate3d(1px, -10px, 0) scale(0.92);
          opacity: 0.34;
        }
        68% {
          transform: translate3d(-2px, -15px, 0) scale(1);
          opacity: 0.2;
        }
        100% {
          transform: translate3d(1px, -20px, 0) scale(1.08);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberRiseB {
        0% {
          transform: translate3d(0, 0, 0) scale(0.68);
          opacity: 0;
        }
        20% {
          transform: translate3d(1px, -5px, 0) scale(0.78);
          opacity: 0.38;
        }
        46% {
          transform: translate3d(-1px, -12px, 0) scale(0.88);
          opacity: 0.28;
        }
        74% {
          transform: translate3d(2px, -18px, 0) scale(0.96);
          opacity: 0.16;
        }
        100% {
          transform: translate3d(-1px, -24px, 0) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberRiseC {
        0% {
          transform: translate3d(0, 0, 0) scale(0.75);
          opacity: 0;
        }
        22% {
          transform: translate3d(1px, -4px, 0) scale(0.82);
          opacity: 0.34;
        }
        48% {
          transform: translate3d(-2px, -9px, 0) scale(0.88);
          opacity: 0.24;
        }
        70% {
          transform: translate3d(0px, -14px, 0) scale(0.92);
          opacity: 0.14;
        }
        100% {
          transform: translate3d(2px, -18px, 0) scale(0.96);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstA {
        0% {
          transform: translate3d(0, 0, 0) scale(0.74);
          opacity: 0;
        }
        14% {
          transform: translate3d(-1px, -5px, 0) scale(0.84);
          opacity: 0.65;
        }
        38% {
          transform: translate3d(2px, -14px, 0) scale(0.98);
          opacity: 0.42;
        }
        66% {
          transform: translate3d(-3px, -24px, 0) scale(1.08);
          opacity: 0.2;
        }
        100% {
          transform: translate3d(2px, -32px, 0) scale(1.18);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstB {
        0% {
          transform: translate3d(0, 0, 0) scale(0.66);
          opacity: 0;
        }
        16% {
          transform: translate3d(1px, -6px, 0) scale(0.76);
          opacity: 0.54;
        }
        40% {
          transform: translate3d(-2px, -16px, 0) scale(0.88);
          opacity: 0.36;
        }
        68% {
          transform: translate3d(4px, -27px, 0) scale(0.98);
          opacity: 0.16;
        }
        100% {
          transform: translate3d(-2px, -36px, 0) scale(1.08);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstC {
        0% {
          transform: translate3d(0, 0, 0) scale(0.7);
          opacity: 0;
        }
        18% {
          transform: translate3d(-1px, -5px, 0) scale(0.8);
          opacity: 0.48;
        }
        42% {
          transform: translate3d(2px, -13px, 0) scale(0.9);
          opacity: 0.3;
        }
        72% {
          transform: translate3d(-2px, -22px, 0) scale(0.98);
          opacity: 0.14;
        }
        100% {
          transform: translate3d(1px, -30px, 0) scale(1.04);
          opacity: 0;
        }
      }

      @keyframes portalBadgeUnlockReveal {
        0% {
          clip-path: circle(0% at 50% 50%);
          filter: saturate(0.92) brightness(1.08);
        }
        100% {
          clip-path: circle(76% at 50% 50%);
          filter: saturate(1) brightness(1);
        }
      }

      @keyframes portalBadgeUnlockSpin {
        0% {
          transform: rotateY(0deg) scale(0.9);
        }
        38% {
          transform: rotateY(180deg) scale(1.02);
        }
        100% {
          transform: rotateY(360deg) scale(1);
        }
      }

      @keyframes portalBadgeUnlockRingA {
        0% {
          transform: scale(0.74);
          opacity: 0;
        }
        12% {
          opacity: 0.82;
        }
        100% {
          transform: scale(1.22);
          opacity: 0;
        }
      }

      @keyframes portalBadgeUnlockRingB {
        0% {
          transform: scale(0.82);
          opacity: 0;
        }
        14% {
          opacity: 0.56;
        }
        100% {
          transform: scale(1.34);
          opacity: 0;
        }
      }

      .portal-badge-unlock-visual {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: visible;
        outline: none;
        perspective: 900px;
        perspective-origin: 50% 50%;
      }

      .portal-badge-unlock-visual-inner {
        position: absolute;
        inset: 0;
        transform: scale(var(--portal-badge-art-scale-collapsed));
        transform-origin: center center;
        transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        will-change: transform;
      }

      .portal-badge-unlock-host[data-badge-expanded="true"]
        .portal-badge-unlock-visual-inner {
        transform: scale(var(--portal-badge-art-scale-expanded));
      }

      .portal-badge-art-spin {
        transform-style: preserve-3d;
        backface-visibility: hidden;
        will-change: transform;
      }

      .portal-badge-art-spin--unlocking {
        animation: portalBadgeUnlockSpin 860ms cubic-bezier(0.22, 1, 0.36, 1)
          both;
      }

      .portal-badge-colour-reveal {
        clip-path: circle(0% at 50% 50%);
        animation: portalBadgeUnlockReveal 760ms
          cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .portal-badge-unlock-ring-a,
      .portal-badge-unlock-ring-b {
        opacity: 0;
      }

      .portal-badge-unlock-ring-a {
        animation: portalBadgeUnlockRingA 760ms
          cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .portal-badge-unlock-ring-b {
        animation: portalBadgeUnlockRingB 980ms
          cubic-bezier(0.22, 1, 0.36, 1) 120ms both;
      }

      .portal-badge-core--locked {
        animation: portalBadgeLockedPulse 2400ms ease-in-out infinite;
        transform-origin: center;
        will-change: transform, opacity;
      }

      .portal-badge-idle-glow {
        animation: portalBadgeUnlockedIdleGlow 3200ms ease-in-out infinite;
        will-change: transform, opacity;
      }

      .portal-badge-unlock-host:hover .portal-badge-idle-glow,
      .portal-badge-unlock-host:focus-within .portal-badge-idle-glow {
        opacity: 0.42;
        transform: scale(1.06);
      }

      .portal-badge-embers {
        opacity: 0.34;
        transition:
          opacity 180ms ease,
          transform 180ms ease;
      }

      .portal-badge-unlock-host:hover .portal-badge-embers,
      .portal-badge-unlock-host:focus-within .portal-badge-embers {
        opacity: 0.92;
        transform: translateY(-1px);
      }

      .portal-badge-spark-a {
        opacity: 0;
        animation: portalBadgeEmberRiseA 1300ms
          cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
      }

      .portal-badge-spark-b {
        opacity: 0;
        animation: portalBadgeEmberRiseB 1600ms
          cubic-bezier(0.19, 0.72, 0.32, 1) infinite 160ms;
      }

      .portal-badge-spark-c {
        opacity: 0;
        animation: portalBadgeEmberRiseC 1450ms
          cubic-bezier(0.25, 0.68, 0.3, 1) infinite 320ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-a,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-a {
        animation: portalBadgeEmberBurstA 950ms
          cubic-bezier(0.2, 0.72, 0.28, 1) infinite;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-b,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-b {
        animation: portalBadgeEmberBurstB 1100ms
          cubic-bezier(0.18, 0.75, 0.3, 1) infinite 120ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-c,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-c {
        animation: portalBadgeEmberBurstC 1000ms
          cubic-bezier(0.24, 0.7, 0.3, 1) infinite 220ms;
      }

      .portal-badge-burst-a,
      .portal-badge-burst-b,
      .portal-badge-burst-c {
        opacity: 0;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-a,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-a {
        animation: portalBadgeEmberBurstA 820ms
          cubic-bezier(0.2, 0.74, 0.28, 1) infinite 40ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-b,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-b {
        animation: portalBadgeEmberBurstB 900ms
          cubic-bezier(0.18, 0.76, 0.3, 1) infinite 180ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-c,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-c {
        animation: portalBadgeEmberBurstC 860ms
          cubic-bezier(0.22, 0.72, 0.3, 1) infinite 300ms;
      }

      @media (prefers-reduced-motion: reduce) {
        .portal-badge-core--locked,
        .portal-badge-idle-glow,
        .portal-badge-spark-a,
        .portal-badge-spark-b,
        .portal-badge-spark-c,
        .portal-badge-burst-a,
        .portal-badge-burst-b,
        .portal-badge-burst-c,
        .portal-badge-art-spin--unlocking,
        .portal-badge-colour-reveal,
        .portal-badge-unlock-ring-a,
        .portal-badge-unlock-ring-b {
          animation: none !important;
        }

        .portal-badge-embers {
          opacity: 0 !important;
        }

        .portal-badge-unlock-visual-inner {
          transition: none !important;
        }
      }
    `}</style>
  );
}