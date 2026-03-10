"use client";

import React from "react";
import Image from "next/image";
import type { Tier } from "@/lib/types";
import ActivationGate from "@/app/home/ActivationGate";
import { getLastPortalTab } from "./portalLastTab";

type BannerTone = "success" | "neutral" | "warn";

function IconPlayer() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="afIcon afIconPlayer"
    >
      <path d="M10 7.6L18.2 12L10 16.4V7.6Z" fill="currentColor" />
    </svg>
  );
}

function IconPortal() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="afIcon afIconPortal"
    >
      <path
        d="M12 4.3L4.35 8.05L12 11.8L19.65 8.05L12 4.3Z"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="afPortalTop"
      />
      <path
        d="M4.35 11.05L12 14.75L19.65 11.05"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FullWidthBanner(props: {
  kind: "gift" | "checkout" | null;
  code: string | null;
  onDismiss: () => void;
}) {
  const { kind, code, onDismiss } = props;
  if (!kind || !code) return null;

  let tone: BannerTone = "neutral";
  let text: React.ReactNode = null;

  if (kind === "checkout") {
    if (code === "success") {
      tone = "success";
      text = (
        <>
          Your account has been updated. Thank you for supporting future work on
          this independent platform.
        </>
      );
    } else if (code === "cancel") {
      tone = "neutral";
      text = <>Checkout cancelled.</>;
    } else {
      return null;
    }
  }

  if (kind === "gift") {
    if (code === "ready") {
      tone = "success";
      text = <>Gift activated. Your content is now available.</>;
    } else if (code === "not_paid") {
      tone = "neutral";
      text = (
        <>
          This gift hasn&apos;t completed payment yet. If you just paid, refresh
          in a moment.
        </>
      );
    } else if (code === "wrong_account") {
      tone = "warn";
      text = (
        <>
          This gift was sent to a different email. Sign in with the recipient
          account.
        </>
      );
    } else if (code === "claim_code_missing") {
      tone = "warn";
      text = (
        <>
          That link is missing its claim code. Open the exact link from the
          email.
        </>
      );
    } else if (code === "invalid_claim") {
      tone = "warn";
      text = (
        <>
          That claim code doesn&apos;t match this gift. Open the exact link from
          the email.
        </>
      );
    } else if (code === "missing") {
      tone = "warn";
      text = <>That gift link looks invalid.</>;
    } else {
      return null;
    }
  }

  const toneClasses =
    tone === "success"
      ? "border-emerald-400/30 bg-white/5"
      : tone === "warn"
        ? "border-amber-400/30 bg-white/5"
        : "border-white/10 bg-white/5";

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "mt-3 w-full rounded-xl border p-4 shadow-[0_18px_44px_rgba(0,0,0,0.22)]",
        "text-sm leading-relaxed text-white/85",
        "relative",
        toneClasses,
      ].join(" ")}
    >
      <div className="pr-10">{text}</div>

      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className={[
          "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full",
          "border border-white/10 bg-white/5 text-white/70",
          "hover:bg-white/10 hover:text-white/85",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        ].join(" ")}
      >
        ×
      </button>
    </div>
  );
}

export type SessionChromeProps = {
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  effectiveIsPlayer: boolean;
  portalTabId: string | null;
  spotlightAttention: boolean;
  attentionMessage: string | null;
  canManageBilling: boolean;
  tier: Tier;
  bannerKind: "gift" | "checkout" | null;
  bannerCode: string | null;
  onDismissBanner: () => void;
  onPrefetchPlayer: () => void;
  onPrefetchPortal: () => void;
  onOpenPlayer: () => void;
  onOpenPortal: (tabId: string) => void;
};

export default function SessionChrome(props: SessionChromeProps) {
  const {
    topLogoUrl,
    topLogoHeight,
    effectiveIsPlayer,
    portalTabId,
    spotlightAttention,
    attentionMessage,
    canManageBilling,
    tier,
    bannerKind,
    bannerCode,
    onDismissBanner,
    onPrefetchPlayer,
    onPrefetchPortal,
    onOpenPlayer,
    onOpenPortal,
  } = props;

  const gateNodeTopRight = (
    <ActivationGate
      attentionMessage={attentionMessage}
      canManageBilling={canManageBilling}
      tier={tier}
    >
      <div />
    </ActivationGate>
  );

  const bannerNode =
    bannerKind && bannerCode ? (
      <FullWidthBanner
        kind={bannerKind}
        code={bannerCode}
        onDismiss={onDismissBanner}
      />
    ) : null;

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 0,
        border: "none",
        background: "transparent",
        padding: "12px 0 0",
        minWidth: 0,
        position: "relative",
      }}
    >
      <style>{`
.afTopBar { display:grid; grid-template-columns:1fr auto 1fr; grid-template-rows:1fr; align-items:stretch; gap:12px; min-width:0; }
.afTopBarControls { display: contents; }
.afTopBarLeft { grid-column:1; grid-row:1; min-width:0; display:flex; align-items:flex-end; justify-content:flex-start; gap:10px; align-self:stretch; }
.afTopBarLogo { grid-column:2; grid-row:1; min-width:0; display:flex; align-items:flex-end; justify-content:center; padding:6px 0 2px; align-self:stretch; }
.afTopBarLogoInner { width:fit-content; display:grid; place-items:end center; }
.afTopBarRight { grid-column:3; grid-row:1; min-width:0; display:flex; align-items:center; justify-content:flex-end; align-self:stretch; }
.afTopBarRightInner { max-width:520px; min-width:0; height:100%; display:flex; flex-direction:column; justify-content:center; }

@keyframes afLogoVeilDrift {
  0%, 100% {
    background-position: 0% 50%;
    opacity: 0.26;
    transform: translateX(-2%) translateY(-0.6%);
  }
  55% {
    background-position: 100% 50%;
    opacity: 0.84;
    transform: translateX(2%) translateY(0.6%);
  }
}

@keyframes afLogoVeilDriftSlow {
  0%, 100% {
    background-position: 100% 50%;
    opacity: 0.18;
    transform: translateX(2%) translateY(0.35%);
  }
  55% {
    background-position: 0% 50%;
    opacity: 0.46;
    transform: translateX(-2%) translateY(-0.35%);
  }
}

.afLogoVeilWrap {
  position: relative;
  display: inline-block;
  line-height: 0;
  isolation: isolate;
  overflow: hidden;
}

.afLogoGlisten {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
  -webkit-mask-image: var(--afLogoMaskUrl);
  mask-image: var(--afLogoMaskUrl);
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
  mix-blend-mode: screen;
  opacity: 0;
  animation: afLogoGlistenOpacity 62s ease-in-out infinite;
  will-change: opacity;
}

.afLogoGlisten::before {
  content: "";
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background-image:
    linear-gradient(
      120deg,
      rgba(255,255,255,0.00) 0%,
      rgba(255,255,255,0.00) 16%,
      rgba(255,255,255,0.07) 46%,
      rgba(255,255,255,0.00) 76%,
      rgba(255,255,255,0.00) 100%
    ),
    linear-gradient(
      120deg,
      rgba(255,255,255,0.00) 0%,
      rgba(255,255,255,0.00) 36%,
      rgba(255,255,255,0.24) 50%,
      rgba(255,255,255,0.00) 64%,
      rgba(255,255,255,0.00) 100%
    );
  background-repeat: no-repeat;
  background-size: 420% 420%, 420% 420%;
  background-position: -260% -260%, -260% -260%;
  filter: blur(1.1px);
  transform: rotate(-10deg) skewX(-10deg) scaleY(1.06);
  border-radius: 999px;
  animation: afLogoGlistenTravel 62s ease-in-out infinite;
  will-change: background-position, transform;
}

@keyframes afLogoGlistenOpacity {
  0%, 84% { opacity: 0; }
  86% { opacity: 0.14; }
  98% { opacity: 0.56; }
  99.5% { opacity: 0.08; }
  100% { opacity: 0; }
}

@keyframes afLogoGlistenTravel {
  0%, 84% {
    background-position: -260% -260%, -260% -260%;
  }
  81% {
    background-position: -160% -160%, -160% -160%;
  }
  99% {
    background-position: 260% 260%, 260% 260%;
  }
  99.5%, 100% {
    background-position: 340% 340%, 340% 340%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .afLogoGlisten,
  .afLogoGlisten::before {
    animation: none !important;
    opacity: 0 !important;
  }
}

.afLogoVeilImg {
  position: relative;
  z-index: 1;
  display: inline-block;
}

.afLogoVeil {
  position: absolute;
  inset: -34% -26%;
  pointer-events: none;
  z-index: 2;
  mix-blend-mode: multiply;
  background-image: linear-gradient(
    90deg,
    rgba(0,0,0,0.00) 0%,
    rgba(0,0,0,0.82) 22%,
    rgba(0,0,0,0.995) 48%,
    rgba(0,0,0,0.70) 68%,
    rgba(0,0,0,0.00) 100%
  );
  background-repeat: no-repeat;
  background-size: 220% 100%;
  background-position: 0% 50%;
  opacity: 0.24;
  filter: blur(1.15px);
  animation: afLogoVeilDrift 14.5s ease-in-out infinite;
  will-change: transform, opacity, background-position;
}

.afLogoVeil::before {
  content: "";
  position: absolute;
  inset: -10% -18%;
  pointer-events: none;
  background-image: linear-gradient(
    90deg,
    rgba(0,0,0,0.00) 0%,
    rgba(0,0,0,0.55) 30%,
    rgba(0,0,0,0.65) 52%,
    rgba(0,0,0,0.40) 72%,
    rgba(0,0,0,0.00) 100%
  );
  background-repeat: no-repeat;
  background-size: 240% 100%;
  background-position: 100% 50%;
  opacity: 0.28;
  filter: blur(2.2px);
  animation: afLogoVeilDriftSlow 21s ease-in-out infinite;
  will-change: transform, opacity, background-position;
}

.afLogoVeil::after {
  content: "";
  position: absolute;
  inset: -16% -16%;
  pointer-events: none;
  background-image:
    repeating-radial-gradient(circle at 12% 18%, rgba(255,255,255,0.09) 0 0.7px, rgba(255,255,255,0.00) 0.7px 2.2px),
    repeating-radial-gradient(circle at 74% 63%, rgba(255,255,255,0.06) 0 0.8px, rgba(255,255,255,0.00) 0.8px 2.6px);
  background-size: 140px 110px, 170px 140px;
  background-position: 0% 0%, 30% 10%;
  mix-blend-mode: soft-light;
  opacity: 0.10;
  filter: blur(0.35px);
  animation: afLogoVeilNoiseDrift 27s linear infinite;
  will-change: transform, opacity, background-position;
}

@keyframes afLogoVeilNoiseDrift {
  0%   { transform: translateX(0%) translateY(0%); background-position: 0% 0%, 30% 10%; opacity: 0.08; }
  50%  { transform: translateX(1.8%) translateY(-1.2%); background-position: 60% 40%, 10% 70%; opacity: 0.12; }
  100% { transform: translateX(0%) translateY(0%); background-position: 0% 0%, 30% 10%; opacity: 0.08; }
}

@media (prefers-reduced-motion: reduce) {
  .afLogoVeil { animation: none !important; opacity: 0.22; }
}

.afTopBarBtn { position: relative; transition: transform 160ms ease, opacity 160ms ease, filter 160ms ease, box-shadow 160ms ease; will-change: transform, filter; }
.afTopBarBtn::after { content:""; position:absolute; inset:0; border-radius:999px; pointer-events:none; background: radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10), rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.00) 65%); opacity:0; transition:opacity 160ms ease; }
.afTopBarBtn:hover::after { opacity:1; }
.afTopBarBtn:hover { transform: translateY(-1px); opacity:0.98; filter:brightness(1.06); }
.afTopBarBtn:active { transform: translateY(0px) scale(0.97); filter:brightness(0.97); }
.afIcon { transform: translateY(0px); transition: transform 160ms ease; will-change: transform; }
.afIconPortal { transform: translateY(3px); }
.afTopBarBtn:hover .afIconPlayer { transform: translate(0.8px, -0.2px) scale(1.03); }
.afPortalTop { transition: transform 180ms ease; transform-origin: 12px 8px; }
.afTopBarBtn:hover .afPortalTop { transform: translateY(-0.4px); }
.afTopBarBtn:hover .afIconPortal { transform: translateY(2px) scale(1.015); }
.afTopBarBtn:focus-visible { outline:none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent), 0 14px 30px rgba(0,0,0,0.22); }

@media (max-width:720px) {
  .afTopBar { grid-template-columns:1fr; grid-template-rows:auto auto; gap:10px; align-items:stretch; justify-items:stretch; }
  .afTopBarLogo { grid-row:1; grid-column:1 / -1; width:100%; padding:10px 0 0; display:flex; align-items:flex-end; justify-content:center; }
  .afTopBarControls { grid-row:2; display:grid; grid-template-columns:auto 1fr; align-items:stretch; column-gap:10px; row-gap:0px; width:100%; min-width:0; }
  .afTopBarLeft { grid-column:1; justify-self:start; display:flex; align-items:flex-end; align-self:stretch; }
  .afTopBarRight { grid-column:2; justify-self:end; width:100%; display:flex; align-items:center; justify-content:flex-end; align-self:stretch; }
  .afTopBarRightInner { margin-left:auto; max-width:520px; height:100%; display:flex; flex-direction:column; justify-content:center; }
}
      `}</style>

      <div className="afTopBar" style={{ position: "relative", zIndex: 5 }}>
        <div className="afTopBarLogo">
          <div className="afTopBarLogoInner">
            {topLogoUrl ? (
              <div
                className="afLogoVeilWrap"
                style={
                  {
                    ["--afLogoMaskUrl" as const]: `url(${topLogoUrl})`,
                  } as React.CSSProperties
                }
              >
                <div className="afLogoVeilImg">
                  <Image
                    src={topLogoUrl}
                    alt="Logo"
                    height={Math.max(16, Math.min(120, topLogoHeight ?? 38))}
                    width={Math.max(16, Math.min(120, topLogoHeight ?? 38))}
                    sizes="(max-width: 720px) 120px, 160px"
                    style={{
                      height: Math.max(16, Math.min(120, topLogoHeight ?? 38)),
                      width: "auto",
                      objectFit: "contain",
                      opacity: 0.94,
                      userSelect: "none",
                      filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.28))",
                    }}
                  />
                </div>
                <div aria-hidden="true" className="afLogoVeil" />
                <div aria-hidden="true" className="afLogoGlisten" />
              </div>
            ) : (
              <div
                aria-label="AF"
                title="AF"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.22)",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  opacity: 0.92,
                  userSelect: "none",
                }}
              >
                AF
              </div>
            )}
          </div>
        </div>

        <div className="afTopBarControls">
          <div className="afTopBarLeft">
            {(() => {
              const commonBtn: React.CSSProperties = {
                width: 46,
                height: 46,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                color: "rgba(255,255,255,0.90)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                userSelect: "none",
                WebkitTapHighlightColor: "transparent",
              };

              const desiredPortalTab =
                (getLastPortalTab() ?? portalTabId ?? "portal") || "portal";

              return (
                <>
                  <button
                    type="button"
                    aria-label="Player"
                    title="Player"
                    onMouseEnter={onPrefetchPlayer}
                    onFocus={onPrefetchPlayer}
                    onClick={onOpenPlayer}
                    className="afTopBarBtn"
                    style={{
                      ...commonBtn,
                      background: effectiveIsPlayer
                        ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                        : "rgba(255,255,255,0.04)",
                      boxShadow: effectiveIsPlayer
                        ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                        : "0 12px 26px rgba(0,0,0,0.18)",
                      opacity: effectiveIsPlayer ? 0.98 : 0.78,
                    }}
                  >
                    <IconPlayer />
                  </button>

                  <button
                    type="button"
                    aria-label="Portal"
                    title="Portal"
                    onMouseEnter={onPrefetchPortal}
                    onFocus={onPrefetchPortal}
                    onClick={() => onOpenPortal(desiredPortalTab)}
                    className="afTopBarBtn"
                    style={{
                      ...commonBtn,
                      background: !effectiveIsPlayer
                        ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))"
                        : "rgba(255,255,255,0.04)",
                      boxShadow: !effectiveIsPlayer
                        ? "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)"
                        : "0 12px 26px rgba(0,0,0,0.18)",
                      opacity: !effectiveIsPlayer ? 0.98 : 0.78,
                    }}
                  >
                    <IconPortal />
                  </button>
                </>
              );
            })()}
          </div>

          <div className="afTopBarRight">
            <div
              className="afTopBarRightInner"
              style={{ maxWidth: 520, minWidth: 0 }}
            >
              <div
                style={{
                  position: "relative",
                  visibility: spotlightAttention ? "hidden" : "visible",
                  pointerEvents: spotlightAttention ? "none" : "auto",
                }}
              >
                {gateNodeTopRight}
              </div>
            </div>
          </div>
        </div>
      </div>

      {bannerNode}
    </div>
  );
}
