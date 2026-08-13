import { ENT } from "./entitlementVocab";

export function albumDownloadAccessKeys(
  albumEntitlementKey: string,
): string[] {
  return [
    albumEntitlementKey,
    ENT.tier("patron"),
    ENT.tier("partner"),
  ];
}

export function hasAlbumDownloadAccess(
  entitlementKeys: readonly string[],
  albumEntitlementKey: string,
): boolean {
  const current = new Set(entitlementKeys);

  return albumDownloadAccessKeys(albumEntitlementKey).some((key) =>
    current.has(key),
  );
}
