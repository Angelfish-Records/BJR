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

// Secondary query keys that should survive internal navigation.
// `st` is durable access context for share-token playback rehydration.
const PERSIST_KEYS = new Set(["st"]);

// Explicitly forbidden legacy/state keys (must never persist).
const FORBIDDEN_KEYS = new Set(["p", "album", "track", "t"]);

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
  if (!st && share) params.set("st", share);
  if (params.has("share")) params.delete("share");

  // 4) trim empties
  for (const [k, v] of Array.from(params.entries())) {
    if (!String(v ?? "").trim()) params.delete(k);
  }
}

/** Read current location query and return a policy-sanitized copy. */
export function pickSecondaryQueryFromLocation(): URLSearchParams {
  const params = new URLSearchParams(safeGetSearch().replace(/^\?/, ""));
  sanitizeSecondaryQuery(params);
  return params;
}

function pickPersistentSecondaryQueryFromParams(
  params: URLSearchParams,
): URLSearchParams {
  const clean = new URLSearchParams(params);
  sanitizeSecondaryQuery(clean);

  for (const k of Array.from(clean.keys())) {
    if (!PERSIST_KEYS.has(k)) clean.delete(k);
  }

  return clean;
}

/** Read current location query and return only durable query state. */
export function pickPersistentSecondaryQueryFromLocation(): URLSearchParams {
  const params = new URLSearchParams(safeGetSearch().replace(/^\?/, ""));
  return pickPersistentSecondaryQueryFromParams(params);
}

/**
 * Appends durable secondary query state to same-origin internal hrefs.
 *
 * Preserves hash fragments, so:
 *   /exegesis/foo#l=bar
 * becomes:
 *   /exegesis/foo?st=TOKEN#l=bar
 */
export function appendPersistentSecondaryQueryToHref(href: string): string {
  if (typeof window === "undefined") return href;

  const persistent = pickPersistentSecondaryQueryFromLocation();
  if (Array.from(persistent.keys()).length === 0) return href;

  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return href;

  const params = new URLSearchParams(url.search);
  sanitizeSecondaryQuery(params);

  for (const [k, v] of persistent.entries()) {
    if (!params.has(k)) params.set(k, v);
  }

  sanitizeSecondaryQuery(params);

  const next = params.toString();
  url.search = next ? `?${next}` : "";

  return `${url.pathname}${url.search}${url.hash}`;
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

export function usePersistentSecondaryHref(href: string): string {
  const sp = useClientSearchParams();
  const qs = React.useMemo(() => sp.toString(), [sp]);

  return React.useMemo(() => {
    void qs;
    return appendPersistentSecondaryQueryToHref(href);
  }, [href, qs]);
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

  // Build a sanitized patch object WITHOUT mutating input.
  const cleanPatch: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    const sv = v == null ? "" : String(v);
    cleanPatch[k] = sv.trim() ? sv : null;
  }

  // Apply patch
  for (const [k, v] of Object.entries(cleanPatch)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
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
