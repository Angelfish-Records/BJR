// web/lib/embargo.ts

export const DEFAULT_EMBARGO_NOTE =
  "Disabled pre-release. Patrons have instant early access.";

export function isReleaseEmbargoed(
  releaseAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const normalizedReleaseAt = (releaseAt ?? "").trim();
  if (!normalizedReleaseAt) return false;

  const releaseAtMs = Date.parse(normalizedReleaseAt);
  if (!Number.isFinite(releaseAtMs)) return false;

  return nowMs < releaseAtMs;
}

export function resolveEmbargoNote(
  note: string | null | undefined,
): string {
  return note?.trim() || DEFAULT_EMBARGO_NOTE;
}
