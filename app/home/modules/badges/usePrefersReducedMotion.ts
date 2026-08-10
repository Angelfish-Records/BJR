// web/app/home/modules/badges/usePrefersReducedMotion.ts
"use client";

import React from "react";

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    update();

    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return prefersReducedMotion;
}