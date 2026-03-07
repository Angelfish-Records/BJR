// web/app/(site)/exegesis/[recordingId]/components/ExegesisInlineGateOverlay.tsx
"use client";

import React from "react";
import ActivationGate from "@/app/home/ActivationGate";

type ExegesisInlineGateOverlayProps = {
  open: boolean;
  message: string;
  dismissible: boolean;
  onDismiss: () => void;
};

export default function ExegesisInlineGateOverlay({
  open,
  message,
  dismissible,
  onDismiss,
}: ExegesisInlineGateOverlayProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 grid place-items-center p-4">
      <div className="w-full max-w-[520px]">
        <div className="relative rounded-2xl border border-white/10 bg-black/50 p-4 shadow-[0_26px_90px_rgba(0,0,0,0.55)] backdrop-blur-md">
          {dismissible || message ? (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {message ? (
                  <div className="rounded-md px-3 py-2.5 text-[13px] opacity-90">
                    {message}
                  </div>
                ) : null}
              </div>

              {dismissible ? (
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/0 text-white/50 hover:bg-white/10 hover:text-white/80 transition leading-none"
                  onClick={onDismiss}
                >
                  <span className="text-[18px] leading-none">×</span>
                </button>
              ) : null}
            </div>
          ) : null}

          <ActivationGate>
            <div />
          </ActivationGate>
        </div>
      </div>
    </div>
  );
}