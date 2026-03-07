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
  return (
    <>
      <div className="mt-2">
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

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
          disabled={disabled}
          onClick={onToggleToolbar}
          title={showToolbar ? "Hide formatting" : "Formatting"}
        >
          Aa
        </button>

        <div className="text-xs opacity-60">{valuePlain.trim().length}/5000</div>
      </div>

      {error ? <div className="mt-2 text-xs opacity-75">{error}</div> : null}

      <div className="mt-2 flex items-center justify-between">
        <button
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
          disabled={submitDisabled}
          onClick={onSubmit}
        >
          {posting ? `${submitLabel}…` : submitLabel}
        </button>
      </div>
    </>
  );
}