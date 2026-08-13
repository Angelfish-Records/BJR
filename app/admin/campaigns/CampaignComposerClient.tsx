// web/app/admin/campaigns/CampaignComposerClient.tsx
"use client";

import Head from "next/head";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type EnqueueOk = {
  ok: true;
  campaignId: string;
  enqueued: number;
  audienceCount: number;
};

type DrainOk = {
  ok: true;
  sent: number;
  remainingQueued: number;
  nextPollMs: number;
  runId: string;
};

type ApiErr = {
  ok?: false;
  error: string;
  message?: string;
  runId?: string;
  code?: string;
};

type PreviewOk = { ok: true; subject: string; html: string };
const AUDIENCE_FILTERS_KEY = "bjr_campaign_audience_filters_v1";
const DRAFT_KEY = "bjr_campaign_draft_v1";

type Draft = {
  campaignName: string;
  subjectTemplate: string;
  bodyTemplate: string;
  replyTo: string;
};

const DEFAULT_DRAFT: Draft = {
  campaignName: "New campaign",
  subjectTemplate: "A note from Brendan",
  bodyTemplate: "Write the email…",
  replyTo: "",
};

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function isApiErr(x: unknown): x is ApiErr {
  return isObject(x) && typeof x.error === "string";
}

function isEnqueueOk(x: unknown): x is EnqueueOk {
  if (!isObject(x)) return false;
  return (
    x.ok === true &&
    typeof x.campaignId === "string" &&
    typeof x.enqueued === "number" &&
    typeof x.audienceCount === "number"
  );
}

function isDrainOk(x: unknown): x is DrainOk {
  if (!isObject(x)) return false;
  return (
    x.ok === true &&
    typeof x.sent === "number" &&
    typeof x.remainingQueued === "number" &&
    typeof x.nextPollMs === "number" &&
    typeof x.runId === "string"
  );
}

function isPreviewOk(x: unknown): x is PreviewOk {
  if (!isObject(x)) return false;
  return (
    x.ok === true && typeof x.subject === "string" && typeof x.html === "string"
  );
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: "Invalid JSON from server", message: text };
  }
}

// --- toolbar helpers (browser-only, but safe in client comp) ---
function replaceSelection(
  textarea: HTMLTextAreaElement,
  replacement: string,
  selectRange?: [number, number],
) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;

  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  textarea.value = before + replacement + after;

  const cursorPos = selectRange
    ? start + selectRange[0]
    : start + replacement.length;

  textarea.focus();
  textarea.setSelectionRange(
    cursorPos,
    selectRange ? start + selectRange[1] : cursorPos,
  );
}

function wrapSelectionOrInsert(
  textarea: HTMLTextAreaElement,
  wrapperBefore: string,
  wrapperAfter: string,
  placeholderInner: string,
  selectInner?: boolean,
) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;

  const selected = textarea.value.slice(start, end);
  const inner = selected.length > 0 ? selected : placeholderInner;

  const replacement = `${wrapperBefore}${inner}${wrapperAfter}`;

  const innerStart = wrapperBefore.length;
  const innerEnd = wrapperBefore.length + inner.length;

  replaceSelection(
    textarea,
    replacement,
    selectInner ? ([innerStart, innerEnd] as [number, number]) : undefined,
  );
}

function buildCenteredImageBlock(params: {
  url: string;
  alt: string;
  maxWidthPx: number;
}) {
  const { url, alt, maxWidthPx } = params;

  // Email-safe: size via width/max-width; keep height:auto.
  return (
    `\n\n<div style="text-align:center; margin: 16px 0;">\n` +
    `  <img src="${url}" alt="${alt}" style="max-width:${maxWidthPx}px; width:100%; height:auto; border-radius:12px;" />\n` +
    `</div>\n\n`
  );
}

function getBodyTextarea(): HTMLTextAreaElement | null {
  return document.getElementById("body-template") as HTMLTextAreaElement | null;
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  insert: string,
  selectRange?: [number, number],
) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  textarea.value = before + insert + after;

  const cursorPos = selectRange
    ? start + selectRange[0]
    : start + insert.length;
  textarea.focus();
  textarea.setSelectionRange(
    cursorPos,
    selectRange ? start + selectRange[1] : cursorPos,
  );
}

function IconUpload(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 16V4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 8l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 20h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconImageBlock(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M8 10.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5.5 18l6.2-6.2a1.2 1.2 0 0 1 1.7 0L18.5 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlignCenter(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 7h12M8 11h8M6 15h12M8 19h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBold(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 4h6a4 4 0 0 1 0 8H8V4Zm0 8h7a4 4 0 1 1 0 8H8v-8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconItalic(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 4h10M4 20h10M14 4l-4 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconLink(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconDivider(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 12h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 6v1M12 6v1M16 6v1M8 17v1M12 17v1M16 17v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconH2(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6v12M12 6v12M4 12h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 11a2 2 0 1 1 4 0c0 1-1 1.5-2 2.2-1 .7-2 1.2-2 2.8h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconBullets(props: Readonly<{ size?: number }>) {
  const s = props.size ?? 14;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 7h11M9 12h11M9 17h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M5 7h.01M5 12h.01M5 17h.01"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

type AudienceFilterKind =
  | "source"
  | "entitlementKey"
  | "entitlementExpiresWithinDays"
  | "joinedWithinDays"
  | "consentVersionMax"
  | "hasPurchased"
  | "purchasedWithinDays"
  | "engagedEventType"
  | "engagedWithinDays";

type AudienceFilter = {
  id: string;
  kind: AudienceFilterKind;
  value: string; // store as string for easy inputs; convert at enqueue-time
};

const FILTER_KIND_ORDER: AudienceFilterKind[] = [
  "source",
  "entitlementKey",
  "entitlementExpiresWithinDays",
  "joinedWithinDays",
  "consentVersionMax",
  "hasPurchased",
  "purchasedWithinDays",
  "engagedEventType",
  "engagedWithinDays",
];

function firstUnusedKind(rows: AudienceFilter[]): AudienceFilterKind {
  const used = new Set(rows.map((r) => r.kind));
  return FILTER_KIND_ORDER.find((k) => !used.has(k)) ?? "source";
}

type AudienceOptionsOk = {
  ok: true;
  sources: string[];
  entitlementKeys: string[];
  engagedEventTypes: string[];
  meta?: {
    sourcesLimit: number;
    entitlementKeysLimit: number;
    engagedEventTypesLimit: number;
  };
};

function isAudienceOptionsOk(x: unknown): x is AudienceOptionsOk {
  if (!isObject(x)) return false;
  return (
    x.ok === true &&
    Array.isArray((x as { sources?: unknown }).sources) &&
    Array.isArray((x as { entitlementKeys?: unknown }).entitlementKeys) &&
    Array.isArray((x as { engagedEventTypes?: unknown }).engagedEventTypes)
  );
}

// UI metadata
const FILTER_KIND_LABEL: Record<AudienceFilterKind, string> = {
  source: "Source",
  entitlementKey: "Entitlement",
  entitlementExpiresWithinDays: "Entitlement expires within (days)",
  joinedWithinDays: "Joined within (days)",
  consentVersionMax: "Consent version ≤",
  hasPurchased: "Has purchased",
  purchasedWithinDays: "Purchased within (days)",
  engagedEventType: "Engaged event type",
  engagedWithinDays: "Engaged within (days)",
};

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;

  throw new Error("Unable to create secure campaign composer id");
}

function isAudienceFilterKind(x: unknown): x is AudienceFilterKind {
  return (
    x === "source" ||
    x === "entitlementKey" ||
    x === "entitlementExpiresWithinDays" ||
    x === "joinedWithinDays" ||
    x === "consentVersionMax" ||
    x === "hasPurchased" ||
    x === "purchasedWithinDays" ||
    x === "engagedEventType" ||
    x === "engagedWithinDays"
  );
}

function parseAudienceFilter(x: unknown): AudienceFilter | null {
  if (!isObject(x)) return null;

  const idRaw = x.id;
  const kindRaw = x.kind;
  const valueRaw = x.value;

  if (!isAudienceFilterKind(kindRaw)) return null;

  return {
    id: typeof idRaw === "string" && idRaw ? idRaw : newId(),
    kind: kindRaw,
    value: typeof valueRaw === "string" ? valueRaw : "",
  };
}

function parseIntOrNull(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function toBoolOrNull(s: string): boolean | null {
  if (s === "true") return true;
  if (s === "false") return false;
  return null;
}

function buildEnqueueAudiencePayload(filters: AudienceFilter[]) {
  const out: Record<string, unknown> = {};

  for (const f of filters) {
    const v = (f.value ?? "").trim();
    if (!v && f.kind !== "hasPurchased") continue;

    switch (f.kind) {
      case "source":
      case "entitlementKey":
      case "engagedEventType":
        out[f.kind] = v || null;
        break;

      case "hasPurchased":
        out.hasPurchased = toBoolOrNull(v);
        break;

      case "entitlementExpiresWithinDays":
      case "joinedWithinDays":
      case "consentVersionMax":
      case "purchasedWithinDays":
      case "engagedWithinDays": {
        const n = parseIntOrNull(v);
        out[f.kind] = n;
        break;
      }
    }
  }

  return out;
}

// ---------- Upload response types + guards (hoisted; fixes hook deps warning) ----------
type UploadImageOk = { ok: true; key: string; url: string };
function isUploadImageOk(x: unknown): x is UploadImageOk {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { ok?: unknown }).ok === true &&
    typeof (x as { key?: unknown }).key === "string" &&
    typeof (x as { url?: unknown }).url === "string"
  );
}

type AudienceOptionsState = Readonly<{
  sources: string[];
  entitlementKeys: string[];
  engagedEventTypes: string[];
}>;

type DrainResultState = Readonly<{
  sent: number;
  remainingQueued: number;
  runId: string;
}> | null;

type SendStatus =
  | { state: "idle" }
  | {
      state: "sending";
      campaignId: string;
      totalSent: number;
      lastSent: number;
      remainingQueued: number;
      loops: number;
      startedAtMs: number;
      runId?: string;
    }
  | {
      state: "done";
      campaignId: string;
      totalSent: number;
      endedAtMs: number;
    }
  | { state: "cancelled"; campaignId: string; totalSent: number }
  | { state: "locked"; message: string }
  | { state: "error"; message: string };

const UI = {
  maxWidth: 1100,
  padOuter: 16,
  gap: 12,
  radius: 12,
  radiusSm: 10,
  font: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  surfaceBg: "rgba(255,255,255,0.06)",
  surfaceBorder: "rgba(255,255,255,0.14)",
  surfaceBgSoft: "rgba(255,255,255,0.035)",
  dangerBg: "rgba(176,0,32,0.12)",
  dangerBorder: "1px solid rgba(176,0,32,0.35)",
  dangerText: "#ffb3c0",
} as const;

const LABEL_LEFT_STYLE: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.7,
  marginBottom: 6,
};

const LABEL_RIGHT_STYLE: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  marginBottom: 6,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 8,
  borderRadius: UI.radiusSm,
  border: `1px solid ${UI.surfaceBorder}`,
  background: UI.surfaceBg,
  color: "inherit",
};

const PILL_STYLE: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: UI.radiusSm,
  background: "rgba(186,156,103,0.18)",
  border: "1px solid rgba(186,156,103,0.45)",
  color: "rgba(255,255,255,0.9)",
  fontSize: 13,
  fontWeight: 500,
};

const HAZARD_CARD_STYLE: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  border: "1px solid rgba(255,205,0,0.35)",
  background: "rgba(255,255,255,0.035)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
  overflow: "hidden",
};

const HAZARD_EDGE_STYLE: React.CSSProperties = {
  height: 10,
  opacity: 0.55,
  filter: "saturate(1.05)",
};

function softButtonStyle(
  opts?: Readonly<{ small?: boolean }>,
): React.CSSProperties {
  const small = Boolean(opts?.small);
  return {
    padding: small ? "8px 10px" : "10px 14px",
    borderRadius: UI.radiusSm,
    fontSize: small ? 10 : 13,
    background: "rgba(255,255,255,0.04)",
    border: `1px solid ${UI.surfaceBorder}`,
    color: "inherit",
    cursor: "pointer",
  };
}

function iconButtonStyle(): React.CSSProperties {
  return {
    width: 34,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: UI.radiusSm,
    border: `1px solid ${UI.surfaceBorder}`,
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    cursor: "pointer",
    padding: 0,
  };
}

function hazardStripe(angleDeg: number): string {
  return `repeating-linear-gradient(${angleDeg}deg,
    rgba(255, 205, 0, 0.95) 0px,
    rgba(255, 205, 0, 0.95) 10px,
    rgba(0, 0, 0, 0.95) 10px,
    rgba(0, 0, 0, 0.95) 20px
  )`;
}

function apiErrorText(error: Readonly<{ error: string; message?: string }>): string {
  return error.message ? `${error.error}: ${error.message}` : error.error;
}

function requireSuccessfulResponse<T>(
  response: Response,
  raw: unknown,
  isSuccess: (value: unknown) => value is T,
  failureLabel: string,
  unexpectedShapeMessage: string,
): T {
  if (!response.ok) {
    if (isApiErr(raw)) throw new Error(apiErrorText(raw));
    throw new Error(`${failureLabel} (${response.status})`);
  }

  if (isApiErr(raw)) throw new Error(apiErrorText(raw));
  if (!isSuccess(raw)) throw new Error(unexpectedShapeMessage);
  return raw;
}

type DrainFailure = Readonly<{
  code: unknown;
  message: string;
}>;

function readDrainFailure(raw: unknown): DrainFailure {
  if (!isObject(raw)) {
    return { code: undefined, message: "Drain failed" };
  }

  const code = raw.code;
  if (typeof raw.error === "string" && raw.error) {
    return { code, message: raw.error };
  }
  if (typeof raw.message === "string" && raw.message) {
    return { code, message: raw.message };
  }
  return { code, message: "Drain failed" };
}

type DrainBatchRequestResult =
  | Readonly<{ kind: "ok"; data: DrainOk }>
  | Readonly<{ kind: "locked"; message: string }>;

async function requestDrainBatch(args: Readonly<{
  campaignId: string;
  limit: number;
  signal: AbortSignal;
}>): Promise<DrainBatchRequestResult> {
  const response = await fetch("/api/admin/campaigns/drain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaignId: args.campaignId,
      limit: args.limit,
    }),
    signal: args.signal,
  });

  const raw = await readJson(response);

  if (!response.ok) {
    const failure = readDrainFailure(raw);
    if (response.status === 409 || failure.code === "CAMPAIGN_LOCKED") {
      return { kind: "locked", message: failure.message };
    }
    throw new Error(failure.message);
  }

  if (isApiErr(raw)) throw new Error(apiErrorText(raw));
  if (!isDrainOk(raw)) {
    throw new Error("Drain response had unexpected shape");
  }

  return { kind: "ok", data: raw };
}

function clearAbortRefIfCurrent(
  ref: { current: AbortController | null },
  controller: AbortController,
): void {
  if (ref.current === controller) ref.current = null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function finiteQueueCount(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

type LegacyMediaQueryList = Readonly<{
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}>;

function subscribeToMediaQuery(
  mediaQuery: MediaQueryList,
  listener: () => void,
): () => void {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  const legacyMediaQuery = mediaQuery as unknown as LegacyMediaQueryList;
  legacyMediaQuery.addListener?.(listener);
  return () => legacyMediaQuery.removeListener?.(listener);
}

function audienceFilterDropdown(
  kind: AudienceFilterKind,
  options: AudienceOptionsState,
): readonly string[] | null {
  if (kind === "source") return options.sources;
  if (kind === "entitlementKey") return options.entitlementKeys;
  if (kind === "engagedEventType") return options.engagedEventTypes;
  return null;
}

function isNumericAudienceFilterKind(kind: AudienceFilterKind): boolean {
  return (
    kind === "entitlementExpiresWithinDays" ||
    kind === "joinedWithinDays" ||
    kind === "consentVersionMax" ||
    kind === "purchasedWithinDays" ||
    kind === "engagedWithinDays"
  );
}

function audienceFilterPlaceholder(kind: AudienceFilterKind): string {
  if (kind === "source") return "e.g. early_access_form";
  if (kind === "entitlementKey") return "e.g. tier:patron";
  if (kind === "engagedEventType") return "e.g. played_track";
  return "Enter a value";
}

function dedupeAudienceFilters(rows: AudienceFilter[]): AudienceFilter[] {
  const deduped: AudienceFilter[] = [];
  const seen = new Set<AudienceFilterKind>();

  for (const row of rows) {
    if (seen.has(row.kind)) continue;
    seen.add(row.kind);
    deduped.push(row);
  }

  return deduped;
}

function updateAudienceFilterKind(
  rows: AudienceFilter[],
  index: number,
  kind: AudienceFilterKind,
): AudienceFilter[] {
  const next = rows.slice();
  const current = next[index];
  if (!current) return rows;

  next[index] = { id: current.id, kind, value: "" };
  return dedupeAudienceFilters(next);
}

function updateAudienceFilterValue(
  rows: AudienceFilter[],
  index: number,
  value: string,
): AudienceFilter[] {
  const next = rows.slice();
  const current = next[index];
  if (!current) return rows;

  next[index] = { ...current, value };
  return next;
}

function removeAudienceFilter(
  rows: AudienceFilter[],
  id: string,
): AudienceFilter[] {
  return rows.filter((row) => row.id !== id);
}

function SendStatusContent(
  props: Readonly<{
    sendStatus: SendStatus;
  }>,
) {
  const { sendStatus } = props;

  switch (sendStatus.state) {
    case "idle":
      return <div style={{ fontSize: 12, opacity: 0.8 }}>Ready.</div>;

    case "sending":
      return (
        <div style={{ fontSize: 12 }}>
          <div>
            <b>Sending…</b> Total sent: <b>{sendStatus.totalSent}</b> • Last
            batch: {sendStatus.lastSent} • Remaining queued:{" "}
            <b>
              {Number.isFinite(sendStatus.remainingQueued)
                ? sendStatus.remainingQueued
                : "—"}
            </b>{" "}
            • Batches: {sendStatus.loops}
          </div>
          {sendStatus.runId ? (
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
              runId:{" "}
              <code
                style={{
                  background: "transparent",
                  border: `1px solid ${UI.surfaceBorder}`,
                  padding: "1px 6px",
                  borderRadius: 6,
                }}
              >
                {sendStatus.runId}
              </code>
            </div>
          ) : null}
        </div>
      );

    case "done":
      return (
        <div style={{ fontSize: 12 }}>
          <b>Done.</b> Sent <b>{sendStatus.totalSent}</b> total.
        </div>
      );

    case "cancelled":
      return (
        <div style={{ fontSize: 12 }}>
          <b>Cancelled.</b> You can resume with auto-drain again.
        </div>
      );

    case "locked":
      return (
        <div style={{ fontSize: 12 }}>
          <b>Blocked:</b> {sendStatus.message}
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
            Another drain is likely running. Try again shortly.
          </div>
        </div>
      );

    case "error":
      return (
        <div style={{ fontSize: 12, color: "#ffb3c0" }}>
          <b>Error:</b> {sendStatus.message}
        </div>
      );
  }
}

function HazardZone(
  props: Readonly<{
    campaignId: string | null;
    enqueueing: boolean;
    draining: boolean;
    canEnqueue: boolean;
    audienceCount: number | null;
    sendStatus: SendStatus;
    enqueueError: string | null;
    drainError: string | null;
    drainResult: DrainResultState;
    onEnqueue: () => void;
    onSendAutoDrain: () => void;
    onCancelSending: () => void;
    onDrainOnce: (limit: number) => void;
  }>,
) {
  return (
    <div style={HAZARD_CARD_STYLE}>
      <div
        style={{ ...HAZARD_EDGE_STYLE, backgroundImage: hazardStripe(45) }}
      />

      <div style={{ padding: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.6,
              opacity: 0.92,
            }}
          >
            SEND CONTROLS{" "}
            <span style={{ marginLeft: 10, fontWeight: 500, opacity: 0.7 }}>
              Triggers real email activity.
            </span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Double-check count / copy / links
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={props.onEnqueue}
            disabled={props.enqueueing || props.draining || !props.canEnqueue}
            style={softButtonStyle()}
          >
            {props.enqueueing ? "Enqueueing…" : "Enqueue campaign"}
          </button>

          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Campaign ID:{" "}
            <code
              style={{
                background: UI.surfaceBg,
                border: `1px solid ${UI.surfaceBorder}`,
                padding: "2px 6px",
                borderRadius: 6,
              }}
            >
              {props.campaignId || "—"}
            </code>
          </div>

          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Mailable{" "}
            <b style={{ marginLeft: 6, opacity: 0.95 }}>
              {props.audienceCount ?? "—"}
            </b>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={props.onSendAutoDrain}
            disabled={!props.campaignId || props.enqueueing || props.draining}
            style={softButtonStyle()}
          >
            Send campaign (auto-drain)
          </button>

          <button
            type="button"
            onClick={props.onCancelSending}
            disabled={!props.draining}
            style={{
              ...softButtonStyle(),
              background: props.draining
                ? "rgba(176,0,32,0.10)"
                : undefined,
              border: props.draining
                ? "1px solid rgba(176,0,32,0.25)"
                : `1px solid ${UI.surfaceBorder}`,
            }}
          >
            Cancel
          </button>

          {[25, 50, 100].map((limit) => (
            <button
              key={limit}
              type="button"
              onClick={() => props.onDrainOnce(limit)}
              disabled={!props.campaignId || props.enqueueing || props.draining}
              style={softButtonStyle({ small: true })}
            >
              Drain {limit}
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: `1px solid ${UI.surfaceBorder}`,
            background: UI.surfaceBg,
          }}
        >
          <SendStatusContent sendStatus={props.sendStatus} />

          {props.enqueueError ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#ffb3c0" }}>
              <b>Enqueue error:</b> {props.enqueueError}
            </div>
          ) : null}

          {props.drainError ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#ffb3c0" }}>
              <b>Drain error:</b> {props.drainError}
            </div>
          ) : null}

          {props.drainResult ? (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
              Last drain: sent {props.drainResult.sent} • remaining{" "}
              {props.drainResult.remainingQueued} • runId{" "}
              <code>{props.drainResult.runId}</code>
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{ ...HAZARD_EDGE_STYLE, backgroundImage: hazardStripe(-45) }}
      />
    </div>
  );
}

function AudienceFilterValueControl(
  props: Readonly<{
    filter: AudienceFilter;
    index: number;
    audienceFilters: AudienceFilter[];
    audienceOptions: AudienceOptionsState;
    onChange: (next: AudienceFilter[]) => void;
  }>,
) {
  const { filter, index, audienceFilters, audienceOptions, onChange } = props;
  const kind = filter.kind;

  const updateValue = (value: string) => {
    onChange(updateAudienceFilterValue(audienceFilters, index, value));
  };

  if (kind === "hasPurchased") {
    return (
      <select
        value={filter.value}
        onChange={(event) => updateValue(event.target.value)}
        style={{
          ...INPUT_STYLE,
          padding: "8px 10px",
          fontSize: 12,
        }}
      >
        <option value="">(any)</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  const dropdown = audienceFilterDropdown(kind, audienceOptions);
  if (dropdown?.length) {
    return (
      <select
        value={filter.value}
        onChange={(event) => updateValue(event.target.value)}
        style={{
          ...INPUT_STYLE,
          padding: "8px 10px",
          fontSize: 12,
        }}
      >
        <option value="">(any)</option>
        {dropdown.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={filter.value}
      onChange={(event) => updateValue(event.target.value)}
      style={{
        ...INPUT_STYLE,
        padding: "8px 10px",
        fontSize: 12,
      }}
      inputMode={isNumericAudienceFilterKind(kind) ? "numeric" : undefined}
      placeholder={audienceFilterPlaceholder(kind)}
    />
  );
}

function AudienceFilterRow(
  props: Readonly<{
    filter: AudienceFilter;
    index: number;
    isNarrow: boolean;
    audienceFilters: AudienceFilter[];
    audienceOptions: AudienceOptionsState;
    onChange: (next: AudienceFilter[]) => void;
  }>,
) {
  const { filter, index, isNarrow, audienceFilters, audienceOptions, onChange } =
    props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isNarrow ? "1fr" : "1.1fr 1.4fr auto",
        gap: 8,
        alignItems: "center",
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <select
          value={filter.kind}
          onChange={(event) => {
            const nextKind = event.target.value as AudienceFilterKind;
            onChange(
              updateAudienceFilterKind(audienceFilters, index, nextKind),
            );
          }}
          style={{
            ...INPUT_STYLE,
            padding: "8px 10px",
            fontSize: 12,
          }}
        >
          {FILTER_KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {FILTER_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </div>

      <div style={{ minWidth: 0 }}>
        <AudienceFilterValueControl
          filter={filter}
          index={index}
          audienceFilters={audienceFilters}
          audienceOptions={audienceOptions}
          onChange={onChange}
        />
      </div>

      <button
        type="button"
        onClick={() => onChange(removeAudienceFilter(audienceFilters, filter.id))}
        title="Remove filter"
        aria-label="Remove filter"
        style={{
          ...softButtonStyle({ small: true }),
          padding: "8px 10px",
          opacity: 0.9,
          width: isNarrow ? "100%" : undefined,
        }}
      >
        Remove
      </button>
    </div>
  );
}

function AudienceFiltersSection(
  props: Readonly<{
    isNarrow: boolean;
    audienceCount: number | null;
    enqueuedCount: number | null;
    audienceFilters: AudienceFilter[];
    audienceOptions: AudienceOptionsState;
    audienceOptionsLoading: boolean;
    audienceOptionsErr: string | null;
    onFiltersChange: (next: AudienceFilter[]) => void;
    onRefreshAudienceOptions: () => Promise<void>;
  }>,
) {
  const addFilter = () => {
    const kind = firstUnusedKind(props.audienceFilters);
    props.onFiltersChange([
      ...props.audienceFilters,
      { id: newId(), kind, value: "" },
    ]);
  };

  const optionsTitle = props.audienceOptionsErr
    ? `Last error: ${props.audienceOptionsErr}`
    : "Reload filter dropdown options from DB";

  return (
    <div
      style={{
        padding: 12,
        borderRadius: UI.radius,
        marginTop: 10,
        marginBottom: 16,
        border: `1px solid ${UI.surfaceBorder}`,
        background: UI.surfaceBgSoft,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: props.isNarrow ? "stretch" : "flex-start",
          flexWrap: "wrap",
          flexDirection: props.isNarrow ? "column" : "row",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={PILL_STYLE}>
            Mailable Contacts{" "}
            <b style={{ marginLeft: 6 }}>{props.audienceCount ?? "—"}</b>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, paddingTop: 9 }}>
            Enqueued <b>{props.enqueuedCount ?? 0}</b> (this session)
          </div>
        </div>

        {!props.isNarrow ? <div style={{ flex: 1 }} /> : null}

        <div
          style={{
            minWidth: 0,
            width: "100%",
            maxWidth: props.isNarrow ? "100%" : 760,
            flex: props.isNarrow ? "1 1 auto" : "1 1 520px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: props.isNarrow ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 10,
                opacity: 0.75,
                letterSpacing: 0.4,
                paddingTop: 2,
              }}
            >
              AUDIENCE FILTERS
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                width: props.isNarrow ? "100%" : undefined,
                justifyContent: props.isNarrow ? "flex-start" : "flex-end",
              }}
            >
              <button
                type="button"
                style={softButtonStyle({ small: true })}
                onClick={addFilter}
              >
                + Add filter
              </button>

              <button
                type="button"
                style={softButtonStyle({ small: true })}
                onClick={() => void props.onRefreshAudienceOptions()}
                disabled={props.audienceOptionsLoading}
                title={optionsTitle}
              >
                {props.audienceOptionsLoading ? "Loading…" : "Refresh options"}
              </button>

              {props.audienceFilters.length > 0 ? (
                <button
                  type="button"
                  style={softButtonStyle({ small: true })}
                  onClick={() => props.onFiltersChange([])}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {props.audienceOptionsErr ? (
            <div style={{ marginTop: 8, fontSize: 11, color: "#ffb3c0" }}>
              Options load error: {props.audienceOptionsErr}
            </div>
          ) : null}

          <div style={{ height: 8 }} />

          {props.audienceFilters.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              No filters — sending to all marketing-opt-in contacts (minus
              suppressions).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {props.audienceFilters.map((filter, index) => (
                <AudienceFilterRow
                  key={filter.id}
                  filter={filter}
                  index={index}
                  isNarrow={props.isNarrow}
                  audienceFilters={props.audienceFilters}
                  audienceOptions={props.audienceOptions}
                  onChange={props.onFiltersChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CampaignComposerClient() {
  // Draft fields (local + sessionStorage)
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enqueue state
  const [enqueueing, setEnqueueing] = useState(false);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [enqueuedCount, setEnqueuedCount] = useState<number | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  // Audience filters (stackable)
  const [audienceFilters, setAudienceFilters] = useState<AudienceFilter[]>([]);
  const filtersSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audience options (DB-backed)
  const [audienceOptions, setAudienceOptions] = useState<AudienceOptionsState>({
    sources: [],
    entitlementKeys: [],
    engagedEventTypes: [],
  });
  const [audienceOptionsLoading, setAudienceOptionsLoading] = useState(false);
  const [audienceOptionsErr, setAudienceOptionsErr] = useState<string | null>(
    null,
  );

  const refreshAudienceOptions = useCallback(async () => {
    setAudienceOptionsLoading(true);
    setAudienceOptionsErr(null);

    try {
      const res = await fetch("/api/admin/campaigns/audience-options", {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      const raw = await readJson(res);
      const data = requireSuccessfulResponse(
        res,
        raw,
        isAudienceOptionsOk,
        "Failed to load audience options",
        "Audience options response had unexpected shape",
      );

      setAudienceOptions({
        sources: (data.sources ?? []).filter(
          (s) => typeof s === "string" && s.trim(),
        ),
        entitlementKeys: (data.entitlementKeys ?? []).filter(
          (s) => typeof s === "string" && s.trim(),
        ),
        engagedEventTypes: (data.engagedEventTypes ?? []).filter(
          (s) => typeof s === "string" && s.trim(),
        ),
      });
    } catch (e) {
      setAudienceOptionsErr(errorMessage(e));
    } finally {
      setAudienceOptionsLoading(false);
    }
  }, []);

  // Drain state (single flag that covers drainOnce + auto loop)
  const [draining, setDraining] = useState(false);
  const [drainError, setDrainError] = useState<string | null>(null);
  const [drainResult, setDrainResult] = useState<DrainResultState>(null);

  // Preview state (server-rendered via React Email)
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewErr, setPreviewErr] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const previewAbortRef = useRef<AbortController | null>(null);

  // Auto-drain cancellation + abort
  const drainAbortRef = useRef<AbortController | null>(null);
  const cancelSeqRef = useRef(0);

  // Optional: tune these defaults as needed
  const previewBrandName = "Angelfish Records MMXXVI";
  const previewUnsubscribeUrl = "";

  // Hydrate draft from sessionStorage
  useEffect(() => {
    const saved = safeJsonParse<Draft>(
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(DRAFT_KEY)
        : null,
    );
    if (saved && typeof saved === "object") {
      setDraft({
        campaignName: String(saved.campaignName ?? DEFAULT_DRAFT.campaignName),
        subjectTemplate: String(
          saved.subjectTemplate ?? DEFAULT_DRAFT.subjectTemplate,
        ),
        bodyTemplate: String(saved.bodyTemplate ?? DEFAULT_DRAFT.bodyTemplate),
        replyTo: String(saved.replyTo ?? ""),
      });
    }
  }, []);

  const persistDraftNow = useCallback((next: Draft) => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const persistAudienceFiltersNow = useCallback((next: AudienceFilter[]) => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(AUDIENCE_FILTERS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshAudienceOptions();
  }, [refreshAudienceOptions]);

  const setFiltersAndDebouncePersist = useCallback(
    (next: AudienceFilter[]) => {
      setAudienceFilters(next);
      if (filtersSaveTimer.current) clearTimeout(filtersSaveTimer.current);
      filtersSaveTimer.current = setTimeout(() => {
        persistAudienceFiltersNow(next);
      }, 250);
    },
    [persistAudienceFiltersNow],
  );

  const markDirtyAndDebouncePersist = useCallback(
    (next: Draft) => {
      setDraft(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        persistDraftNow(next);
      }, 350);
    },
    [persistDraftNow],
  );

  useEffect(() => {
    const savedFilters = safeJsonParse<unknown>(
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(AUDIENCE_FILTERS_KEY)
        : null,
    );

    if (!Array.isArray(savedFilters)) return;

    const parsed: AudienceFilter[] = [];
    for (const item of savedFilters) {
      const f = parseAudienceFilter(item);
      if (f) parsed.push(f);
    }

    if (parsed.length > 0) setAudienceFilters(parsed);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (filtersSaveTimer.current) clearTimeout(filtersSaveTimer.current);
      if (previewAbortRef.current) previewAbortRef.current.abort();
      if (drainAbortRef.current) drainAbortRef.current.abort();
    };
  }, []);

  const canEnqueue = useMemo(
    () =>
      draft.subjectTemplate.trim().length > 0 &&
      draft.bodyTemplate.trim().length > 0,
    [draft.bodyTemplate, draft.subjectTemplate],
  );

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadErr, setImageUploadErr] = useState<string | null>(null);
  const [lastImageUrl, setLastImageUrl] = useState<string | null>(null);

  const uploadImageFile = useCallback(
    async (file: File) => {
      setImageUploading(true);
      setImageUploadErr(null);

      try {
        const fd = new FormData();
        fd.append("file", file);

        const res = await fetch("/api/admin/campaigns/images/upload", {
          method: "POST",
          body: fd,
        });

        const raw = await readJson(res);
        const data = requireSuccessfulResponse(
          res,
          raw,
          isUploadImageOk,
          "Upload failed",
          "Upload response had unexpected shape",
        );

        const url = data.url;
        setLastImageUrl(url);

        const el = document.getElementById(
          "body-template",
        ) as HTMLTextAreaElement | null;
        if (!el) return;

        const base = (file.name || "image").replace(/\.[^.]+$/, "");
        const alt = base.trim() ? base : "image";

        const block = buildCenteredImageBlock({
          url,
          alt,
          maxWidthPx: 520, // "M" preset
        });

        // Select the alt text so we can quickly rename if we want.
        const altStart = block.indexOf(`alt="`) + `alt="`.length;
        const altEnd = block.indexOf(`"`, altStart);

        insertAtCursor(el, block, [altStart, altEnd]);
        markDirtyAndDebouncePersist({ ...draft, bodyTemplate: el.value });
      } catch (e) {
        setImageUploadErr(errorMessage(e));
      } finally {
        setImageUploading(false);
      }
    },
    [draft, markDirtyAndDebouncePersist],
  );

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    return subscribeToMediaQuery(mq, onChange);
  }, []);

  const refreshPreviewHtml = useCallback(async () => {
    if (previewAbortRef.current) previewAbortRef.current.abort();
    const ac = new AbortController();
    previewAbortRef.current = ac;

    setPreviewLoading(true);
    setPreviewErr("");

    try {
      const res = await fetch("/api/admin/campaigns/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandName: previewBrandName,
          subject: draft.subjectTemplate,
          bodyText: draft.bodyTemplate,
          unsubscribeUrl: previewUnsubscribeUrl || undefined,
        }),
        signal: ac.signal,
      });

      const raw = await readJson(res);
      const data = requireSuccessfulResponse(
        res,
        raw,
        isPreviewOk,
        "Preview failed",
        "Preview response had unexpected shape",
      );

      setPreviewHtml(data.html);
    } catch (e) {
      if (isAbortError(e)) return;
      setPreviewErr(errorMessage(e));
      setPreviewHtml("");
    } finally {
      if (previewAbortRef.current === ac) {
        previewAbortRef.current = null;
        setPreviewLoading(false);
      }
    }
  }, [
    draft.bodyTemplate,
    draft.subjectTemplate,
    previewBrandName,
    previewUnsubscribeUrl,
  ]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshPreviewHtml();
    }, 250);
    return () => window.clearTimeout(t);
  }, [refreshPreviewHtml]);

  const iframeSrcDoc = useMemo(() => {
    if (!previewHtml) return "";
    return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">${previewHtml}</body></html>`;
  }, [previewHtml]);

  const enqueue = useCallback(async () => {
    setEnqueueing(true);
    setEnqueueError(null);
    setDrainError(null);
    setDrainResult(null);

    persistDraftNow(draft);

    try {
      const res = await fetch("/api/admin/campaigns/enqueue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignName: draft.campaignName,
          subjectTemplate: draft.subjectTemplate,
          bodyTemplate: draft.bodyTemplate,
          replyTo: draft.replyTo.trim() ? draft.replyTo.trim() : null,
          ...buildEnqueueAudiencePayload(audienceFilters),
        }),
      });

      const raw = await readJson(res);
      const data = requireSuccessfulResponse(
        res,
        raw,
        isEnqueueOk,
        "Enqueue failed",
        "Enqueue response had unexpected shape",
      );

      setCampaignId(data.campaignId);
      setEnqueuedCount(data.enqueued);
      setAudienceCount(data.audienceCount);
    } catch (e: unknown) {
      setEnqueueError(errorMessage(e));
    } finally {
      setEnqueueing(false);
    }
  }, [draft, audienceFilters, persistDraftNow]);

  const drainOnce = useCallback(
    async (limit: number) => {
      if (!campaignId) return;
      if (draining) return;

      setDraining(true);
      setDrainError(null);

      try {
        const res = await fetch("/api/admin/campaigns/drain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ campaignId, limit }),
        });

        const raw = await readJson(res);
        const data = requireSuccessfulResponse(
          res,
          raw,
          isDrainOk,
          "Drain failed",
          "Drain response had unexpected shape",
        );

        setDrainResult({
          sent: data.sent,
          remainingQueued: data.remainingQueued,
          runId: data.runId,
        });
      } catch (e: unknown) {
        setDrainError(errorMessage(e));
      } finally {
        setDraining(false);
      }
    },
    [campaignId, draining],
  );

  const [sendStatus, setSendStatus] = useState<SendStatus>({ state: "idle" });

  const cancelSending = useCallback(() => {
    cancelSeqRef.current += 1;
    if (drainAbortRef.current) drainAbortRef.current.abort();
  }, []);

  const sleep = useCallback(async (ms: number, signal?: AbortSignal) => {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, ms);
      if (!signal) return;
      const onAbort = () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }, []);

  const sendAutoDrain = useCallback(
    async (opts?: { limit?: number; maxLoops?: number }) => {
      if (!campaignId) return;
      if (draining) return;

      drainAbortRef.current?.abort();

      const ac = new AbortController();
      drainAbortRef.current = ac;
      const myCancelSeq = cancelSeqRef.current;

      const limit = clampInt(opts?.limit ?? 50, 1, 100);
      const maxLoops = clampInt(opts?.maxLoops ?? 50, 1, 50);
      const startedAtMs = Date.now();

      // hoist so abort/cancel can report accurately
      let totalSent = 0;

      setDraining(true);
      setDrainError(null);
      setSendStatus({
        state: "sending",
        campaignId,
        totalSent: 0,
        lastSent: 0,
        remainingQueued: Number.NaN,
        loops: 0,
        startedAtMs,
      });

      try {
        let loops = 0;
        let remainingQueued = Infinity;
        let lastRunId: string | undefined;

        while (loops < maxLoops && remainingQueued > 0) {
          if (cancelSeqRef.current !== myCancelSeq) {
            setSendStatus({ state: "cancelled", campaignId, totalSent });
            return;
          }

          loops++;

          const batch = await requestDrainBatch({
            campaignId,
            limit,
            signal: ac.signal,
          });

          if (batch.kind === "locked") {
            setSendStatus({ state: "locked", message: batch.message });
            return;
          }

          const data = batch.data;
          const sentThis = data.sent;
          remainingQueued = data.remainingQueued;
          lastRunId = data.runId;

          totalSent += sentThis;

          setSendStatus({
            state: "sending",
            campaignId,
            totalSent,
            lastSent: sentThis,
            remainingQueued: finiteQueueCount(remainingQueued),
            loops,
            startedAtMs,
            runId: lastRunId,
          });

          setDrainResult({ sent: sentThis, remainingQueued, runId: lastRunId });

          const nextPollMs = clampInt(data.nextPollMs ?? 900, 0, 5000);
          await sleep(nextPollMs, ac.signal);
        }

        setSendStatus({
          state: "done",
          campaignId,
          totalSent,
          endedAtMs: Date.now(),
        });
      } catch (e: unknown) {
        if (isAbortError(e)) {
          setSendStatus({ state: "cancelled", campaignId, totalSent });
          return;
        }
        setSendStatus({ state: "error", message: errorMessage(e) });
      } finally {
        clearAbortRefIfCurrent(drainAbortRef, ac);
        setDraining(false);
      }
    },
    [campaignId, draining, sleep],
  );

  const reset = useCallback(() => {
    if (drainAbortRef.current) drainAbortRef.current.abort();
    setCampaignId(null);
    setEnqueuedCount(null);
    setAudienceCount(null);
    setDrainResult(null);
    setEnqueueError(null);
    setDrainError(null);
    setSendStatus({ state: "idle" });
  }, []);

  const hazardZone = (
    <HazardZone
      campaignId={campaignId}
      enqueueing={enqueueing}
      draining={draining}
      canEnqueue={canEnqueue}
      audienceCount={audienceCount}
      sendStatus={sendStatus}
      enqueueError={enqueueError}
      drainError={drainError}
      drainResult={drainResult}
      onEnqueue={() => {
        void enqueue();
      }}
      onSendAutoDrain={() => {
        void sendAutoDrain({ limit: 50, maxLoops: 50 });
      }}
      onCancelSending={cancelSending}
      onDrainOnce={(limit) => {
        void drainOnce(limit);
      }}
    />
  );

  return (
    <>
      <Head>
        <title>BJR Campaign Composer</title>
        <meta
          name="description"
          content="Internal tool for composing and sending BJR fan mailouts."
        />
      </Head>
      <div
        className="afAdminCampaignRoot"
        style={{
          maxWidth: UI.maxWidth,
          margin: "24px auto",
          padding: UI.padOuter,
          fontFamily: UI.font,
        }}
      >
        <div
          className="afAdminCampaignHeader"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            className="afAdminCampaignTitleRow"
            style={{ display: "flex", alignItems: "center", gap: 10 }}
          >
            <h1
              className="afAdminCampaignTitle"
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: -0.6,
                lineHeight: 1.05,
              }}
            >
              BJR Campaign Composer
            </h1>

            <a
              href="https://console.neon.tech/app/projects/purple-king-38858370"
              target="_blank"
              rel="noreferrer"
              title="Open Neon membership database"
              style={{
                display: "inline-flex",
                alignItems: "center",
                flex: "0 0 auto", // <- key: do not shrink/grow as flex item
                minWidth: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.brendanjohnroch.com/gfx/neon_logo.png"
                alt="Neon"
                style={{
                  height: 30,
                  width: "auto",
                  display: "block", // <- avoids inline image baseline weirdness
                  flex: "0 0 auto", // <- belt + braces for iOS
                  maxWidth: "none", // <- prevents “helpful” downscaling
                  objectFit: "contain", // <- if something *does* constrain, it won't distort
                  opacity: 0.9,
                }}
              />
            </a>
          </div>

          <div
            className="afAdminCampaignActions"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <button
              type="button"
              onClick={reset}
              disabled={enqueueing || draining}
              style={softButtonStyle()}
            >
              Reset session
            </button>

            <button
              type="button"
              onClick={() => void refreshPreviewHtml()}
              disabled={previewLoading}
              style={softButtonStyle()}
            >
              {previewLoading ? "Refreshing…" : "Refresh preview"}
            </button>
          </div>
        </div>

        <AudienceFiltersSection
          isNarrow={isNarrow}
          audienceCount={audienceCount}
          enqueuedCount={enqueuedCount}
          audienceFilters={audienceFilters}
          audienceOptions={audienceOptions}
          audienceOptionsLoading={audienceOptionsLoading}
          audienceOptionsErr={audienceOptionsErr}
          onFiltersChange={setFiltersAndDebouncePersist}
          onRefreshAudienceOptions={refreshAudienceOptions}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isNarrow ? "1fr" : "1fr 2fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          {/* LEFT */}
          <div style={{ padding: 12, borderRadius: 12, fontSize: 12 }}>
            <h2
              style={{
                marginTop: 0,
                marginBottom: 8,
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Compose
            </h2>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={LABEL_LEFT_STYLE}>Campaign name</div>
              <input
                value={draft.campaignName}
                onChange={(e) =>
                  markDirtyAndDebouncePersist({
                    ...draft,
                    campaignName: e.target.value,
                  })
                }
                style={INPUT_STYLE}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={LABEL_LEFT_STYLE}>Subject</div>
              <input
                value={draft.subjectTemplate}
                onChange={(e) =>
                  markDirtyAndDebouncePersist({
                    ...draft,
                    subjectTemplate: e.target.value,
                  })
                }
                style={INPUT_STYLE}
              />
            </label>

            <label style={{ display: "block", marginBottom: 10 }}>
              <div style={LABEL_LEFT_STYLE}>Body (Markdown)</div>

              <div
                style={{
                  border: `1px solid ${UI.surfaceBorder}`,
                  borderRadius: UI.radius,
                  overflow: "hidden",
                  background: UI.surfaceBg,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    padding: 8,
                    borderBottom: `1px solid ${UI.surfaceBorder}`,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    {
                      title: "Bold",
                      icon: <IconBold />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(el, "**bold text**", [2, 11]);
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Italic",
                      icon: <IconItalic />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(el, "*italic text*", [1, 12]);
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Link",
                      icon: <IconLink />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(el, "[link text](https://)", [1, 10]);
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Center (wrap selection)",
                      icon: <IconAlignCenter />,
                      run: () => {
                        const el = getBodyTextarea();
                        if (!el) return;

                        // Wrap selection, or insert starter block with selected inner text highlighted
                        wrapSelectionOrInsert(
                          el,
                          `<div style="text-align:center; margin: 12px 0;">\n  `,
                          `\n</div>`,
                          `Your text here…`,
                          true,
                        );

                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Image block (S)",
                      icon: <IconImageBlock />,
                      run: () => {
                        const el = getBodyTextarea();
                        if (!el) return;

                        const url = lastImageUrl ?? "URL_HERE";
                        const alt = "ALT_HERE";

                        const block = buildCenteredImageBlock({
                          url,
                          alt,
                          maxWidthPx: 360,
                        });

                        // Select the ALT text for quick edit
                        const altStart =
                          block.indexOf(`alt="`) + `alt="`.length;
                        const altEnd = block.indexOf(`"`, altStart);

                        insertAtCursor(el, block, [altStart, altEnd]);
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: imageUploading ? "Uploading…" : "Upload image",
                      icon: <IconUpload />,
                      run: () => {
                        if (imageUploading) return;
                        imageInputRef.current?.click();
                      },
                    },
                    {
                      title: "Divider",
                      icon: <IconDivider />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(el, "\n\n---\n\n");
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Heading",
                      icon: <IconH2 />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(el, "\n\n## Heading text\n\n", [4, 16]);
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                    {
                      title: "Bullets",
                      icon: <IconBullets />,
                      run: () => {
                        const el = document.getElementById(
                          "body-template",
                        ) as HTMLTextAreaElement | null;
                        if (!el) return;
                        insertAtCursor(
                          el,
                          "\n\n- Bullet one\n- Bullet two\n- Bullet three\n\n",
                          [4, 14],
                        );
                        markDirtyAndDebouncePersist({
                          ...draft,
                          bodyTemplate: el.value,
                        });
                      },
                    },
                  ].map((b) => (
                    <button
                      key={b.title}
                      type="button"
                      onClick={b.run}
                      title={b.title}
                      aria-label={b.title}
                      style={iconButtonStyle()}
                    >
                      {b.icon}
                    </button>
                  ))}

                  {/* Upload status row: uses imageUploadErr + lastImageUrl (fixes unused vars) */}
                  <div style={{ flex: 1 }} />

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: 11,
                      opacity: 0.85,
                    }}
                  >
                    {imageUploading ? (
                      <span style={{ opacity: 0.85 }}>Uploading…</span>
                    ) : null}

                    {imageUploadErr ? (
                      <span style={{ color: "#ffb3c0" }}>{imageUploadErr}</span>
                    ) : null}

                    {lastImageUrl ? (
                      <>
                        <a
                          href={lastImageUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "inherit",
                            textDecoration: "underline",
                          }}
                          title="Open last uploaded image"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            if (!lastImageUrl) return;
                            void navigator.clipboard?.writeText(lastImageUrl);
                          }}
                          style={{
                            ...iconButtonStyle(),
                            width: "auto",
                            padding: "0 10px",
                            fontSize: 11,
                          }}
                          title="Copy last URL"
                          aria-label="Copy last URL"
                        >
                          Copy URL
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (!f) return;
                    void uploadImageFile(f);
                  }}
                />

                <textarea
                  id="body-template"
                  value={draft.bodyTemplate}
                  onChange={(e) =>
                    markDirtyAndDebouncePersist({
                      ...draft,
                      bodyTemplate: e.target.value,
                    })
                  }
                  rows={18}
                  style={{
                    width: "100%",
                    padding: 12,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    color: "inherit",
                    fontFamily: UI.mono,
                    resize: "vertical",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                />
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
                Merge vars supported: <code>{"{{email}} {{member_id}}"}</code>
              </div>
            </label>

            {!isNarrow && hazardZone}
          </div>

          {/* RIGHT */}
          <div style={{ padding: 12, borderRadius: 12 }}>
            <h2
              style={{
                marginTop: 0,
                marginBottom: 8,
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Preview
            </h2>

            {previewErr ? (
              <div
                style={{
                  padding: 10,
                  borderRadius: UI.radiusSm,
                  background: UI.dangerBg,
                  border: UI.dangerBorder,
                  color: UI.dangerText,
                }}
              >
                <b>Preview error:</b> {previewErr}
              </div>
            ) : (
              <iframe
                className="afAdminCampaignPreview"
                title="email-preview"
                srcDoc={iframeSrcDoc}
                style={{
                  width: "100%",
                  height: 520,
                  border: `1px solid ${UI.surfaceBorder}`,
                  borderRadius: UI.radiusSm,
                  background: UI.surfaceBg,
                }}
                sandbox="allow-same-origin"
              />
            )}

            <div style={{ marginTop: 12 }}>
              <div style={LABEL_RIGHT_STYLE}>
                Rendered plaintext (stored in campaign body)
              </div>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  padding: 10,
                  borderRadius: UI.radiusSm,
                  background: UI.surfaceBg,
                  border: `1px solid ${UI.surfaceBorder}`,
                  margin: 0,
                  maxHeight: 260,
                  overflow: "auto",
                  fontSize: 10,
                  opacity: 0.78,
                  lineHeight: 1.45,
                }}
              >
                {draft.bodyTemplate}
              </pre>
            </div>
          </div>

          {isNarrow && hazardZone}
        </div>
      </div>
    </>
  );
}