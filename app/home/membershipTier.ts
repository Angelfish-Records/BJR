// web/app/home/membershipTier.ts
import type { Tier } from "@/lib/types";

export function isPatronTier(tier: Tier): boolean {
  return tier === "patron";
}

export function isPartnerTier(tier: Tier): boolean {
  return tier === "partner";
}

export function isFriendTier(tier: Tier): boolean {
  return tier === "friend";
}

export function isPaidSupporterTier(tier: Tier): boolean {
  return tier === "patron" || tier === "partner";
}