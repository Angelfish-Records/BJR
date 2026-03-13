// web/app/home/modules/badges/useFlipGridAnimation.ts
"use client";

import React from "react";

type RegisterItemRef = (key: string) => (node: HTMLDivElement | null) => void;

type Options = {
  keys: string[];
  disabled?: boolean;
  durationMs?: number;
  easing?: string;
  layoutDependency?: string | number | boolean | null;
};

type RectMap = Map<string, DOMRect>;

type CleanupFn = () => void;

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

function resetNodeTransform(node: HTMLDivElement): void {
  node.style.transform = "";
  node.style.transition = "";
  node.style.willChange = "";
}

function rectIntersectsContainer(
  rect: DOMRect,
  containerRect: DOMRect,
  bleedPx: number,
): boolean {
  return !(
    rect.right < containerRect.left - bleedPx ||
    rect.left > containerRect.right + bleedPx ||
    rect.bottom < containerRect.top - bleedPx ||
    rect.top > containerRect.bottom + bleedPx
  );
}

function isReasonableDelta(
  deltaX: number,
  deltaY: number,
  previousRect: DOMRect,
  nextRect: DOMRect,
  containerRect: DOMRect | null,
): boolean {
  if (typeof window === "undefined") return true;

  const viewportX = window.innerWidth || 0;
  const viewportY = window.innerHeight || 0;

  const referenceWidth = Math.max(previousRect.width, nextRect.width);
  const referenceHeight = Math.max(previousRect.height, nextRect.height);

  const baseMaxDeltaX = Math.max(viewportX * 0.6, referenceWidth * 4, 180);
  const baseMaxDeltaY = Math.max(viewportY * 0.6, referenceHeight * 6, 220);

  const maxDeltaX = containerRect
    ? Math.max(baseMaxDeltaX, containerRect.width * 1.1)
    : baseMaxDeltaX;

  const maxDeltaY = containerRect
    ? Math.max(baseMaxDeltaY, containerRect.height * 1.1)
    : baseMaxDeltaY;

  if (Math.abs(deltaX) > maxDeltaX || Math.abs(deltaY) > maxDeltaY) {
    return false;
  }

  if (!containerRect) {
    return true;
  }

  const bleedPx = 40;

  return (
    rectIntersectsContainer(previousRect, containerRect, bleedPx) &&
    rectIntersectsContainer(nextRect, containerRect, bleedPx)
  );
}

export function useFlipGridAnimation(options: Options): {
  registerItemRef: RegisterItemRef;
} {
  const {
    keys,
    disabled = false,
    durationMs = 320,
    easing = "cubic-bezier(0.22, 1, 0.36, 1)",
    layoutDependency = null,
  } = options;

  const nodeByKeyRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const previousRectsRef = React.useRef<RectMap>(new Map());
  const cleanupByKeyRef = React.useRef<Map<string, CleanupFn>>(new Map());
  const rafIdRef = React.useRef<number | null>(null);
  const settleRafIdRef = React.useRef<number | null>(null);
  const hasMeasuredInitialLayoutRef = React.useRef(false);

  const registerItemRef = React.useCallback<RegisterItemRef>(
    (key: string) => (node: HTMLDivElement | null) => {
      const nodeByKey = nodeByKeyRef.current;
      const cleanupByKey = cleanupByKeyRef.current;
      const existingNode = nodeByKey.get(key);

      if (existingNode && existingNode !== node) {
        const cleanup = cleanupByKey.get(key);
        if (cleanup) {
          cleanup();
          cleanupByKey.delete(key);
        }
      }

      if (node) {
        nodeByKey.set(key, node);
        return;
      }

      nodeByKey.delete(key);

      const cleanup = cleanupByKey.get(key);
      if (cleanup) {
        cleanup();
        cleanupByKey.delete(key);
      }
    },
    [],
  );

  React.useEffect(() => {
    const cleanupByKey = cleanupByKeyRef.current;

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }

      if (settleRafIdRef.current !== null) {
        window.cancelAnimationFrame(settleRafIdRef.current);
        settleRafIdRef.current = null;
      }

      for (const cleanup of cleanupByKey.values()) {
        cleanup();
      }

      cleanupByKey.clear();
    };
  }, []);

  React.useLayoutEffect(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (settleRafIdRef.current !== null) {
      window.cancelAnimationFrame(settleRafIdRef.current);
      settleRafIdRef.current = null;
    }

    for (const cleanup of cleanupByKeyRef.current.values()) {
      cleanup();
    }
    cleanupByKeyRef.current.clear();

    for (const key of keys) {
      const node = nodeByKeyRef.current.get(key);
      if (!node) continue;
      resetNodeTransform(node);
    }

    const nextRects = snapshotRects(keys, nodeByKeyRef.current);

    if (!hasMeasuredInitialLayoutRef.current) {
      hasMeasuredInitialLayoutRef.current = true;
      previousRectsRef.current = nextRects;
      return;
    }

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
      const containerRect = node.parentElement
        ? node.parentElement.getBoundingClientRect()
        : null;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

      if (
        !isReasonableDelta(
          deltaX,
          deltaY,
          previousRect,
          nextRect,
          containerRect,
        )
      ) {
        continue;
      }

      animations.push({
        key,
        node,
        deltaX,
        deltaY,
      });
    }

    if (animations.length === 0) {
      previousRectsRef.current = nextRects;
      return;
    }

    for (const animation of animations) {
      const { key, node, deltaX, deltaY } = animation;

      node.style.transition = "none";
      node.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
      node.style.willChange = "transform";

      let timeoutId: number | null = null;

      const cleanup = () => {
        node.removeEventListener("transitionend", handleTransitionEnd);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        resetNodeTransform(node);
        cleanupByKeyRef.current.delete(key);
      };

      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target !== node) return;
        if (event.propertyName !== "transform") return;
        cleanup();
      };

      node.addEventListener("transitionend", handleTransitionEnd);

      timeoutId = window.setTimeout(() => {
        cleanup();
      }, durationMs + 120);

      cleanupByKeyRef.current.set(key, cleanup);
    }

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;

      settleRafIdRef.current = window.requestAnimationFrame(() => {
        settleRafIdRef.current = null;

        for (const animation of animations) {
          const { node } = animation;
          node.style.transition = `transform ${durationMs}ms ${easing}`;
          node.style.transform = "translate3d(0px, 0px, 0)";
        }
      });
    });

    previousRectsRef.current = nextRects;
  }, [keys, disabled, durationMs, easing, layoutDependency]);

  return { registerItemRef };
}
