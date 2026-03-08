// web/app/(site)/exegesis/[recordingId]/components/ExegesisRichComposer.tsx
"use client";

import React from "react";
import TipTapEditor from "../TipTapEditor";

type ExegesisRichComposerProps = {
  editorKey: string;
  valuePlain: string;
  valueDoc: unknown | null;
  disabled: boolean;
  showToolbar: boolean;
  autofocus?: boolean;
  placeholder: string;
  error?: string;
  posting: boolean;
  submitLabel: string;
  submitDisabled: boolean;
  onChangePlain: (plain: string) => void;
  onChangeDoc: (doc: unknown | null) => void;
  onToggleToolbar: () => void;
  onSubmit: () => void;
};

export default function ExegesisRichComposer({
  editorKey,
  valuePlain,
  valueDoc,
  disabled,
  showToolbar,
  autofocus,
  placeholder,
  error,
  posting,
  submitLabel,
  submitDisabled,
  onChangePlain,
  onChangeDoc,
  onToggleToolbar,
  onSubmit,
}: ExegesisRichComposerProps) {
  const charCount = valuePlain.trim().length;
  const showCharWarning = charCount >= 4500;

  return (
    <>
      <div className="[&_.tiptap-editor]:rounded-none [&_.tiptap-editor]:border-0 [&_.tiptap-editor]:bg-transparent [&_.tiptap-editor]:shadow-none">
        <TipTapEditor
          key={editorKey}
          valuePlain={valuePlain}
          valueDoc={valueDoc}
          disabled={disabled}
          showToolbar={showToolbar}
          autofocus={autofocus}
          placeholder={placeholder}
          onChangePlain={onChangePlain}
          onChangeDoc={onChangeDoc}
        />
      </div>

      <div className="flex items-center justify-between bg-black/[0.16] px-3 py-3">
        <button
          type="button"
          className={[
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition",
            "hover:bg-white/[0.06] hover:text-white/95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
            showToolbar ? "bg-white/[0.08] text-white/95" : "",
            disabled ? "cursor-not-allowed opacity-35" : "",
          ].join(" ")}
          disabled={disabled}
          onClick={onToggleToolbar}
          title={showToolbar ? "Hide formatting" : "Formatting"}
          aria-label={showToolbar ? "Hide formatting" : "Show formatting"}
        >
          <span className="text-sm font-medium tracking-[0.01em]">Aa</span>
        </button>

        <div className="flex items-center gap-3">
          {showCharWarning ? (
            <div
              className={[
                "text-xs tabular-nums transition",
                charCount >= 4900 ? "text-white/90" : "text-white/55",
              ].join(" ")}
            >
              {charCount}/5000
            </div>
          ) : null}

          <button
            className={[
              "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition",
              "bg-white/[0.08] text-white/92",
              "hover:bg-white/[0.14] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
              submitDisabled ? "cursor-not-allowed opacity-35" : "",
            ].join(" ")}
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            {posting ? `${submitLabel}…` : submitLabel}
          </button>
        </div>
      </div>

      {error ? <div className="mt-2 text-xs text-white/70">{error}</div> : null}
    </>
  );
}
