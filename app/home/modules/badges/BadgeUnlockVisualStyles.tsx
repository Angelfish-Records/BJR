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
          transform: rotateY(0deg) rotateZ(-1.2deg) scale(0.88);
        }
        9% {
          transform: rotateY(82deg) rotateZ(-1deg) scale(0.93);
        }
        20% {
          transform: rotateY(360deg) rotateZ(0.2deg) scale(0.99);
        }
        32% {
          transform: rotateY(580deg) rotateZ(0.8deg) scale(1.03);
        }
        49% {
          transform: rotateY(720deg) rotateZ(-0.5deg) scale(1.04);
        }
        64% {
          transform: rotateY(930deg) rotateZ(0.9deg) scale(1.06);
        }
        82% {
          transform: rotateY(1080deg) rotateZ(-0.6deg) scale(1.055);
        }
        90% {
          transform: rotateY(1080deg) rotateZ(0.45deg) scale(1.022);
        }
        96% {
          transform: rotateY(1080deg) rotateZ(-0.18deg) scale(0.995);
        }
        100% {
          transform: rotateY(1080deg) rotateZ(0deg) scale(1);
        }
      }

      @keyframes portalBadgeColourRevealMaskPrimary {
        0% {
          opacity: 0;
          transform: scale(0.22);
          filter: blur(7px);
        }
        14% {
          opacity: 0.95;
          transform: scale(0.36);
          filter: blur(6px);
        }
        42% {
          opacity: 1;
          transform: scale(0.78);
          filter: blur(3px);
        }
        72% {
          opacity: 1;
          transform: scale(1.16);
          filter: blur(1.5px);
        }
        100% {
          opacity: 1;
          transform: scale(1.42);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourRevealMaskSecondary {
        0% {
          opacity: 0;
          transform: scale(0.18);
          filter: blur(10px);
        }
        22% {
          opacity: 0;
          transform: scale(0.24);
        }
        48% {
          opacity: 0.72;
          transform: scale(0.72);
          filter: blur(5px);
        }
        82% {
          opacity: 0.96;
          transform: scale(1.14);
          filter: blur(1.5px);
        }
        100% {
          opacity: 1;
          transform: scale(1.32);
          filter: blur(0px);
        }
      }

      @keyframes portalBadgeColourRevealBlobA {
        0% {
          transform: translate(-50%, -50%) scale(0.26);
        }
        100% {
          transform: translate(-50%, -50%) translate(-14%, -6%) scale(1.28);
        }
      }

      @keyframes portalBadgeColourRevealBlobB {
        0% {
          transform: translate(-50%, -50%) scale(0.24);
        }
        100% {
          transform: translate(-50%, -50%) translate(15%, -12%) scale(1.18);
        }
      }

      @keyframes portalBadgeColourRevealBlobC {
        0% {
          transform: translate(-50%, -50%) scale(0.22);
        }
        100% {
          transform: translate(-50%, -50%) translate(-10%, 12%) scale(1.2);
        }
      }

      @keyframes portalBadgeColourRevealBlobD {
        0% {
          transform: translate(-50%, -50%) scale(0.2);
        }
        100% {
          transform: translate(-50%, -50%) translate(13%, 15%) scale(1.08);
        }
      }

      @keyframes portalBadgeColourRevealBlobE {
        0% {
          transform: translate(-50%, -50%) scale(0.18);
        }
        100% {
          transform: translate(-50%, -50%) translate(0%, -18%) scale(1.1);
        }
      }

      @keyframes portalBadgeColourRevealBlobF {
        0% {
          transform: translate(-50%, -50%) scale(0.18);
        }
        100% {
          transform: translate(-50%, -50%) translate(-19%, 2%) scale(1.06);
        }
      }

      @keyframes portalBadgeColourRevealBlobG {
        0% {
          transform: translate(-50%, -50%) scale(0.18);
        }
        100% {
          transform: translate(-50%, -50%) translate(18%, 5%) scale(1.04);
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

      @keyframes portalBadgeFinalShimmer {
        0%,
        68%,
        100% {
          opacity: 0;
          transform: translateX(-125%) rotate(18deg);
        }
        76% {
          opacity: 0.04;
        }
        84% {
          opacity: 0.88;
        }
        92% {
          opacity: 0.08;
          transform: translateX(132%) rotate(18deg);
        }
      }

      @keyframes portalBadgeFinalShimmerCelebrating {
        0%,
        42%,
        100% {
          opacity: 0;
          transform: translateX(-128%) rotate(18deg);
        }
        58% {
          opacity: 0.08;
        }
        70% {
          opacity: 1;
        }
        82% {
          opacity: 0.12;
          transform: translateX(134%) rotate(18deg);
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
        will-change: transform;
      }

      .portal-badge-art-spin--unlocking {
        animation: portalBadgeUnlockSpinTriple 1620ms both;
      }

      .portal-badge-art-base-greyscale {
        backface-visibility: hidden;
        transform: translateZ(0);
      }

      .portal-badge-colour-reveal {
        position: absolute;
        inset: 0;
        opacity: 0;
      }

      .portal-badge-colour-reveal--primary {
        animation: portalBadgeColourRevealMaskPrimary 1020ms
          cubic-bezier(0.2, 0.9, 0.24, 1) both;
      }

      .portal-badge-colour-reveal--secondary {
        animation: portalBadgeColourRevealMaskSecondary 1240ms
          cubic-bezier(0.18, 0.86, 0.24, 1) both;
      }

      .portal-badge-colour-reveal-mask {
        position: absolute;
        inset: -22%;
        transform-origin: 50% 50%;
        filter: blur(5px);
        -webkit-mask-image:
          radial-gradient(
            circle at 50% 50%,
            rgba(0, 0, 0, 1) 0 14%,
            transparent 30%
          ),
          radial-gradient(
            circle at 42% 44%,
            rgba(0, 0, 0, 0.98) 0 18%,
            transparent 36%
          ),
          radial-gradient(
            circle at 59% 42%,
            rgba(0, 0, 0, 0.94) 0 15%,
            transparent 32%
          ),
          radial-gradient(
            circle at 44% 60%,
            rgba(0, 0, 0, 0.9) 0 16%,
            transparent 34%
          ),
          radial-gradient(
            circle at 61% 60%,
            rgba(0, 0, 0, 0.86) 0 13%,
            transparent 29%
          );
        mask-image:
          radial-gradient(
            circle at 50% 50%,
            rgba(0, 0, 0, 1) 0 14%,
            transparent 30%
          ),
          radial-gradient(
            circle at 42% 44%,
            rgba(0, 0, 0, 0.98) 0 18%,
            transparent 36%
          ),
          radial-gradient(
            circle at 59% 42%,
            rgba(0, 0, 0, 0.94) 0 15%,
            transparent 32%
          ),
          radial-gradient(
            circle at 44% 60%,
            rgba(0, 0, 0, 0.9) 0 16%,
            transparent 34%
          ),
          radial-gradient(
            circle at 61% 60%,
            rgba(0, 0, 0, 0.86) 0 13%,
            transparent 29%
          );
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        overflow: visible;
      }

      .portal-badge-colour-reveal-mask--secondary {
        inset: -26%;
        opacity: 0.92;
        -webkit-mask-image:
          radial-gradient(
            circle at 50% 50%,
            rgba(0, 0, 0, 1) 0 12%,
            transparent 28%
          ),
          radial-gradient(
            circle at 50% 36%,
            rgba(0, 0, 0, 0.82) 0 14%,
            transparent 30%
          ),
          radial-gradient(
            circle at 37% 52%,
            rgba(0, 0, 0, 0.74) 0 13%,
            transparent 29%
          ),
          radial-gradient(
            circle at 64% 53%,
            rgba(0, 0, 0, 0.72) 0 12%,
            transparent 27%
          );
        mask-image:
          radial-gradient(
            circle at 50% 50%,
            rgba(0, 0, 0, 1) 0 12%,
            transparent 28%
          ),
          radial-gradient(
            circle at 50% 36%,
            rgba(0, 0, 0, 0.82) 0 14%,
            transparent 30%
          ),
          radial-gradient(
            circle at 37% 52%,
            rgba(0, 0, 0, 0.74) 0 13%,
            transparent 29%
          ),
          radial-gradient(
            circle at 64% 53%,
            rgba(0, 0, 0, 0.72) 0 12%,
            transparent 27%
          );
      }

      .portal-badge-colour-reveal-mask-core,
      .portal-badge-colour-reveal-mask-blob {
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 50%;
        background: #000;
      }

      .portal-badge-colour-reveal-mask-core {
        width: 42%;
        height: 42%;
        transform: translate(-50%, -50%);
      }

      .portal-badge-colour-reveal-mask-blob {
        opacity: 1;
      }

      .portal-badge-colour-reveal-mask-blob--a {
        width: 38%;
        height: 38%;
        animation: portalBadgeColourRevealBlobA 1040ms
          cubic-bezier(0.18, 0.92, 0.24, 1) both;
      }

      .portal-badge-colour-reveal-mask-blob--b {
        width: 34%;
        height: 34%;
        animation: portalBadgeColourRevealBlobB 980ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 40ms both;
      }

      .portal-badge-colour-reveal-mask-blob--c {
        width: 33%;
        height: 33%;
        animation: portalBadgeColourRevealBlobC 1100ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 80ms both;
      }

      .portal-badge-colour-reveal-mask-blob--d {
        width: 28%;
        height: 28%;
        animation: portalBadgeColourRevealBlobD 1060ms
          cubic-bezier(0.18, 0.92, 0.24, 1) 60ms both;
      }

      .portal-badge-colour-reveal-mask-blob--e {
        width: 30%;
        height: 30%;
        animation: portalBadgeColourRevealBlobE 1180ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 180ms both;
      }

      .portal-badge-colour-reveal-mask-blob--f {
        width: 26%;
        height: 26%;
        animation: portalBadgeColourRevealBlobF 1140ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 220ms both;
      }

      .portal-badge-colour-reveal-mask-blob--g {
        width: 26%;
        height: 26%;
        animation: portalBadgeColourRevealBlobG 1100ms
          cubic-bezier(0.16, 0.9, 0.22, 1) 240ms both;
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

      .portal-badge-final-shimmer {
        overflow: hidden;
      }

      .portal-badge-final-shimmer::before {
        content: "";
        position: absolute;
        inset: -24% -40%;
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0) 0%,
          rgba(255, 255, 255, 0.04) 30%,
          rgba(255, 255, 255, 0.9) 48%,
          rgba(255, 255, 255, 0.22) 56%,
          rgba(255, 255, 255, 0) 72%
        );
        filter: blur(8px);
        mix-blend-mode: screen;
        opacity: 0;
        transform: translateX(-125%) rotate(18deg);
        animation: portalBadgeFinalShimmer 5200ms linear infinite;
      }

      .portal-badge-final-shimmer--celebrating::before {
        animation: portalBadgeFinalShimmerCelebrating 2200ms
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
        .portal-badge-colour-reveal--primary,
        .portal-badge-colour-reveal--secondary,
        .portal-badge-colour-reveal-mask-blob--a,
        .portal-badge-colour-reveal-mask-blob--b,
        .portal-badge-colour-reveal-mask-blob--c,
        .portal-badge-colour-reveal-mask-blob--d,
        .portal-badge-colour-reveal-mask-blob--e,
        .portal-badge-colour-reveal-mask-blob--f,
        .portal-badge-colour-reveal-mask-blob--g,
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

        .portal-badge-colour-reveal {
          opacity: 1 !important;
        }

        .portal-badge-unlock-visual-inner {
          transition: none !important;
        }
      }
    `}</style>
  );
}
