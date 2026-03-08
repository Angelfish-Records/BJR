// web/lib/memberIdentity.ts
export type MemberIdentityFacts = {
  memberId: string;
  anonLabel: string;
  publicName: string | null;
  publicNameUnlockedAt: string | null;
  contributionCount: number;
  isAdmin: boolean;
};

export const ADMIN_DISPLAY_NAME = "Brendan John Roch";

export type ResolvedDisplayIdentity = {
  memberId: string;
  displayName: string;
  isAdmin: boolean;
  hasClaimedPublicName: boolean;
  canClaimName: boolean;
};

function fallbackDisplayName(identity?: MemberIdentityFacts): string {
  if (!identity) return "Anonymous";
  return identity.publicName || identity.anonLabel || "Anonymous";
}

export function resolveViewerDisplayIdentity(opts: {
  identity?: MemberIdentityFacts;
  canClaimName: boolean;
}): ResolvedDisplayIdentity | null {
  const { identity, canClaimName } = opts;
  if (!identity) return null;

  const isAdmin = identity.isAdmin === true;
  const hasClaimedPublicName = !isAdmin && Boolean(identity.publicName);

  return {
    memberId: identity.memberId,
    displayName: isAdmin ? ADMIN_DISPLAY_NAME : fallbackDisplayName(identity),
    isAdmin,
    hasClaimedPublicName,
    canClaimName: !isAdmin && canClaimName,
  };
}

export function resolveAuthorDisplayIdentity(
  identity?: MemberIdentityFacts,
): ResolvedDisplayIdentity {
  const isAdmin = identity?.isAdmin === true;

  return {
    memberId: identity?.memberId ?? "",
    displayName: isAdmin ? ADMIN_DISPLAY_NAME : fallbackDisplayName(identity),
    isAdmin,
    hasClaimedPublicName: !isAdmin && Boolean(identity?.publicName),
    canClaimName: false,
  };
}