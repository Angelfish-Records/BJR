// web/app/(site)/exegesis/[recordingId]/components/ExegesisIdentityPanel.tsx
"use client";

import React from "react";

type ExegesisIdentityPanelProps = {
  show: boolean;
  canClaimName: boolean;
  identityLabel: string;
  publicName: string | null | undefined;
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
  canClaimName,
  identityLabel,
  publicName,
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
    <div className="mt-3 rounded-md bg-black/20 p-3 text-sm">
      {canClaimName && !publicName ? (
        <div className="flex items-center justify-between gap-3">
          <button
            className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            onClick={onToggleClaim}
            title="Claim a public name"
          >
            Claim name
          </button>
        </div>
      ) : null}

      <div className="mt-1 text-sm">
        Commenting as <span className="font-semibold">{identityLabel}</span>
      </div>

      {!publicName ? (
        <div className="mt-1 text-xs opacity-60">
          {canClaimName ? " · Unlocked" : ""}
        </div>
      ) : null}

      {claimOpen ? (
        <div className="mt-3 space-y-2">
          <input
            className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
            placeholder="Choose a public name"
            value={claimName}
            onChange={(e) => onChangeClaimName(e.target.value)}
          />

          {claimErr ? (
            <div className="text-xs opacity-70">{claimErr}</div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
              onClick={onCancelClaim}
            >
              Cancel
            </button>

            <button
              className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={!canClaimName || !claimName.trim() || claimBusy}
              onClick={onSubmitClaim}
            >
              {claimBusy ? "Saving…" : "Claim"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}