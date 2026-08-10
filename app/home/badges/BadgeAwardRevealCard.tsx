// web/app/home/badges/BadgeAwardRevealCard.tsx
"use client";

import React from "react";
import BadgeUnlockVisual from "../modules/badges/BadgeUnlockVisual";
import BadgeUnlockVisualStyles from "../modules/badges/BadgeUnlockVisualStyles";
import type { BadgeAwardNotice } from "./badgeAwardTypes";

type Props = Readonly<{
  badge: BadgeAwardNotice;
  dismissHintVisible: boolean;
}>;

export default function BadgeAwardRevealCard(props: Props) {
  const { badge, dismissHintVisible } = props;

  return (
    <>
      <BadgeUnlockVisualStyles />

      <style jsx global>{`
        @keyframes badgeAwardOverlayCardIn {
          0% {
            opacity: 0;
            transform: translateY(18px) scale(0.94);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .badge-award-overlay-card {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="badge-award-overlay-card"
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(10,10,14,0.90)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          boxShadow: `
            0 28px 80px rgba(0,0,0,0.56),
            0 0 0 1px rgba(255,255,255,0.04),
            0 60px 160px rgba(0,0,0,0.74)
          `,
          padding: 22,
          display: "grid",
          gap: 18,
          justifyItems: "center",
          animation:
            "badgeAwardOverlayCardIn 340ms cubic-bezier(0.22, 1, 0.36, 1) both",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: 0.36,
            textTransform: "uppercase",
            lineHeight: 1.2,
            opacity: 0.58,
          }}
        >
          Badge unlocked
        </div>

        <div
          className="portal-badge-unlock-host"
          data-badge-expanded="true"
          style={{
            position: "relative",
            width: 176,
            height: 176,
            display: "grid",
            placeItems: "center",
            overflow: "visible",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -18,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 34%, rgba(255,255,255,0.00) 72%)",
              filter: "blur(10px)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              outline: "none",
              perspective: "900px",
              perspectiveOrigin: "50% 50%",
            }}
          >
            <BadgeUnlockVisual
              imageUrl={badge.imageUrl ?? null}
              label={badge.title}
              unlocked={true}
              isUnlocking={true}
              isNewlyUnlocked={true}
              variant="overlay"
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 22,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: -0.01,
            }}
          >
            {badge.title}
          </div>

          {badge.description ? (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                opacity: 0.72,
                maxWidth: 320,
                justifySelf: "center",
              }}
            >
              {badge.description}
            </div>
          ) : null}
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: 1.35,
            opacity: dismissHintVisible ? 0.56 : 0,
            transition: "opacity 180ms ease",
          }}
        >
          Click anywhere to continue
        </div>
      </div>
    </>
  );
}