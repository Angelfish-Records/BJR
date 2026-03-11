// web/app/(site)/exegesis/[displayId]/components/ExegesisReportForm.tsx
"use client";

import React from "react";
import { REPORT_CATEGORIES } from "../exegesisTypes";
import type { ReportDraft } from "../exegesisTypes";

export default function ExegesisReportForm(props: {
  draft: ReportDraft;
  onChange: (next: ReportDraft) => void;
  onSubmit: () => void;
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  const { draft, onChange, onSubmit, containerRef } = props;

  const reasonLength = (draft.reason ?? "").trim().length;
  const submitDisabled =
    Boolean(draft.busy) || reasonLength < 20 || reasonLength > 300;

  if (draft.done) {
    return (
      <div
        ref={containerRef}
        className="mt-2 rounded-md bg-black/25 p-3 text-sm"
      >
        <div className="text-xs opacity-75">
          Report submitted. Thanks — this helps keep the discourse usable.
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mt-2 rounded-md bg-black/25 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs opacity-70">Report this comment</div>
      </div>

      <div className="mt-2 grid gap-2">
        <select
          className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
          value={draft.category ?? "spam"}
          onChange={(e) =>
            onChange({
              ...draft,
              category: e.target.value,
              err: "",
            })
          }
        >
          {REPORT_CATEGORIES.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>

        <textarea
          className="min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none"
          placeholder="Describe the issue (20–300 chars)."
          value={draft.reason ?? ""}
          onChange={(e) =>
            onChange({
              ...draft,
              reason: e.target.value,
              err: "",
            })
          }
        />

        {draft.err ? <div className="text-xs opacity-75">{draft.err}</div> : null}

        <div className="flex items-center justify-between">
          <div className="text-xs opacity-60">{reasonLength}/300</div>
          <button
            className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            {draft.busy ? "Submitting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}