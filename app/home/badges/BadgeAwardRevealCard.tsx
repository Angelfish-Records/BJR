"use client";

import Image from "next/image";
import React from "react";
import type { BadgeAwardNotice } from "./badgeAwardTypes";

type Props = {
  badge: BadgeAwardNotice;
  dismissHintVisible: boolean;
};

export default function BadgeAwardRevealCard(props: Props) {
  const { badge, dismissHintVisible } = props;

  return (
    <>
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

        @keyframes badgeAwardOverlayHaloPulse {
          0%,
          100% {
            opacity: 0.28;
            transform: scale(0.98);
          }
          50% {
            opacity: 0.52;
            transform: scale(1.04);
          }
        }

        @keyframes badgeAwardOverlayRingA {
          0% {
            opacity: 0;
            transform: scale(0.72);
          }
          16% {
            opacity: 0.78;
          }
          100% {
            opacity: 0;
            transform: scale(1.18);
          }
        }

        @keyframes badgeAwardOverlayRingB {
          0% {
            opacity: 0;
            transform: scale(0.82);
          }
          18% {
            opacity: 0.56;
          }
          100% {
            opacity: 0;
            transform: scale(1.28);
          }
        }

        @keyframes badgeAwardOverlayArtFloat {
          0%,
          100% {
            transform: translateY(0px) scale(1);
          }
          50% {
            transform: translateY(-3px) scale(1.015);
          }
        }

        @keyframes badgeAwardOverlayGhostFade {
          0% {
            opacity: 0.46;
            transform: scale(1.04);
          }
          100% {
            opacity: 0;
            transform: scale(1.08);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .badge-award-overlay-card,
          .badge-award-overlay-halo,
          .badge-award-overlay-ring-a,
          .badge-award-overlay-ring-b,
          .badge-award-overlay-art,
          .badge-award-overlay-art-ghost {
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
          animation: "badgeAwardOverlayCardIn 340ms cubic-bezier(0.22, 1, 0.36, 1) both",
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
            className="badge-award-overlay-halo"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -18,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 36%, rgba(255,255,255,0.00) 72%)",
              filter: "blur(8px)",
              animation: "badgeAwardOverlayHaloPulse 2200ms ease-in-out infinite",
            }}
          />

          <div
            className="badge-award-overlay-ring-a"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -12,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.30)",
              animation: "badgeAwardOverlayRingA 900ms cubic-bezier(0.22, 1, 0.36, 1) both",
            }}
          />

          <div
            className="badge-award-overlay-ring-b"
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: -12,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              animation:
                "badgeAwardOverlayRingB 1100ms cubic-bezier(0.22, 1, 0.36, 1) 120ms both",
            }}
          />

          {/*
            ======================================================================
            PLACEHOLDER ANIMATION BLOCK — INTENTIONAL TEMPORARY REVEAL HOST
            ======================================================================

            This inner art stack is deliberately a temporary stand-in.

            It should later be replaced by a shared, intelligent badge-unlock
            animation primitive extracted from the BadgeCabinet system once that
            motion language is finalised. The future replacement should own:
              - the grayscale-to-colour reveal
              - the unlock spin / transform choreography
              - unlock rings / embers / glow language
              - any FLIP-aware or cabinet-aware transition semantics

            The long-term target is:
              BadgeCabinetItem and this overlay both render the SAME underlying
              unlock visual primitive, with only context-specific wrappers around it.

            Until then, this block provides a tasteful but intentionally simple
            ceremonial reveal so the announcement system can ship now without
            hard-coding the final motion architecture in the wrong place.
            ======================================================================
          */}
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
            }}
          >
            {badge.imageUrl ? (
              <>
                <div
                  className="badge-award-overlay-art-ghost"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    animation:
                      "badgeAwardOverlayGhostFade 720ms cubic-bezier(0.22, 1, 0.36, 1) both",
                  }}
                >
                  <Image
                    src={badge.imageUrl}
                    alt=""
                    fill
                    sizes="176px"
                    style={{
                      objectFit: "contain",
                      display: "block",
                      opacity: 0.38,
                      filter:
                        "grayscale(1) saturate(0) brightness(0.96) blur(2px)",
                      transform: "scale(1.04)",
                      pointerEvents: "none",
                    }}
                  />
                </div>

                <div
                  className="badge-award-overlay-art"
                  style={{
                    position: "absolute",
                    inset: 0,
                    animation: "badgeAwardOverlayArtFloat 2600ms ease-in-out infinite",
                  }}
                >
                  <Image
                    src={badge.imageUrl}
                    alt={badge.title}
                    fill
                    sizes="176px"
                    style={{
                      objectFit: "contain",
                      display: "block",
                      filter: "drop-shadow(0 0 8px rgba(255,255,255,0.12))",
                      pointerEvents: "none",
                    }}
                  />
                </div>
              </>
            ) : (
              <div
                aria-hidden="true"
                className="badge-award-overlay-art"
                style={{
                  fontSize: 48,
                  opacity: 0.88,
                  animation: "badgeAwardOverlayArtFloat 2600ms ease-in-out infinite",
                }}
              >
                ✦
              </div>
            )}
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