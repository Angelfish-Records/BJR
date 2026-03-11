// web/lib/entitlementVocab.ts
export type StructuredEntitlementKey = string;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function entKey(obj: Record<string, unknown>): StructuredEntitlementKey {
  return stableStringify(obj);
}

/**
 * Client-safe structured entitlement helpers.
 * These remain canonical string builders and may be used by both
 * server and client code.
 */
export const ENT = {
  pageView: (page: string) => entKey({ kind: "page_view", page }),
  theme: (name: string) => entKey({ kind: "theme", name }),
  mediaPlay: (recordingId: string) =>
    entKey({ kind: "media_play", recordingId }),
  download: (assetId: string) => entKey({ kind: "download", assetId }),
  downloadAlbum: (slug: string) => `download_album_${slug}`,
  tier: (name: "friend" | "patron" | "partner") => `tier_${name}`,
} as const;