// web/app/home/modules/badges/badgeCabinetViewModel.ts
import type { BadgeCabinetInputBadge, BadgeCabinetItemModel } from "./badgeCabinetTypes";

function formatUnlockedAt(value?: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getBadgeStateLabel(
  unlocked: boolean,
  unlockedAt: string | null,
): string {
  if (!unlocked) return "Locked";
  if (!unlockedAt) return "Unlocked";
  return `Unlocked ${unlockedAt}`;
}

function getBadgeTitle(props: {
  label: string;
  description: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
}): string {
  const { label, description, unlocked, unlockedAt } = props;

  return [
    label,
    description?.trim() || null,
    getBadgeStateLabel(unlocked, unlockedAt),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
}

function normalizeBadge(
  badge: BadgeCabinetInputBadge,
  fallbackEditorialOrder: number,
): BadgeCabinetItemModel | null {
  const key = typeof badge.key === "string" ? badge.key.trim() : "";
  const label = typeof badge.label === "string" ? badge.label.trim() : "";

  if (!key || !label) return null;

  const description =
    typeof badge.description === "string" && badge.description.trim()
      ? badge.description.trim()
      : null;

  const imageUrl =
    typeof badge.imageUrl === "string" && badge.imageUrl.trim()
      ? badge.imageUrl.trim()
      : null;

  const unlockedAt = badge.unlocked ? formatUnlockedAt(badge.unlockedAt) : null;

  const editorialOrder =
    typeof badge.editorialOrder === "number" && Number.isFinite(badge.editorialOrder)
      ? badge.editorialOrder
      : fallbackEditorialOrder;

  return {
    key,
    label,
    description,
    imageUrl,
    unlocked: badge.unlocked === true,
    unlockedAt,
    editorialOrder,
    partition: badge.unlocked ? "unlocked" : "locked",
    titleText: getBadgeTitle({
      label,
      description,
      unlocked: badge.unlocked === true,
      unlockedAt,
    }),
    shareable: badge.shareable === true,
    undisclosed: badge.undisclosed === true,
  };
}

export function buildBadgeCabinetItems(
  badges: BadgeCabinetInputBadge[],
): BadgeCabinetItemModel[] {
  const normalized = badges
    .map((badge, index) => normalizeBadge(badge, index))
    .filter((badge): badge is BadgeCabinetItemModel => badge !== null);

  normalized.sort((a, b) => {
    if (a.partition !== b.partition) {
      return a.partition === "unlocked" ? -1 : 1;
    }

    if (a.editorialOrder !== b.editorialOrder) {
      return a.editorialOrder - b.editorialOrder;
    }

    return a.label.localeCompare(b.label);
  });

  return normalized;
}