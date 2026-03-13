export type BadgeAwardNotice = {
  entitlementKey: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  shareable: boolean;
  unlockedAt: string;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeBadgeAwardNotices(
  value: unknown,
): BadgeAwardNotice[] {
  if (!Array.isArray(value)) return [];

  const notices: BadgeAwardNotice[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;

    const entitlementKey = asTrimmedString(item.entitlementKey);
    const title = asTrimmedString(item.title);
    const unlockedAt = asTrimmedString(item.unlockedAt);

    if (!entitlementKey || !title || !unlockedAt) continue;

    notices.push({
      entitlementKey,
      title,
      description: asTrimmedString(item.description),
      imageUrl: asTrimmedString(item.imageUrl),
      shareable: asBoolean(item.shareable),
      unlockedAt,
    });
  }

  return notices;
}