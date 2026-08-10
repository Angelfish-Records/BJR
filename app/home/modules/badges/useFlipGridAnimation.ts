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
  captureBaselineToken?: string | number | boolean | null;
};

type LayoutRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type RectMap = Map<string, LayoutRect>;

type CleanupFn = () => void;

function resetNodeTransform(node: HTMLDivElement): void {
  node.style.transform = "";
  node.style.transition = "";
  node.style.willChange = "";
}

function getRelativeRect(node: HTMLDivElement): LayoutRect {
  const nodeRect = node.getBoundingClientRect();
  const parent = node.parentElement;

  if (!parent) {
    return {
      left: nodeRect.left,
      top: nodeRect.top,
      width: nodeRect.width,
      height: nodeRect.height,
    };
  }

  const parentRect = parent.getBoundingClientRect();

  return {
    left: nodeRect.left - parentRect.left,
    top: nodeRect.top - parentRect.top,
    width: nodeRect.width,
    height: nodeRect.height,
  };
}

function snapshotRects(
  keys: string[],
  nodeByKey: Map<string, HTMLDivElement>,
): RectMap {
  const rects: RectMap = new Map();

  for (const key of keys) {
    const node = nodeByKey.get(key);
    if (!node?.isConnected) continue;
    rects.set(key, getRelativeRect(node));
  }

  return rects;
}

function isReasonableDelta(
  deltaX: number,
  deltaY: number,
  rect: LayoutRect,
): boolean {
  if (typeof window === "undefined") return true;

  const viewportX = window.innerWidth || 0;
  const viewportY = window.innerHeight || 0;

  const maxDeltaX = Math.max(viewportX * 1.25, rect.width * 8, 320);
  const maxDeltaY = Math.max(viewportY * 1.25, rect.height * 8, 320);

  return Math.abs(deltaX) <= maxDeltaX && Math.abs(deltaY) <= maxDeltaY;
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
    captureBaselineToken = null,
  } = options;

  const nodeByKeyRef = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const previousRectsRef = React.useRef<RectMap>(new Map());
  const cleanupByKeyRef = React.useRef<Map<string, CleanupFn>>(new Map());

  const playRafIdRef = React.useRef<number | null>(null);
  const settleRafIdRef = React.useRef<number | null>(null);
  const baselineRafARef = React.useRef<number | null>(null);
  const baselineRafBRef = React.useRef<number | null>(null);

  const hasStableBaselineRef = React.useRef(false);
  const lastCaptureBaselineTokenRef = React.useRef<
    string | number | boolean | null
  >(captureBaselineToken);

  const cancelScheduledAnimationFrames = React.useCallback((): void => {
    if (playRafIdRef.current !== null) {
      window.cancelAnimationFrame(playRafIdRef.current);
      playRafIdRef.current = null;
    }

    if (settleRafIdRef.current !== null) {
      window.cancelAnimationFrame(settleRafIdRef.current);
      settleRafIdRef.current = null;
    }

    if (baselineRafARef.current !== null) {
      window.cancelAnimationFrame(baselineRafARef.current);
      baselineRafARef.current = null;
    }

    if (baselineRafBRef.current !== null) {
      window.cancelAnimationFrame(baselineRafBRef.current);
      baselineRafBRef.current = null;
    }
  }, []);

  const clearActiveAnimations = React.useCallback((): void => {
    for (const cleanup of cleanupByKeyRef.current.values()) {
      cleanup();
    }
    cleanupByKeyRef.current.clear();
  }, []);

  const resetTrackedNodeStyles = React.useCallback(
    (trackedKeys: string[]): void => {
      for (const key of trackedKeys) {
        const node = nodeByKeyRef.current.get(key);
        if (!node) continue;
        resetNodeTransform(node);
      }
    },
    [],
  );

  const scheduleBaselineCapture = React.useCallback(
    (trackedKeys: string[]): void => {
      cancelScheduledAnimationFrames();

      baselineRafARef.current = window.requestAnimationFrame(() => {
        baselineRafARef.current = null;

        baselineRafBRef.current = window.requestAnimationFrame(() => {
          baselineRafBRef.current = null;

          resetTrackedNodeStyles(trackedKeys);
          previousRectsRef.current = snapshotRects(
            trackedKeys,
            nodeByKeyRef.current,
          );
          hasStableBaselineRef.current = true;
        });
      });
    },
    [cancelScheduledAnimationFrames, resetTrackedNodeStyles],
  );

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
    return () => {
      cancelScheduledAnimationFrames();
      clearActiveAnimations();
    };
  }, [cancelScheduledAnimationFrames, clearActiveAnimations]);

  React.useLayoutEffect(() => {
    cancelScheduledAnimationFrames();
    clearActiveAnimations();
    resetTrackedNodeStyles(keys);

    const captureBaselineChanged =
      captureBaselineToken !== lastCaptureBaselineTokenRef.current;

    lastCaptureBaselineTokenRef.current = captureBaselineToken;

    if (!hasStableBaselineRef.current) {
      scheduleBaselineCapture(keys);
      return;
    }

    if (captureBaselineChanged) {
      hasStableBaselineRef.current = false;
      scheduleBaselineCapture(keys);
      return;
    }

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

      if (!node?.isConnected || !previousRect || !nextRect) continue;

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
      if (!isReasonableDelta(deltaX, deltaY, nextRect)) continue;

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

    playRafIdRef.current = window.requestAnimationFrame(() => {
      playRafIdRef.current = null;

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
  }, [
    keys,
    disabled,
    durationMs,
    easing,
    layoutDependency,
    captureBaselineToken,
    cancelScheduledAnimationFrames,
    clearActiveAnimations,
    resetTrackedNodeStyles,
    scheduleBaselineCapture,
  ]);

  return { registerItemRef };
}
