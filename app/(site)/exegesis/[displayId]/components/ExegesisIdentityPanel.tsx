// web/app/(site)/exegesis/[displayId]/components/ExegesisIdentityPanel.tsx
"use client";

import React from "react";

type ExegesisIdentityPanelProps = {
  show: boolean;
  authorLabel: string;
  hasClaimedPublicName: boolean;
  canClaimName: boolean;
  claimOpen: boolean;
  claimName: string;
  claimErr: string;
  claimBusy: boolean;
  onToggleClaim: () => void;
  onChangeClaimName: (value: string) => void;
  onCancelClaim: () => void;
  onSubmitClaim: () => void;
};

export default function ExegesisIdentityPanel({
  show,
  authorLabel,
  hasClaimedPublicName,
  canClaimName,
  claimOpen,
  claimName,
  claimErr,
  claimBusy,
  onToggleClaim,
  onChangeClaimName,
  onCancelClaim,
  onSubmitClaim,
}: ExegesisIdentityPanelProps) {
  if (!show) return null;

  return (
    <div className="min-w-0 flex-1 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 text-xs text-white/72">
          Commenting as{" "}
          <span className="font-semibold text-white">{authorLabel}</span>
          {!hasClaimedPublicName && canClaimName ? (
            <span className="ml-1 text-white/45">· Unlocked</span>
          ) : null}
        </div>

        {canClaimName && !hasClaimedPublicName ? (
          <button
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] text-white/65 transition hover:bg-white/[0.06] hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            onClick={onToggleClaim}
            title="Claim a public name"
            type="button"
          >
            Claim name
          </button>
        ) : null}
      </div>

      {claimOpen ? (
        <div className="mt-2 max-w-md space-y-2">
          <input
            className="h-10 w-full rounded-lg bg-black/[0.16] px-3 text-sm text-white/90 outline-none placeholder:text-white/30"
            placeholder="Choose a display name"
            value={claimName}
            onChange={(e) => onChangeClaimName(e.target.value)}
          />

          {claimErr ? (
            <div className="text-xs text-white/70">{claimErr}</div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              onClick={onCancelClaim}
              type="button"
            >
              Cancel
            </button>

            <button
              className="inline-flex h-9 items-center justify-center rounded-lg bg-white/[0.08] px-3 text-sm text-white/92 transition hover:bg-white/[0.14] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-40"
              disabled={!canClaimName || !claimName.trim() || claimBusy}
              onClick={onSubmitClaim}
              type="button"
            >
              {claimBusy ? "Saving…" : "Claim"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
