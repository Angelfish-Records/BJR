// web/app/home/modules/badges/useFlipGridAnimation.ts
"use client";

import React from "react";

type RegisterItemRef = (key: string) => (node: HTMLDivElement | null) => void;

type Options = {
  keys: string[];
  disabled?: boolean;
  durationMs?: number;
  easing?: string;
};

type RectMap = Map<string, DOMRect>;

function snapshotRects(
  keys: string[],
  nodeByKey: Map<string, HTMLDivElement>,
): RectMap {
  const rects: RectMap = new Map();

  for (const key of keys) {
    const node = nodeByKey.get(key);
    if (!node) continue;
    rects.set(key, node.getBoundingClientRect());
  }

  return rects;
}

export function useFlipGridAnimation(options: Options): {
  registerItemRef: RegisterItemRef;
} {
  const {
    keys,
    disabled = false,
    durationMs = 320,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)",
  } = options;

  const nodeByKeyRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const previousRectsRef = React.useRef<RectMap>(new Map());
  const cleanupByKeyRef = React.useRef<Map<string, () => void>>(new Map());
  const rafIdRef = React.useRef<number | null>(null);

  const registerItemRef = React.useCallback<RegisterItemRef>(
    (key: string) => (node: HTMLDivElement | null) => {
      const map = nodeByKeyRef.current;

      if (node) {
        map.set(key, node);
        return;
      }

      map.delete(key);

      const cleanup = cleanupByKeyRef.current.get(key);
      if (cleanup) {
        cleanup();
        cleanupByKeyRef.current.delete(key);
      }
    },
    [],
  );

  React.useEffect(() => {
    const cleanupByKey = cleanupByKeyRef.current;

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }

      for (const cleanup of cleanupByKey.values()) {
        cleanup();
      }

      cleanupByKey.clear();
    };
  }, []);

  React.useLayoutEffect(() => {
    const nextRects = snapshotRects(keys, nodeByKeyRef.current);

    if (disabled) {
      previousRectsRef.current = nextRects;
      return;
    }

    const animations: Array<{
      key: string;
      node: HTMLDivElement;
      deltaX: number;
      deltaY: number;
    }> = [];

    for (const key of keys) {
      const node = nodeByKeyRef.current.get(key);
      const previousRect = previousRectsRef.current.get(key);
      const nextRect = nextRects.get(key);

      if (!node || !previousRect || !nextRect) continue;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

      animations.push({
        key,
        node,
        deltaX,
        deltaY,
      });
    }

    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    for (const cleanup of cleanupByKeyRef.current.values()) {
      cleanup();
    }
    cleanupByKeyRef.current.clear();

    for (const animation of animations) {
      const { key, node, deltaX, deltaY } = animation;

      node.style.transition = "none";
      node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      node.style.willChange = "transform";

      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== node) return;
        if (event.propertyName !== "transform") return;
        cleanup();
      };

      const cleanup = () => {
        node.removeEventListener("transitionend", handleTransitionEnd);
        node.style.transform = "";
        node.style.transition = "";
        node.style.willChange = "";
        cleanupByKeyRef.current.delete(key);
      };

      node.addEventListener("transitionend", handleTransitionEnd);
      cleanupByKeyRef.current.set(key, cleanup);
    }

    if (animations.length > 0) {
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;

        for (const animation of animations) {
          const { node } = animation;
          node.style.transition = `transform ${durationMs}ms ${easing}`;
          node.style.transform = "translate(0px, 0px)";
        }
      });
    }

    previousRectsRef.current = nextRects;
  }, [keys, disabled, durationMs, easing]);

  return { registerItemRef };
}
