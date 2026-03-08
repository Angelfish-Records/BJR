// web/app/(site)/exegesis/[recordingId]/exegesisIdentity.ts
import type { IdentityDTO } from "./exegesisTypes";
import type { MemberIdentityFacts } from "@/lib/memberIdentity";

export function identityFactsFromDTO(
  dto?: IdentityDTO,
): MemberIdentityFacts | undefined {
  if (!dto) return undefined;

  return {
    memberId: dto.memberId,
    anonLabel: dto.anonLabel,
    publicName: dto.publicName,
    publicNameUnlockedAt: dto.publicNameUnlockedAt,
    contributionCount: dto.contributionCount,
    isAdmin: dto.isAdmin,
  };
}
