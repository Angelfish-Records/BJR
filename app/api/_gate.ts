// web/app/api/_gate.ts
import "server-only";
import { NextResponse } from "next/server";

import type {
  GatePayload,
  GateDomain,
  GateAction,
  GateCodeRaw,
} from "@/app/home/gating/gateTypes";

export type ApiErrEnvelope = {
  ok: false;
  error: string;
  gate?: GatePayload;
};

export function correlationIdFromRequest(req: Request): string {
  // Prefer an inbound correlation id if a client (or edge) supplied one.
  const h =
    req.headers.get("x-correlation-id") ??
    req.headers.get("x-request-id") ??
    null;

  if (h && h.trim()) return h.trim();

  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } })
    .crypto;
  const uuid = c?.randomUUID?.();
  if (typeof uuid === "string" && uuid.length > 0) return uuid;

  return `corr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

export function withCorrelationId<T extends Response>(
  res: T,
  correlationId: string,
): T {
  try {
    res.headers.set("x-correlation-id", correlationId);
  } catch {}
  return res;
}

export function jsonOk<T>(
  body: T,
  opts: { correlationId: string; status?: number; headers?: HeadersInit },
) {
  const res = NextResponse.json(body, {
    status: opts.status ?? 200,
    headers: opts.headers,
  });
  return withCorrelationId(res, opts.correlationId);
}

export function gateEnvelope(params: {
  domain: GateDomain;
  code: GateCodeRaw;
  action: GateAction;
  message: string;
  correlationId: string;
  reason?: string | null;
}): GatePayload {
  return {
    domain: params.domain,
    code: params.code,
    action: params.action,
    message: (params.message ?? "").trim(),
    correlationId: params.correlationId,
    ...(params.reason ? { reason: params.reason } : {}),
  };
}

export function gateError(
  req: Request,
  opts: {
    correlationId: string;
    status?: number; // default 403
    domain: GateDomain;
    code: GateCodeRaw;
    action: GateAction;
    message: string;
    error?: string; // optional alternate client-visible error string
    reason?: string | null;
    headers?: HeadersInit;
    // Optional hook to mutate the response (e.g. ensureAnonId(req, res))
    onResponse?: (res: NextResponse) => void;
  },
) {
  const payload = gateEnvelope({
    domain: opts.domain,
    code: opts.code,
    action: opts.action,
    message: opts.message,
    correlationId: opts.correlationId,
    reason: opts.reason ?? null,
  });

  const body: ApiErrEnvelope = {
    ok: false,
    error: (opts.error ?? opts.message).trim(),
    gate: payload,
  };

  const res = NextResponse.json(body, {
    status: opts.status ?? 403,
    headers: opts.headers,
  });

  withCorrelationId(res, opts.correlationId);

  try {
    opts.onResponse?.(res);
  } catch {}

  return res;
}