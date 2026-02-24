"use client";

const KEY = "af:lastPortalTab";

export function getLastPortalTab(): string | null {
  try {
    return (sessionStorage.getItem(KEY) ?? "").trim() || null;
  } catch {
    return null;
  }
}

export function setLastPortalTab(id: string) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {}
}