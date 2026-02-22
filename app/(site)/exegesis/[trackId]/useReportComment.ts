// web/app/(site)/exegesis/[trackId]/useReportComment.ts
"use client";

import * as React from "react";

type ReportInput = {
  commentId: string;
  category: string;
  reason: string;
};

type ReportState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; error: string };

export function useReportComment() {
  const [state, setState] = React.useState<ReportState>({ status: "idle" });

  const report = React.useCallback(async (input: ReportInput) => {
    setState({ status: "submitting" });

    try {
      const res = await fetch("/api/exegesis/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!res.ok || !data.ok) {
        setState({ status: "error", error: data.error ?? "Report failed." });
        return { ok: false as const, error: data.error ?? "Report failed." };
      }

      setState({ status: "success" });
      return { ok: true as const };
    } catch (e) {
      setState({ status: "error", error: e instanceof Error ? e.message : "Network error." });
      return { ok: false as const, error: "Network error." };
    }
  }, []);

  const reset = React.useCallback(() => setState({ status: "idle" }), []);

  return { state, report, reset };
}