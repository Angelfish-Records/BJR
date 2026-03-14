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

      @keyframes portalBadgeUnlockSpinTriple {
        0% {
          transform: rotateY(0deg) rotateZ(-1.15deg) scale(0.9);
        }
        10% {
          transform: rotateY(78deg) rotateZ(-1deg) scale(0.94);
        }
        36% {
          transform: rotateY(360deg) rotateZ(0.16deg) scale(1);
        }
        50% {
          transform: rotateY(552deg) rotateZ(0.78deg) scale(1.03);
        }
        64% {
          transform: rotateY(720deg) rotateZ(-0.42deg) scale(1.045);
        }
        74% {
          transform: rotateY(904deg) rotateZ(0.92deg) scale(1.06);
        }
        84% {
          transform: rotateY(1080deg) rotateZ(-0.58deg) scale(1.055);
        }
        90% {
          transform: rotateY(1080deg) rotateZ(0.44deg) scale(1.02);
        }
        96% {
          transform: rotateY(1080deg) rotateZ(-0.18deg) scale(0.996);
        }
        100% {
          transform: rotateY(1080deg) rotateZ(0deg) scale(1);
        }
      }

      @keyframes portalBadgeColourIslandCore {
        0% {
          opacity: 0;
          transform: scale(0.1);
          filter: blur(10px);
        }
        18% {
          opacity: 0.92;
        }
        100% {
          opacity: 1;
          transform: scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandA {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.16);
          filter: blur(9px);
        }
        22% {
          opacity: 0.95;
        }
        100% {
          opacity: 1;
          transform: translate3d(-11%, -8%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandB {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.14);
          filter: blur(9px);
        }
        28% {
          opacity: 0.88;
        }
        100% {
          opacity: 1;
          transform: translate3d(12%, -10%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandC {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.14);
          filter: blur(9px);
        }
        30% {
          opacity: 0.84;
        }
        100% {
          opacity: 1;
          transform: translate3d(-9%, 11%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandD {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.12);
          filter: blur(9px);
        }
        34% {
          opacity: 0.82;
        }
        100% {
          opacity: 1;
          transform: translate3d(10%, 13%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandE {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.12);
          filter: blur(10px);
        }
        46% {
          opacity: 0;
        }
        70% {
          opacity: 0.72;
        }
        100% {
          opacity: 1;
          transform: translate3d(0%, -15%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandF {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.12);
          filter: blur(10px);
        }
        54% {
          opacity: 0;
        }
        76% {
          opacity: 0.7;
        }
        100% {
          opacity: 1;
          transform: translate3d(-15%, 2%, 0) scale(1);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourIslandG {
        0% {
          opacity: 0;
          transform: translate3d(0%, 0%, 0) scale(0.12);
          filter: blur(10px);
        }
        58% {
          opacity: 0;
        }
        80% {
          opacity: 0.68;
        }
        100% {
          opacity: 1;
          transform: translate3d(14%, 4%, 0) scale(1);
          filter: blur(0px);
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

      @keyframes portalBadgeUnlockRingA {
        0% {
          transform: scale(0.72);
          opacity: 0;
        }
        12% {
          opacity: 0.86;
        }
        58% {
          opacity: 0.2;
        }
        100% {
          transform: scale(1.28);
          opacity: 0;
        }
      }

      @keyframes portalBadgeUnlockRingB {
        0% {
          transform: scale(0.84);
          opacity: 0;
        }
        18% {
          opacity: 0.56;
        }
        60% {
          opacity: 0.18;
        }
        100% {
          transform: scale(1.42);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactFlash {
        0%,
        78% {
          opacity: 0;
          transform: scale(0.86);
          filter: blur(10px);
        }
        84% {
          opacity: 0.72;
          transform: scale(1.04);
          filter: blur(6px);
        }
        91% {
          opacity: 0.34;
          transform: scale(1.1);
          filter: blur(10px);
        }
        100% {
          opacity: 0;
          transform: scale(1.18);
          filter: blur(14px);
        }
      }

      @keyframes portalBadgeImpactParticleA {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(-16px, -6px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactParticleB {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(14px, -8px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactParticleC {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(-10px, 13px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactParticleD {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(12px, 14px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactParticleE {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(0px, -18px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeImpactParticleF {
        0%,
        82% {
          transform: translate(0, 0) scale(0.2);
          opacity: 0;
        }
        86% {
          opacity: 1;
        }
        100% {
          transform: translate(0px, 18px) scale(1);
          opacity: 0;
        }
      }

      @keyframes portalBadgeFinalShimmerCelebrating {
        0%,
        58% {
          opacity: 0;
          transform: translateX(-132%) rotate(18deg);
        }
        70% {
          opacity: 0.12;
        }
        78% {
          opacity: 1;
        }
        90% {
          opacity: 0.14;
          transform: translateX(136%) rotate(18deg);
        }
        100% {
          opacity: 0;
          transform: translateX(136%) rotate(18deg);
        }
      }

      .portal-badge-unlock-visual {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: visible;
        outline: none;
        perspective: 1200px;
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
        -webkit-backface-visibility: hidden;
        will-change: transform;
      }

      .portal-badge-art-spin--unlocking {
        animation: portalBadgeUnlockSpinTriple 3600ms
          cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .portal-badge-art-spin img,
      .portal-badge-art-spin span {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transform: translateZ(0.01px);
      }

      .portal-badge-art-base-greyscale {
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
        transform: translateZ(0.01px) scale(1.035);
      }

      .portal-badge-colour-reveal {
        position: absolute;
        inset: 0;
        pointer-events: none;
        isolation: isolate;
      }

      .portal-badge-colour-island {
        position: absolute;
        inset: 0;
        opacity: 0;
        will-change: transform, opacity, filter;
      }

      .portal-badge-colour-island > span,
      .portal-badge-colour-island img {
        position: absolute !important;
        inset: 0;
      }

      .portal-badge-colour-island--core {
        clip-path: ellipse(12% 12% at 50% 50%);
        animation: portalBadgeColourIslandCore 980ms
          cubic-bezier(0.2, 0.9, 0.24, 1) both;
      }

      .portal-badge-colour-island--a {
        clip-path: ellipse(12% 16% at 48% 48%);
        animation: portalBadgeColourIslandA 1360ms
          cubic-bezier(0.18, 0.92, 0.24, 1) both;
      }

      .portal-badge-colour-island--b {
        clip-path: ellipse(15% 11% at 52% 46%);
        animation: portalBadgeColourIslandB 1300ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 90ms both;
      }

      .portal-badge-colour-island--c {
        clip-path: ellipse(11% 15% at 47% 53%);
        animation: portalBadgeColourIslandC 1460ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 170ms both;
      }

      .portal-badge-colour-island--d {
        clip-path: ellipse(10% 10% at 54% 55%);
        animation: portalBadgeColourIslandD 1380ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 120ms both;
      }

      .portal-badge-colour-island--e {
        clip-path: ellipse(11% 14% at 50% 39%);
        animation: portalBadgeColourIslandE 1700ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 420ms both;
      }

      .portal-badge-colour-island--f {
        clip-path: ellipse(10% 13% at 39% 51%);
        animation: portalBadgeColourIslandF 1660ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 560ms both;
      }

      .portal-badge-colour-island--g {
        clip-path: ellipse(10% 12% at 61% 52%);
        animation: portalBadgeColourIslandG 1620ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 700ms both;
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
        animation: portalBadgeUnlockEnergyFlare 1180ms
          cubic-bezier(0.18, 0.88, 0.24, 1) both;
      }

      .portal-badge-unlock-ring-a,
      .portal-badge-unlock-ring-b {
        opacity: 0;
      }

      .portal-badge-unlock-ring-a {
        animation: portalBadgeUnlockRingA 920ms cubic-bezier(0.2, 0.84, 0.24, 1)
          both;
      }

      .portal-badge-unlock-ring-b {
        animation: portalBadgeUnlockRingB 1160ms
          cubic-bezier(0.18, 0.86, 0.24, 1) 90ms both;
      }

      .portal-badge-impact-flash {
        background: radial-gradient(
          circle,
          rgba(255, 255, 255, 0.56) 0%,
          rgba(255, 255, 255, 0.18) 24%,
          rgba(255, 255, 255, 0) 62%
        );
        opacity: 0;
        animation: portalBadgeImpactFlash 1620ms linear both;
      }

      .portal-badge-impact-particles {
        overflow: visible;
      }

      .portal-badge-impact-particle {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 8%;
        height: 8%;
        margin-left: -4%;
        margin-top: -4%;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.24);
        opacity: 0;
      }

      .portal-badge-impact-particle--a {
        animation: portalBadgeImpactParticleA 1620ms linear both;
      }

      .portal-badge-impact-particle--b {
        animation: portalBadgeImpactParticleB 1620ms linear both;
      }

      .portal-badge-impact-particle--c {
        animation: portalBadgeImpactParticleC 1620ms linear both;
      }

      .portal-badge-impact-particle--d {
        animation: portalBadgeImpactParticleD 1620ms linear both;
      }

      .portal-badge-impact-particle--e {
        animation: portalBadgeImpactParticleE 1620ms linear both;
      }

      .portal-badge-impact-particle--f {
        animation: portalBadgeImpactParticleF 1620ms linear both;
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
        animation: portalBadgeEmberRiseC 1450ms cubic-bezier(0.25, 0.68, 0.3, 1)
          infinite 320ms;
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

      .portal-badge-burst-a,
      .portal-badge-burst-b,
      .portal-badge-burst-c {
        opacity: 0;
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
        inset: -28% -44%;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.05) 32%,
          rgba(255, 255, 255, 0.98) 48%,
          rgba(255, 255, 255, 0.24) 56%,
          rgba(255, 255, 255, 0) 72%
        );
        filter: blur(8px);
        mix-blend-mode: screen;
        opacity: 0;
        transform: translateX(-132%) rotate(18deg);
      }

      .portal-badge-final-shimmer--celebrating::before {
        animation: portalBadgeFinalShimmerCelebrating 3000ms
          cubic-bezier(0.22, 1, 0.36, 1) 1 both;
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
        .portal-badge-art-spin--unlocking,
        .portal-badge-colour-island--core,
        .portal-badge-colour-island--a,
        .portal-badge-colour-island--b,
        .portal-badge-colour-island--c,
        .portal-badge-colour-island--d,
        .portal-badge-colour-island--e,
        .portal-badge-colour-island--f,
        .portal-badge-colour-island--g,
        .portal-badge-unlock-energy-flare,
        .portal-badge-unlock-ring-a,
        .portal-badge-unlock-ring-b,
        .portal-badge-impact-flash,
        .portal-badge-impact-particle,
        .portal-badge-final-shimmer::before {
          animation: none !important;
        }

        .portal-badge-embers {
          opacity: 0 !important;
        }

        .portal-badge-colour-island {
          opacity: 1 !important;
          transform: none !important;
          filter: none !important;
        }

        .portal-badge-unlock-visual-inner {
          transition: none !important;
        }
      }
    `}</style>
  );
}
