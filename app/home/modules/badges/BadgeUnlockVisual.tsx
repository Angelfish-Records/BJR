// web/app/home/modules/badges/BadgeUnlockVisual.tsx
"use client";

import React from "react";
import BuildRevealMaskCanvas from "./BuildRevealMaskCanvas";

type Props = {
  imageUrl: string | null;
  label: string;
  unlocked: boolean;
  isUnlocking: boolean;
  isNewlyUnlocked: boolean;
  variant: "cabinet" | "overlay";
};

const REVEAL_DELAY_MS = 1080;
const REVEAL_DURATION_MS = 920;

function BadgeFallbackArt(props: { unlocked: boolean; label: string }) {
  const { unlocked, label } = props;

  return (
    <div
      aria-label={label}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        fontSize: 16,
        opacity: unlocked ? 0.82 : 0.34,
        filter: unlocked
          ? "drop-shadow(0 0 6px rgba(255,255,255,0.10))"
          : "grayscale(1) saturate(0) brightness(0.8)",
      }}
    >
      ✦
    </div>
  );
}

function BadgeArtImage(props: {
  imageUrl: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { imageUrl, alt, className, style } = props;

  return (
    <img
      src={imageUrl}
      alt={alt}
      draggable="false"
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        userSelect: "none",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

export default function BadgeUnlockVisual(props: Props) {
  const { imageUrl, label, unlocked, isUnlocking, isNewlyUnlocked, variant } =
    props;

  const showUnlockedAtmosphere = unlocked;
  const showUnlockEvent = isUnlocking || isNewlyUnlocked;

  return (
    <div
      className={`portal-badge-unlock-visual-inner portal-badge-unlock-visual-inner--${variant}`}
      data-badge-variant={variant}
      data-badge-unlocking={isUnlocking ? "true" : "false"}
      data-badge-newly-unlocked={isNewlyUnlocked ? "true" : "false"}
      aria-hidden="true"
    >
      <div
        className={unlocked ? undefined : "portal-badge-core--locked"}
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        {showUnlockedAtmosphere ? (
          <>
            <div
              className="portal-badge-idle-glow"
              style={{
                position: "absolute",
                inset: -6,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.05) 32%, rgba(255,255,255,0.00) 74%)",
                filter: "blur(5px)",
                pointerEvents: "none",
                transition: "opacity 180ms ease, transform 180ms ease",
              }}
            />

            <div
              className="portal-badge-inner-aura"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: "58%",
                height: "58%",
                transform: "translate(-50%, -50%)",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) 46%, rgba(255,255,255,0) 76%)",
                filter: "blur(5px)",
                pointerEvents: "none",
              }}
            />

            <div
              className="portal-badge-embers"
              style={{
                position: "absolute",
                left: "50%",
                bottom: "-5%",
                width: "74%",
                height: "94%",
                transform: "translateX(-50%)",
                overflow: "visible",
                pointerEvents: "none",
              }}
            >
              <div
                className="portal-badge-spark-a"
                style={{
                  position: "absolute",
                  left: "14%",
                  bottom: "5%",
                  width: "6.2%",
                  height: "6.2%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.82)",
                  boxShadow: "0 0 10px rgba(255,255,255,0.18)",
                }}
              />

              <div
                className="portal-badge-spark-b"
                style={{
                  position: "absolute",
                  left: "44%",
                  bottom: "1%",
                  width: "4.8%",
                  height: "4.8%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.76)",
                  boxShadow: "0 0 8px rgba(255,255,255,0.16)",
                }}
              />

              <div
                className="portal-badge-spark-c"
                style={{
                  position: "absolute",
                  left: "72%",
                  bottom: "6%",
                  width: "4.6%",
                  height: "4.6%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.72)",
                  boxShadow: "0 0 7px rgba(255,255,255,0.14)",
                }}
              />

              <div
                className="portal-badge-burst-a"
                style={{
                  position: "absolute",
                  left: "28%",
                  bottom: "2%",
                  width: "3.9%",
                  height: "3.9%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.88)",
                  boxShadow: "0 0 10px rgba(255,255,255,0.24)",
                }}
              />

              <div
                className="portal-badge-burst-b"
                style={{
                  position: "absolute",
                  left: "55%",
                  bottom: "4%",
                  width: "3.9%",
                  height: "3.9%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.82)",
                  boxShadow: "0 0 8px rgba(255,255,255,0.2)",
                }}
              />

              <div
                className="portal-badge-burst-c"
                style={{
                  position: "absolute",
                  left: "80%",
                  bottom: "2%",
                  width: "2.9%",
                  height: "2.9%",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.78)",
                  boxShadow: "0 0 7px rgba(255,255,255,0.18)",
                }}
              />
            </div>
          </>
        ) : null}

        <div
          className={`portal-badge-spin-stage-1${
            isUnlocking ? " portal-badge-spin-stage-1--unlocking" : ""
          }`}
          style={{
            position: "absolute",
            inset: 0,
          }}
        >
          <div
            className={`portal-badge-spin-stage-2${
              isUnlocking ? " portal-badge-spin-stage-2--unlocking" : ""
            }`}
            style={{
              position: "absolute",
              inset: 0,
            }}
          >
            <div
              className={`portal-badge-spin-stage-3${
                isUnlocking ? " portal-badge-spin-stage-3--unlocking" : ""
              }`}
              style={{
                position: "absolute",
                inset: 0,
              }}
            >
              <div
                className={`portal-badge-art-shell${
                  isUnlocking ? " portal-badge-art-shell--unlocking" : ""
                }`}
                style={{
                  position: "absolute",
                  inset: 0,
                }}
              >
                {imageUrl ? (
                  <>
                    {!unlocked || isUnlocking ? (
                      <BadgeArtImage
                        imageUrl={imageUrl}
                        alt=""
                        className="portal-badge-art-base-greyscale"
                        style={{
                          opacity: isUnlocking ? 0.42 : 0.32,
                          filter:
                            "grayscale(1) saturate(0) brightness(0.96) contrast(0.94) blur(1.4px)",
                          transform: "scale(1.02)",
                        }}
                      />
                    ) : null}

                    {isUnlocking ? (
                      <>
                        <BuildRevealMaskCanvas
                          imageUrl={imageUrl}
                          label={label}
                          isActive={true}
                          revealDelayMs={REVEAL_DELAY_MS}
                          revealDurationMs={REVEAL_DURATION_MS}
                          className="portal-badge-reveal-canvas-layer portal-badge-reveal-canvas-layer--unlocking"
                        />

                        <div
                          className="portal-badge-unlock-energy-flare"
                          style={{
                            position: "absolute",
                            inset: "-8%",
                            borderRadius: "50%",
                            pointerEvents: "none",
                          }}
                        />
                      </>
                    ) : null}

                    {!isUnlocking ? (
                      <div
                        className="portal-badge-final-art-shell"
                        style={{
                          position: "absolute",
                          inset: 0,
                        }}
                      >
                        <BadgeArtImage
                          imageUrl={imageUrl}
                          alt={label}
                          className="portal-badge-final-art-image"
                          style={{
                            filter: unlocked
                              ? "drop-shadow(0 0 6px rgba(255,255,255,0.1))"
                              : "grayscale(1) saturate(0) brightness(0.60) contrast(0.85) blur(0.2px)",
                            opacity: unlocked ? 1 : 0.35,
                          }}
                        />

                        {isNewlyUnlocked ? (
                          <div
                            className="portal-badge-final-shimmer portal-badge-final-shimmer--celebrating"
                            style={{
                              position: "absolute",
                              inset: 0,
                              pointerEvents: "none",
                              WebkitMaskImage: `url(${imageUrl})`,
                              maskImage: `url(${imageUrl})`,
                              WebkitMaskRepeat: "no-repeat",
                              maskRepeat: "no-repeat",
                              WebkitMaskPosition: "center",
                              maskPosition: "center",
                              WebkitMaskSize: "contain",
                              maskSize: "contain",
                            }}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <BadgeFallbackArt unlocked={unlocked} label={label} />
                )}

                {unlocked ? (
                  <div
                    className="portal-badge-centre-radiance"
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: "50%",
                      height: "50%",
                      transform: "translate(-50%, -50%)",
                      borderRadius: "50%",
                      background:
                        "radial-gradient(circle, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.045) 42%, rgba(255,255,255,0.00) 76%)",
                      filter: "blur(4px)",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {showUnlockEvent ? (
          <>
            <div
              className="portal-badge-unlock-ring-a"
              style={{
                position: "absolute",
                inset: "-10%",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.34)",
                pointerEvents: "none",
              }}
            />

            <div
              className="portal-badge-unlock-ring-b"
              style={{
                position: "absolute",
                inset: "-10%",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.22)",
                pointerEvents: "none",
              }}
            />

            <div
              className="portal-badge-impact-flash"
              style={{
                position: "absolute",
                inset: "-6%",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />

            <div
              className="portal-badge-impact-particles"
              style={{
                position: "absolute",
                inset: "-12%",
                pointerEvents: "none",
              }}
            >
              <div className="portal-badge-impact-particle portal-badge-impact-particle--a" />
              <div className="portal-badge-impact-particle portal-badge-impact-particle--b" />
              <div className="portal-badge-impact-particle portal-badge-impact-particle--c" />
              <div className="portal-badge-impact-particle portal-badge-impact-particle--d" />
              <div className="portal-badge-impact-particle portal-badge-impact-particle--e" />
              <div className="portal-badge-impact-particle portal-badge-impact-particle--f" />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
