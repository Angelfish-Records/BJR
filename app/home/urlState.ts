// web/app/home/urlState.ts
"use client";

import * as React from "react";

const QS_EVENT = "af:qs-change";

// Secondary query policy (strict allowlist).
// Surfaces are path-based now; query is for secondary concerns only.
const ALLOW_KEYS = new Set([
  "st",
  "share",
  "autoplay",
  "gift",
  "checkout",
  "post",
  "pt",
]);

const ALLOW_PREFIXES = ["utm_"];

// Explicitly forbidden legacy/state keys (must never persist).
const FORBIDDEN_KEYS = new Set(["p", "panel", "album", "track", "t"]);

function safeGetSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search || "";
}

function isAllowedKey(k: string): boolean {
  if (ALLOW_KEYS.has(k)) return true;
  return ALLOW_PREFIXES.some((p) => k.startsWith(p));
}

/** Mutates params to enforce the secondary-query policy. */
export function sanitizeSecondaryQuery(params: URLSearchParams): void {
  // 1) kill forbidden keys always
  for (const k of Array.from(params.keys())) {
    if (FORBIDDEN_KEYS.has(k)) params.delete(k);
  }

  // 2) strict allowlist for everything else
  for (const k of Array.from(params.keys())) {
    if (!isAllowedKey(k)) params.delete(k);
  }

  // 3) normalize share -> st when present (prefer explicit st)
  const st = (params.get("st") ?? "").trim();
  const share = (params.get("share") ?? "").trim();
  if (!st && share) {
    params.set("st", share);
  }
  if (share) params.delete("share");

  // 4) trim empties
  for (const [k, v] of Array.from(params.entries())) {
    if (!String(v ?? "").trim()) params.delete(k);
  }
}

export function useClientSearchParams(): URLSearchParams {
  const [qs, setQs] = React.useState<string>(() => safeGetSearch());

  React.useEffect(() => {
    const onPop = () => setQs(safeGetSearch());
    const onCustom = () => setQs(safeGetSearch());

    window.addEventListener("popstate", onPop);
    window.addEventListener(QS_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(QS_EVENT, onCustom as EventListener);
    };
  }, []);

  return React.useMemo(() => {
    const params = new URLSearchParams((qs || "").replace(/^\?/, ""));
    sanitizeSecondaryQuery(params);
    return params;
  }, [qs]);
}

export function getAutoplayFlag(sp: URLSearchParams): boolean {
  const v = (sp.get("autoplay") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Patch semantics:
 * - null/undefined/'' => delete
 * - otherwise => set
 *
 * IMPORTANT: This must NOT implement any portal/player surface logic.
 * Surfaces are path-based now. Query is secondary only.
 */
export function replaceQuery(patch: Record<string, string | null | undefined>) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);

  // Never allow forbidden legacy keys to be introduced via patch.
  for (const k of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(k)) delete patch[k];
  }

  // apply patch
  for (const [k, v] of Object.entries(patch)) {
    const sv = v == null ? "" : String(v);
    if (v == null || sv.trim() === "") params.delete(k);
    else params.set(k, sv);
  }

  // Enforce policy after patch
  sanitizeSecondaryQuery(params);

  const next = params.toString();
  const cur = url.searchParams.toString();
  if (next === cur) return;

  url.search = next ? `?${next}` : "";
  window.history.replaceState({}, "", url.toString());
  window.dispatchEvent(new Event(QS_EVENT));
}

/**
 * Convenience: read a query param once, then clear it.
 */
export function useReadOnceParam(key: string): string | null {
  const sp = useClientSearchParams();
  const v = (sp.get(key) ?? "").trim() || null;
  const shownRef = React.useRef(false);

  React.useEffect(() => {
    if (!v) return;
    if (shownRef.current) return;
    shownRef.current = true;
    replaceQuery({ [key]: null });
  }, [v, key]);

  return v;
}