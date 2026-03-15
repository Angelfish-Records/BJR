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
          transform: scale(1.028);
          opacity: 0.26;
        }
      }

      @keyframes portalBadgeInnerAuraPulse {
        0%,
        100% {
          transform: translate(-50%, -50%) scale(0.98);
          opacity: 0.34;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.05);
          opacity: 0.5;
        }
      }

      @keyframes portalBadgeCentreRadiance {
        0%,
        100% {
          transform: translate(-50%, -50%) scale(0.96);
          opacity: 0.22;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.04);
          opacity: 0.36;
        }
      }

      @keyframes portalBadgeEmberRiseA {
        0% {
          transform: translate3d(0, 5px, 0) rotate(-5deg) scale(0.56, 0.76);
          opacity: 0;
        }
        18% {
          transform: translate3d(-0.8px, -2px, 0) rotate(-8deg)
            scale(0.72, 0.98);
          opacity: 0.46;
        }
        44% {
          transform: translate3d(0.9px, -11px, 0) rotate(-4deg) scale(0.9, 1.16);
          opacity: 0.34;
        }
        72% {
          transform: translate3d(-0.7px, -21px, 0) rotate(1deg)
            scale(0.98, 1.28);
          opacity: 0.18;
        }
        100% {
          transform: translate3d(0.5px, -31px, 0) rotate(3deg) scale(0.9, 1.36);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberRiseB {
        0% {
          transform: translate3d(0, 5px, 0) rotate(3deg) scale(0.54, 0.74);
          opacity: 0;
        }
        18% {
          transform: translate3d(0.7px, -2px, 0) rotate(6deg) scale(0.7, 0.96);
          opacity: 0.4;
        }
        46% {
          transform: translate3d(-0.8px, -12px, 0) rotate(3deg)
            scale(0.86, 1.12);
          opacity: 0.28;
        }
        74% {
          transform: translate3d(0.9px, -23px, 0) rotate(-1deg)
            scale(0.92, 1.24);
          opacity: 0.14;
        }
        100% {
          transform: translate3d(-0.6px, -33px, 0) rotate(-3deg)
            scale(0.84, 1.32);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberRiseC {
        0% {
          transform: translate3d(0, 4px, 0) rotate(-3deg) scale(0.56, 0.74);
          opacity: 0;
        }
        20% {
          transform: translate3d(0.8px, -1px, 0) rotate(-6deg) scale(0.7, 0.94);
          opacity: 0.36;
        }
        48% {
          transform: translate3d(-0.9px, -10px, 0) rotate(-2deg)
            scale(0.84, 1.08);
          opacity: 0.24;
        }
        72% {
          transform: translate3d(0.7px, -19px, 0) rotate(2deg) scale(0.9, 1.2);
          opacity: 0.12;
        }
        100% {
          transform: translate3d(0.5px, -28px, 0) rotate(4deg) scale(0.82, 1.28);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstA {
        0% {
          transform: translate3d(0, 4px, 0) rotate(-6deg) scale(0.58, 0.8);
          opacity: 0;
        }
        16% {
          transform: translate3d(-1px, -5px, 0) rotate(-10deg) scale(0.84, 1.08);
          opacity: 0.7;
        }
        40% {
          transform: translate3d(1.2px, -18px, 0) rotate(-5deg)
            scale(0.98, 1.32);
          opacity: 0.42;
        }
        68% {
          transform: translate3d(-1.1px, -31px, 0) rotate(2deg)
            scale(0.94, 1.48);
          opacity: 0.2;
        }
        100% {
          transform: translate3d(0.8px, -44px, 0) rotate(5deg) scale(0.84, 1.62);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstB {
        0% {
          transform: translate3d(0, 4px, 0) rotate(4deg) scale(0.56, 0.78);
          opacity: 0;
        }
        16% {
          transform: translate3d(0.9px, -6px, 0) rotate(8deg) scale(0.8, 1.04);
          opacity: 0.58;
        }
        40% {
          transform: translate3d(-1.1px, -20px, 0) rotate(4deg)
            scale(0.92, 1.26);
          opacity: 0.36;
        }
        68% {
          transform: translate3d(1.3px, -34px, 0) rotate(-2deg) scale(0.9, 1.42);
          opacity: 0.16;
        }
        100% {
          transform: translate3d(-0.9px, -47px, 0) rotate(-5deg)
            scale(0.8, 1.56);
          opacity: 0;
        }
      }

      @keyframes portalBadgeEmberBurstC {
        0% {
          transform: translate3d(0, 4px, 0) rotate(-4deg) scale(0.56, 0.78);
          opacity: 0;
        }
        18% {
          transform: translate3d(-0.9px, -5px, 0) rotate(-8deg) scale(0.78, 1);
          opacity: 0.5;
        }
        42% {
          transform: translate3d(1px, -17px, 0) rotate(-4deg) scale(0.88, 1.2);
          opacity: 0.3;
        }
        72% {
          transform: translate3d(-1px, -29px, 0) rotate(2deg) scale(0.86, 1.36);
          opacity: 0.14;
        }
        100% {
          transform: translate3d(0.7px, -40px, 0) rotate(5deg) scale(0.78, 1.48);
          opacity: 0;
        }
      }

      @keyframes portalBadgeSpinHeavy {
        0% {
          transform: rotateY(0deg);
        }
        26% {
          transform: rotateY(78deg);
        }
        29.5% {
          transform: rotateY(108deg);
        }
        50% {
          transform: rotateY(180deg);
        }
        70.5% {
          transform: rotateY(252deg);
        }
        74% {
          transform: rotateY(282deg);
        }
        100% {
          transform: rotateY(360deg);
        }
      }
      @keyframes portalBadgeSpinFaster {
        0% {
          transform: rotateY(0deg);
        }
        27% {
          transform: rotateY(80deg);
        }
        30.5% {
          transform: rotateY(108deg);
        }
        50% {
          transform: rotateY(180deg);
        }
        69.5% {
          transform: rotateY(252deg);
        }
        73% {
          transform: rotateY(280deg);
        }
        100% {
          transform: rotateY(360deg);
        }
      }

      @keyframes portalBadgeSpinFastest {
        0% {
          transform: rotateY(0deg);
        }
        18% {
          transform: rotateY(102deg);
        }
        44% {
          transform: rotateY(246deg);
        }
        68% {
          transform: rotateY(328deg);
        }
        88.5% {
          transform: rotateY(353deg);
        }
        97.8% {
          transform: rotateY(359.1deg);
        }
        100% {
          transform: rotateY(360deg);
        }
      }

      @keyframes portalBadgeSpinSettle {
        0% {
          transform: translate3d(0, 0, 0) rotateZ(-1.6deg) scale(0.882);
          filter: brightness(0.97);
        }
        18% {
          transform: translate3d(0, 0, 0) rotateZ(-0.7deg) scale(0.952);
          filter: brightness(1);
        }
        52% {
          transform: translate3d(0, 0, 0) rotateZ(0.96deg) scale(1.058);
          filter: brightness(1.08);
        }
        72% {
          transform: translate3d(0, 0, 0) rotateZ(-0.32deg) scale(1.012);
          filter: brightness(1.03);
        }
        88% {
          transform: translate3d(0, 0, 0) rotateZ(0.14deg) scale(1.004);
          filter: brightness(1.01);
        }
        96% {
          transform: translate3d(0, 0, 0) rotateZ(0deg) scale(1);
          filter: brightness(1);
        }
        96.4% {
          transform: translate3d(-2px, 0.9px, 0) rotateZ(-0.58deg) scale(1.026);
          filter: brightness(1.12);
        }
        97.2% {
          transform: translate3d(2.3px, -1.15px, 0) rotateZ(0.5deg) scale(0.996);
          filter: brightness(1.08);
        }
        98% {
          transform: translate3d(-1.6px, 0.95px, 0) rotateZ(-0.34deg)
            scale(1.012);
          filter: brightness(1.05);
        }
        98.8% {
          transform: translate3d(1px, -0.6px, 0) rotateZ(0.22deg) scale(0.998);
          filter: brightness(1.03);
        }
        99.4% {
          transform: translate3d(-0.5px, 0.3px, 0) rotateZ(-0.1deg) scale(1.003);
          filter: brightness(1.015);
        }
        100% {
          transform: translate3d(0, 0, 0) rotateZ(0deg) scale(1);
          filter: brightness(1);
        }
      }

      @keyframes portalBadgeRevealLayerActivation {
        0% {
          filter: saturate(1) brightness(1);
        }
        45% {
          filter: saturate(1.03) brightness(1.01);
        }
        100% {
          filter: saturate(1.08) brightness(1.03);
        }
      }

      @keyframes portalBadgeUnlockEnergyFlare {
        0% {
          opacity: 0;
          transform: scale(0.62);
          filter: blur(10px);
        }
        12% {
          opacity: 0.18;
        }
        34% {
          opacity: 0.34;
          transform: scale(0.9);
          filter: blur(8px);
        }
        66% {
          opacity: 0.16;
          transform: scale(1.12);
          filter: blur(12px);
        }
        100% {
          opacity: 0;
          transform: scale(1.22);
          filter: blur(14px);
        }
      }

      @keyframes portalBadgeEdgeSpinePresence {
        0% {
          opacity: 0.42;
          filter: blur(0.7px) brightness(1);
        }
        18% {
          opacity: 0.64;
          filter: blur(0.42px) brightness(1.12);
        }
        44% {
          opacity: 0.9;
          filter: blur(0.16px) brightness(1.24);
        }
        70% {
          opacity: 0.82;
          filter: blur(0.24px) brightness(1.18);
        }
        100% {
          opacity: 0.48;
          filter: blur(0.62px) brightness(1.02);
        }
      }

      @keyframes portalBadgeQuarterGlintStage1 {
        0%,
        26.2%,
        28.6%,
        71.4%,
        73.8%,
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scaleX(0.48);
          filter: blur(1.2px);
        }
        27.4%,
        72.6% {
          opacity: 0.82;
          transform: translate(-50%, -50%) scaleX(1);
          filter: blur(0.24px);
        }
      }

      @keyframes portalBadgeQuarterGlintStage2 {
        0%,
        27.1%,
        29.4%,
        70.6%,
        72.9%,
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scaleX(0.48);
          filter: blur(1.05px);
        }
        28.25%,
        71.75% {
          opacity: 0.96;
          transform: translate(-50%, -50%) scaleX(1);
          filter: blur(0.18px);
        }
      }

      @keyframes portalBadgeQuarterGlintStage3 {
        0%,
        14.8%,
        17.0%,
        49.8%,
        52.2%,
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scaleX(0.46);
          filter: blur(0.95px);
        }
        15.9%,
        51.0% {
          opacity: 1;
          transform: translate(-50%, -50%) scaleX(1);
          filter: blur(0.12px);
        }
      }

      @keyframes portalBadgeImpactFlash {
        0%,
        95.8% {
          opacity: 0;
          transform: scale(0.9);
          filter: blur(12px);
        }
        96.8% {
          opacity: 0.28;
          transform: scale(0.985);
          filter: blur(8px);
        }
        97.6% {
          opacity: 1;
          transform: scale(1.02);
          filter: blur(3px);
        }
        98.8% {
          opacity: 0.42;
          transform: scale(1.01);
          filter: blur(6px);
        }
        100% {
          opacity: 0;
          transform: scale(1.06);
          filter: blur(12px);
        }
      }

      @keyframes portalBadgeFinalShimmerCelebrating {
        0%,
        62% {
          opacity: 0;
          transform: translate3d(-168%, 0, 0) rotate(24deg);
        }
        70% {
          opacity: 0.2;
        }
        78% {
          opacity: 1;
        }
        88% {
          opacity: 0.32;
          transform: translate3d(148%, 0, 0) rotate(24deg);
        }
        100% {
          opacity: 0;
          transform: translate3d(148%, 0, 0) rotate(24deg);
        }
      }

      @keyframes portalBadgeMetaQuestionDissolve {
        0% {
          opacity: 0.3;
          transform: translate3d(0, 0, 0) scale(1);
          filter: blur(0px);
        }
        100% {
          opacity: 0;
          transform: translate3d(0, -3px, 0) scale(0.96);
          filter: blur(1.2px);
        }
      }

      @keyframes portalBadgeMetaTitleReveal {
        0% {
          opacity: 0;
          transform: translate3d(0, 5px, 0);
          filter: blur(1.8px);
        }
        100% {
          opacity: 0.7;
          transform: translate3d(0, 0, 0);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeMetaDescriptionReveal {
        0% {
          opacity: 0;
          transform: translate3d(0, 6px, 0);
          filter: blur(2.2px);
        }
        100% {
          opacity: 0.58;
          transform: translate3d(0, 0, 0);
          filter: blur(0px);
        }
      }

      .portal-badge-unlock-visual {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: visible;
        outline: none;
        perspective: 1400px;
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

      .portal-badge-spin-stage-1,
      .portal-badge-spin-stage-2,
      .portal-badge-spin-stage-3,
      .portal-badge-art-shell {
        transform-style: preserve-3d;
        transform-origin: 50% 50%;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        will-change: transform;
      }

      .portal-badge-spin-stage-1--unlocking {
        animation: portalBadgeSpinHeavy 1480ms linear both;
      }

      .portal-badge-spin-stage-2--unlocking {
        animation: portalBadgeSpinFaster 900ms linear 1480ms both;
      }

      .portal-badge-spin-stage-3--unlocking {
        animation: portalBadgeSpinFastest 560ms linear 2380ms both;
      }

      .portal-badge-art-shell--unlocking {
        animation: portalBadgeSpinSettle 3060ms cubic-bezier(0.22, 1, 0.36, 1)
          both;
      }

      .portal-badge-art-shell img,
      .portal-badge-art-shell span,
      .portal-badge-art-shell div:not(.portal-badge-edge-spine) {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transform: translateZ(0.01px);
      }

      .portal-badge-art-base-greyscale {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      .portal-badge-reveal-canvas-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        isolation: isolate;
        opacity: 1;
        filter: saturate(1) brightness(1);
      }

      .portal-badge-reveal-canvas-layer--unlocking {
        animation: portalBadgeRevealLayerActivation 600ms
          cubic-bezier(0.18, 0.88, 0.24, 1) 1210ms both;
      }

      .portal-badge-quarter-glint {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 3.2%;
        height: 84%;
        border-radius: 999px;
        pointer-events: none;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.86) 34%,
          rgba(255, 255, 255, 1) 50%,
          rgba(255, 255, 255, 0.86) 66%,
          rgba(255, 255, 255, 0) 100%
        );
        box-shadow:
          0 0 8px rgba(255, 255, 255, 0.34),
          0 0 16px rgba(255, 255, 255, 0.14);
        opacity: 0;
        z-index: 3;
      }

      .portal-badge-quarter-glint--stage-1 {
        animation: portalBadgeQuarterGlintStage1 1480ms linear both;
      }

      .portal-badge-quarter-glint--stage-2 {
        animation: portalBadgeQuarterGlintStage2 900ms linear 1480ms both;
      }

      .portal-badge-quarter-glint--stage-3 {
        animation: portalBadgeQuarterGlintStage3 560ms linear 2380ms both;
      }

      .portal-badge-edge-spine {
        transform-style: preserve-3d;
        transform-origin: 50% 50%;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.18) 0%,
          rgba(255, 255, 255, 0.72) 18%,
          rgba(255, 255, 255, 1) 50%,
          rgba(255, 255, 255, 0.72) 82%,
          rgba(255, 255, 255, 0.18) 100%
        );
        box-shadow:
          0 0 4px rgba(255, 255, 255, 0.34),
          0 0 10px rgba(255, 255, 255, 0.18);
        opacity: 0.78;
      }

      .portal-badge-edge-spine--left {
        transform: translate(-50%, -50%) rotateY(90deg) translateZ(2.3px);
      }

      .portal-badge-edge-spine--right {
        transform: translate(-50%, -50%) rotateY(-90deg) translateZ(2.3px);
      }

      .portal-badge-edge-spine--left,
      .portal-badge-edge-spine--right {
        animation: portalBadgeEdgeSpinePresence 3060ms linear both;
      }

      .portal-badge-unlock-energy-flare {
        background:
          radial-gradient(
            circle at 50% 50%,
            rgba(255, 255, 255, 0.22) 0%,
            rgba(255, 255, 255, 0.08) 26%,
            rgba(255, 255, 255, 0) 62%
          ),
          radial-gradient(
            circle at 50% 50%,
            rgba(255, 255, 255, 0.08) 0%,
            rgba(255, 255, 255, 0) 74%
          );
        animation: portalBadgeUnlockEnergyFlare 920ms
          cubic-bezier(0.18, 0.88, 0.24, 1) 1120ms both;
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

      .portal-badge-inner-aura {
        animation: portalBadgeInnerAuraPulse 3600ms ease-in-out infinite;
        will-change: transform, opacity;
      }

      .portal-badge-centre-radiance {
        animation: portalBadgeCentreRadiance 3400ms ease-in-out infinite;
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

      .portal-badge-spark-a,
      .portal-badge-spark-b,
      .portal-badge-spark-c,
      .portal-badge-burst-a,
      .portal-badge-burst-b,
      .portal-badge-burst-c {
        opacity: 0;
        transform-origin: 50% 100%;
        clip-path: polygon(
          50% 0%,
          64% 10%,
          72% 24%,
          76% 42%,
          70% 60%,
          60% 76%,
          52% 90%,
          50% 100%,
          48% 90%,
          40% 76%,
          30% 60%,
          24% 42%,
          28% 24%,
          36% 10%
        );
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.98) 0%,
          rgba(255, 255, 255, 0.8) 16%,
          rgba(255, 255, 255, 0.28) 54%,
          rgba(255, 255, 255, 0.06) 82%,
          rgba(255, 255, 255, 0) 100%
        );
        filter: blur(0.22px) drop-shadow(0 0 6px rgba(255, 255, 255, 0.22))
          drop-shadow(0 0 12px rgba(255, 255, 255, 0.1));
        will-change: transform, opacity, filter;
      }

      .portal-badge-spark-a::before,
      .portal-badge-spark-b::before,
      .portal-badge-spark-c::before,
      .portal-badge-burst-a::before,
      .portal-badge-burst-b::before,
      .portal-badge-burst-c::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 8%;
        width: 22%;
        height: 76%;
        transform: translateX(-50%);
        clip-path: polygon(
          50% 0%,
          72% 14%,
          64% 62%,
          50% 100%,
          36% 62%,
          28% 14%
        );
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 1) 0%,
          rgba(255, 255, 255, 0.8) 34%,
          rgba(255, 255, 255, 0.08) 100%
        );
        filter: blur(0.35px);
      }

      .portal-badge-spark-a::after,
      .portal-badge-spark-b::after,
      .portal-badge-spark-c::after,
      .portal-badge-burst-a::after,
      .portal-badge-burst-b::after,
      .portal-badge-burst-c::after {
        content: "";
        position: absolute;
        left: 50%;
        top: 16%;
        width: 78%;
        height: 64%;
        transform: translateX(-50%);
        clip-path: polygon(
          50% 0%,
          70% 16%,
          78% 42%,
          66% 70%,
          50% 100%,
          34% 70%,
          22% 42%,
          30% 16%
        );
        background: radial-gradient(
          ellipse at 50% 24%,
          rgba(255, 255, 255, 0.56) 0%,
          rgba(255, 255, 255, 0.18) 42%,
          rgba(255, 255, 255, 0) 78%
        );
        filter: blur(0.9px);
        opacity: 0.76;
      }

      .portal-badge-spark-a {
        animation: portalBadgeEmberRiseA 1300ms
          cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
      }

      .portal-badge-spark-b {
        animation: portalBadgeEmberRiseB 1600ms
          cubic-bezier(0.19, 0.72, 0.32, 1) infinite 160ms;
      }

      .portal-badge-spark-c {
        animation: portalBadgeEmberRiseC 1450ms cubic-bezier(0.25, 0.68, 0.3, 1)
          infinite 320ms;
      }

      .portal-badge-spark-a,
      .portal-badge-burst-a {
        transform-origin: 50% 100%;
      }

      .portal-badge-spark-b,
      .portal-badge-burst-b {
        transform-origin: 50% 100%;
      }

      .portal-badge-spark-c,
      .portal-badge-burst-c {
        transform-origin: 50% 100%;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-a,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-a {
        animation: portalBadgeEmberBurstA 950ms cubic-bezier(0.2, 0.72, 0.28, 1)
          infinite;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-b,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-b {
        animation: portalBadgeEmberBurstB 1100ms
          cubic-bezier(0.18, 0.75, 0.3, 1) infinite 120ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-spark-c,
      .portal-badge-unlock-host:focus-within .portal-badge-spark-c {
        animation: portalBadgeEmberBurstC 1000ms cubic-bezier(0.24, 0.7, 0.3, 1)
          infinite 220ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-a,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-a {
        animation: portalBadgeEmberBurstA 820ms cubic-bezier(0.2, 0.74, 0.28, 1)
          infinite 40ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-b,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-b {
        animation: portalBadgeEmberBurstB 900ms cubic-bezier(0.18, 0.76, 0.3, 1)
          infinite 180ms;
      }

      .portal-badge-unlock-host:hover .portal-badge-burst-c,
      .portal-badge-unlock-host:focus-within .portal-badge-burst-c {
        animation: portalBadgeEmberBurstC 860ms cubic-bezier(0.22, 0.72, 0.3, 1)
          infinite 300ms;
      }

      .portal-badge-final-art-shell {
        position: absolute;
        inset: 0;
      }

      .portal-badge-final-art-image {
        position: absolute;
        inset: 0;
      }

      .portal-badge-final-shimmer {
        overflow: hidden;
      }

      .portal-badge-final-shimmer::before {
        content: "";
        position: absolute;
        inset: -42% -62%;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.04) 34%,
          rgba(255, 255, 255, 0.18) 42%,
          rgba(255, 255, 255, 0.98) 49%,
          rgba(255, 255, 255, 0.5) 53%,
          rgba(255, 255, 255, 0.12) 60%,
          rgba(255, 255, 255, 0) 72%
        );
        filter: blur(5px);
        mix-blend-mode: screen;
        opacity: 0;
        transform: translate3d(-168%, 0, 0) rotate(24deg);
      }

      .portal-badge-final-shimmer--celebrating::before {
        animation: portalBadgeFinalShimmerCelebrating 3000ms
          cubic-bezier(0.22, 1, 0.36, 1) 1 both;
      }

      .portal-member-badge-meta-inner {
        position: relative;
        min-height: 24px;
      }

      .portal-member-badge-question-mark {
        position: relative;
        z-index: 1;
        will-change: transform, opacity, filter;
      }

      .portal-member-badge-question-mark--dissolving {
        animation: portalBadgeMetaQuestionDissolve 300ms
          cubic-bezier(0.32, 1, 0.68, 1) 2640ms both;
      }

      .portal-member-badge-meta-revealed {
        position: relative;
        z-index: 2;
      }
      .portal-badge-unlock-host[data-badge-meta-revealing="true"][data-badge-unlocked="false"]
        .portal-member-badge-question-mark {
        animation: portalBadgeMetaQuestionDissolve 300ms
          cubic-bezier(0.32, 1, 0.68, 1) 2640ms both;
      }

      .portal-member-badge-title,
      .portal-member-badge-description {
        will-change: transform, opacity, filter;
      }

      .portal-member-badge-title--revealing {
        opacity: 0;
        animation: portalBadgeMetaTitleReveal 420ms
          cubic-bezier(0.22, 1, 0.36, 1) 2720ms both;
      }

      .portal-member-badge-description--revealing {
        opacity: 0;
        animation: portalBadgeMetaDescriptionReveal 480ms
          cubic-bezier(0.22, 1, 0.36, 1) 2790ms both;
      }

      @media (prefers-reduced-motion: reduce) {
        .portal-badge-core--locked,
        .portal-badge-idle-glow,
        .portal-badge-inner-aura,
        .portal-badge-centre-radiance,
        .portal-badge-spark-a,
        .portal-badge-spark-b,
        .portal-badge-spark-c,
        .portal-badge-burst-a,
        .portal-badge-burst-b,
        .portal-badge-burst-c,
        .portal-badge-spin-stage-1--unlocking,
        .portal-badge-spin-stage-2--unlocking,
        .portal-badge-spin-stage-3--unlocking,
        .portal-badge-art-shell--unlocking,
        .portal-badge-reveal-canvas-layer--unlocking,
        .portal-badge-unlock-energy-flare,
        .portal-badge-impact-flash,
        .portal-badge-impact-particle,
        .portal-badge-final-shimmer::before {
          animation: none !important;
        }

        .portal-badge-embers {
          opacity: 0 !important;
        }

        .portal-badge-unlock-visual-inner {
          transition: none !important;
        }

        .portal-badge-reveal-canvas-layer {
          opacity: 1 !important;
          filter: none !important;
        }

        .portal-member-badge-question-mark,
        .portal-member-badge-title,
        .portal-member-badge-description {
          animation: none !important;
          opacity: unset !important;
          transform: none !important;
          filter: none !important;
        }
      }
    `}</style>
  );
}
