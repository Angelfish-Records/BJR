// web/app/(site)/exegesis/[recordingId]/useReportComment.ts
"use client";

import * as React from "react";
import { gateResultFromPayload } from "@/app/home/gating/fromPayload";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type { GatePayload } from "@/app/home/gating/gateTypes";

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
  const broker = useGateBroker();
  const [state, setState] = React.useState<ReportState>({ status: "idle" });

  const report = React.useCallback(
    async (input: ReportInput) => {
      setState({ status: "submitting" });

      try {
        const res = await fetch("/api/exegesis/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });

        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          gate?: GatePayload;
        };

        if (!res.ok || !data.ok) {
          if (data.gate) {
            const result = gateResultFromPayload({
              payload: data.gate,
              attempt: { verb: "vote", domain: "exegesis" },
              isSignedIn: true,
              intent: "explicit",
            });

            if (!result.ok) {
              broker.reportGate({
                code: result.reason.code,
                action: result.reason.action,
                message: result.reason.message,
                domain: result.reason.domain,
                uiMode: result.uiMode,
                correlationId: result.reason.correlationId ?? null,
              });

              return {
                ok: false as const,
                error: data.error ?? result.reason.message ?? "Report gated.",
              };
            }
          }

          setState({ status: "error", error: data.error ?? "Report failed." });
          return { ok: false as const, error: data.error ?? "Report failed." };
        }

        setState({ status: "success" });
        return { ok: true as const };
      } catch (e) {
        setState({
          status: "error",
          error: e instanceof Error ? e.message : "Network error.",
        });
        return { ok: false as const, error: "Network error." };
      }
    },
    [broker],
  );

  const reset = React.useCallback(() => setState({ status: "idle" }), []);

  return { state, report, reset };
}
