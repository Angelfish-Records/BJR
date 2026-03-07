import crypto from "crypto";
import { EXEGESIS_ANON_LABEL_WORDS } from "@/lib/exegesis/anonLabelWords";

export function stableAnonLabel(memberId: string): string {
  const h = crypto.createHash("sha256").update(memberId).digest();
  const n = h.readUInt32BE(0);
  const w =
    EXEGESIS_ANON_LABEL_WORDS[
      n % EXEGESIS_ANON_LABEL_WORDS.length
    ] ?? "Cipher";

  return `Anonymous ${w}`;
}