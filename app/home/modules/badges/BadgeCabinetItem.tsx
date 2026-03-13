// web/app/home/modules/badges/BadgeCabinetItem.tsx
"use client";

import Image from "next/image";
import React from "react";
import type { BadgeCabinetItemModel } from "./badgeCabinetTypes";

type Props = {
  item: BadgeCabinetItemModel;
  expanded: boolean;
  isNewlyUnlocked: boolean;
  isUnlocking: boolean;
  itemRef?: React.Ref<HTMLDivElement>;
};

export default function BadgeCabinetItem(props: Props) {
  const { item, expanded, isNewlyUnlocked, isUnlocking, itemRef } = props;

  return (
    <div
      ref={itemRef}
      className="portal-member-badge-wrap portal-member-badge-shell"
      data-badge-key={item.key}
      data-badge-partition={item.partition}
      data-badge-newly-unlocked={isNewlyUnlocked ? "true" : "false"}
      style={{
        position: "relative",
        minWidth: 0,
      }}
    >
      <div
        tabIndex={0}
        title={item.titleText}
        aria-label={item.titleText}
        className="portal-member-badge-visual"
      >
        <div className="portal-member-badge-visual-inner">
          <div
            className={
              item.unlocked ? undefined : "portal-member-badge-core--locked"
            }
            style={{
              position: "absolute",
              inset: 0,
            }}
          >
            {item.unlocked ? (
              <>
                <div
                  aria-hidden="true"
                  className="portal-member-badge-idle-glow"
                  style={{
                    position: "absolute",
                    inset: -4,
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0.00) 72%)",
                    filter: "blur(4px)",
                    pointerEvents: "none",
                    transition: "opacity 180ms ease, transform 180ms ease",
                  }}
                />

                <div
                  aria-hidden="true"
                  className="portal-member-badge-embers"
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: "-4%",
                    width: "65%",
                    height: "80%",
                    transform: "translateX(-50%)",
                    overflow: "visible",
                  }}
                >
                  <div
                    className="portal-member-badge-spark-a"
                    style={{
                      position: "absolute",
                      left: "18%",
                      bottom: "4%",
                      width: "6%",
                      height: "6%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.82)",
                      boxShadow: "0 0 8px rgba(255,255,255,0.18)",
                    }}
                  />

                  <div
                    className="portal-member-badge-spark-b"
                    style={{
                      position: "absolute",
                      left: "49%",
                      bottom: "0%",
                      width: "4.5%",
                      height: "4.5%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.76)",
                      boxShadow: "0 0 7px rgba(255,255,255,0.16)",
                    }}
                  />

                  <div
                    className="portal-member-badge-spark-c"
                    style={{
                      position: "absolute",
                      left: "74%",
                      bottom: "6%",
                      width: "4.5%",
                      height: "4.5%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.72)",
                      boxShadow: "0 0 6px rgba(255,255,255,0.14)",
                    }}
                  />

                  <div
                    className="portal-member-badge-burst-a"
                    style={{
                      position: "absolute",
                      left: "31%",
                      bottom: "2%",
                      width: "3.8%",
                      height: "3.8%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.88)",
                      boxShadow: "0 0 10px rgba(255,255,255,0.22)",
                    }}
                  />

                  <div
                    className="portal-member-badge-burst-b"
                    style={{
                      position: "absolute",
                      left: "58%",
                      bottom: "4%",
                      width: "3.8%",
                      height: "3.8%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.82)",
                      boxShadow: "0 0 8px rgba(255,255,255,0.20)",
                    }}
                  />

                  <div
                    className="portal-member-badge-burst-c"
                    style={{
                      position: "absolute",
                      left: "81%",
                      bottom: "2%",
                      width: "2.8%",
                      height: "2.8%",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.78)",
                      boxShadow: "0 0 7px rgba(255,255,255,0.18)",
                    }}
                  />
                </div>
              </>
            ) : null}

            <div
              className={`portal-member-badge-art-spin${
                isUnlocking ? " portal-member-badge-art-spin--unlocking" : ""
              }`}
              style={{
                position: "absolute",
                inset: 0,
              }}
            >
              {item.imageUrl ? (
                <>
                  {!item.unlocked || isUnlocking ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes="(max-width: 420px) 22vw, (max-width: 640px) 16vw, 96px"
                      style={{
                        objectFit: "contain",
                        display: "block",
                        opacity: isUnlocking ? 0.42 : 0.28,
                        filter:
                          "grayscale(1) saturate(0) brightness(0.95) blur(2px)",
                        transform: "scale(1.04)",
                        pointerEvents: "none",
                      }}
                    />
                  ) : null}

                  {isUnlocking ? (
                    <div
                      aria-hidden="true"
                      className="portal-member-badge-colour-reveal"
                      style={{
                        position: "absolute",
                        inset: 0,
                        overflow: "hidden",
                      }}
                    >
                      <Image
                        src={item.imageUrl}
                        alt=""
                        aria-hidden="true"
                        fill
                        sizes="(max-width: 420px) 22vw, (max-width: 640px) 16vw, 96px"
                        style={{
                          objectFit: "contain",
                          display: "block",
                          filter: "drop-shadow(0 0 6px rgba(255,255,255,0.10))",
                          opacity: 1,
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  ) : null}

                  {!isUnlocking ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.label}
                      fill
                      sizes="(max-width: 420px) 22vw, (max-width: 640px) 16vw, 96px"
                      style={{
                        objectFit: "contain",
                        display: "block",
                        filter: item.unlocked
                          ? "drop-shadow(0 0 4px rgba(255,255,255,0.08))"
                          : "grayscale(1) saturate(0) brightness(0.60) contrast(0.85) blur(0.2px)",
                        opacity: item.unlocked ? 1 : 0.35,
                      }}
                    />
                  ) : null}
                </>
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 16,
                    opacity: item.unlocked ? 0.82 : 0.34,
                    filter: item.unlocked
                      ? "drop-shadow(0 0 6px rgba(255,255,255,0.10))"
                      : "grayscale(1) saturate(0) brightness(0.8)",
                  }}
                >
                  ✦
                </div>
              )}

              {item.unlocked ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "46%",
                    height: "46%",
                    transform: "translate(-50%, -50%)",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.035) 42%, rgba(255,255,255,0.00) 76%)",
                    filter: "blur(3px)",
                    pointerEvents: "none",
                  }}
                />
              ) : null}
            </div>

            {isNewlyUnlocked ? (
              <>
                <div
                  aria-hidden="true"
                  className="portal-member-badge-unlock-ring-a"
                  style={{
                    position: "absolute",
                    inset: "-8%",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.30)",
                    pointerEvents: "none",
                  }}
                />

                <div
                  aria-hidden="true"
                  className="portal-member-badge-unlock-ring-b"
                  style={{
                    position: "absolute",
                    inset: "-8%",
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.22)",
                    pointerEvents: "none",
                  }}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="portal-member-badge-meta" aria-hidden={!expanded}>
        <div className="portal-member-badge-meta-inner">
          <div
            style={{
              fontSize: expanded ? 13 : 12,
              lineHeight: 1.3,
              opacity: item.unlocked ? 0.92 : 0.7,
              overflowWrap: "anywhere",
            }}
          >
            {item.label}
          </div>

          {item.description ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.35,
                opacity: 0.58,
                overflowWrap: "anywhere",
              }}
            >
              {item.description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
