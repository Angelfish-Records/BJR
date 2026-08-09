//web/sanity/components/LyricsImportInput.tsx
import React from "react";
import { Stack, Card, Text, Button, Flex } from "@sanity/ui";
import { set, unset, useFormValue, PatchEvent } from "sanity";
import type { ArrayOfObjectsInputProps, FormPatch } from "sanity";

type ImportLyricCue = { tMs: number; text: string; endMs?: number };
type ImportPayload = { offsetMs?: number; cues: ImportLyricCue[] };

const PARA_BREAK = "__PARA_BREAK__" as const;
const TIME_TAG_RE =
  /\[(\d{1,2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?)\]/g;
const OFFSET_TAG_RE = /^\[offset:\s*(-?\d+)\s*\]/im;
const METADATA_TAG_RE = /^\[[a-zA-Z]+:/;

function parseTimestampToMs(ts: string): number | null {
  // supports mm:ss.xx , mm:ss.xxx , hh:mm:ss.xx
  const s = ts.trim();
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const secPart = parts.at(-1)!;
  const minPart = parts.at(-2)!;
  const hourPart = parts.length === 3 ? parts[0]! : null;

  const mins = Number(minPart);
  if (!Number.isFinite(mins)) return null;

  let hours = 0;
  if (hourPart != null) {
    hours = Number(hourPart);
    if (!Number.isFinite(hours)) return null;
  }

  // seconds can have decimals
  const secs = Number(secPart);
  if (!Number.isFinite(secs)) return null;

  const ms = Math.round((hours * 3600 + mins * 60 + secs) * 1000);
  return ms >= 0 ? ms : null;
}

function parseGlobalOffsetMs(text: string): number | undefined {
  const match = OFFSET_TAG_RE.exec(text);
  if (!match) return undefined;

  const offset = Number(match[1]);
  if (!Number.isFinite(offset)) return undefined;

  return Math.trunc(offset);
}

function collectLineTimestamps(line: string): number[] {
  const times: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = TIME_TAG_RE.exec(line))) {
    const ms = parseTimestampToMs(match[1]!);
    if (ms != null) times.push(ms);
  }

  return times;
}

function parseLrc(text: string): { cues: ImportLyricCue[]; offsetMs?: number } {
  const lines = text.split(/\r?\n/);
  const cues: ImportLyricCue[] = [];
  const globalOffsetMs = parseGlobalOffsetMs(text);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // ignore metadata tags like [ar:], [ti:], [by:], [length:], etc.
    // NOTE: we already captured [offset:] above.
    if (METADATA_TAG_RE.test(line)) continue;

    const times = collectLineTimestamps(line);
    if (times.length === 0) continue;

    const textOnlyRaw = line.replace(TIME_TAG_RE, "");
    const textOnly = textOnlyRaw.trim();

    // IMPORTANT:
    // A timestamped blank line in LRC (e.g. "[00:35.583]") is meaningful for us:
    // it represents a paragraph break. Preserve it as a sentinel cue.
    const payloadText = textOnly || PARA_BREAK;

    for (const baseMs of times) {
      const tMs = baseMs + (globalOffsetMs ?? 0);
      if (tMs >= 0) cues.push({ tMs, text: payloadText });
    }
  }

  cues.sort((a, b) => a.tMs - b.tMs);
  return { cues, offsetMs: globalOffsetMs };
}

function tryParseJson(text: string): ImportPayload | null {
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== "object") return null;
    const obj = v as Record<string, unknown>;
    const cuesVal = obj.cues;
    if (!Array.isArray(cuesVal)) return null;

    const out: ImportLyricCue[] = [];
    for (const c of cuesVal) {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const tMs = cc.tMs;
      const textVal = cc.text;
      const endMs = cc.endMs;

      if (typeof tMs !== "number" || !Number.isFinite(tMs)) return null;
      if (typeof textVal !== "string") return null;

      const cue: ImportLyricCue = { tMs: Math.floor(tMs), text: textVal };
      if (typeof endMs === "number" && Number.isFinite(endMs))
        cue.endMs = Math.floor(endMs);
      out.push(cue);
    }

    out.sort((a, b) => a.tMs - b.tMs);

    const payload: ImportPayload = { cues: out };
    if (typeof obj.offsetMs === "number" && Number.isFinite(obj.offsetMs)) {
      payload.offsetMs = Math.floor(obj.offsetMs);
    }
    return payload;
  } catch {
    return null;
  }
}

function makeKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;

  throw new Error("Unable to create secure lyrics import key");
}

export default function LyricsImportInput(props: ArrayOfObjectsInputProps) {
  const { value, onChange } = props;

  // Pick ONE import field. This matches your schema's `importText`.
  const importText = (useFormValue(["importText"]) as string | undefined) ?? "";

  const [status, setStatus] = React.useState("");

  const apply = React.useCallback(() => {
    const src = importText.trim();
    if (!src) {
      setStatus("Nothing to import.");
      return;
    }

    const asJson = tryParseJson(src);

    let cues: ImportLyricCue[] = [];
    let offsetFromLrc: number | undefined;

    if (asJson) {
      cues = asJson.cues;
    } else {
      const parsed = parseLrc(src);
      cues = parsed.cues;
      offsetFromLrc = parsed.offsetMs;
    }

    if (!cues.length) {
      setStatus("Parsed 0 cues. Check formatting.");
      return;
    }

    const siblingOffset = asJson?.offsetMs ?? offsetFromLrc;

    const cuesWithKeys = cues.map((c) => ({
      _key: makeKey(),
      _type: "cue",
      tMs: c.tMs,
      text: c.text,
      ...(typeof c.endMs === "number" ? { endMs: c.endMs } : {}),
    }));

    const patches: FormPatch[] = [];
    patches.push(set(cuesWithKeys));

    if (siblingOffset != null) {
      patches.push(set(siblingOffset, ["..", "offsetMs"]));
    }

    onChange(PatchEvent.from(patches));

    const extra = siblingOffset != null ? ` (offset ${siblingOffset}ms)` : "";
    setStatus(`Imported ${cues.length} cues.${extra}`);
  }, [importText, onChange]);

  const clear = React.useCallback(() => {
    onChange(PatchEvent.from([unset()]));
    setStatus("Cleared cues.");
  }, [onChange]);

  return (
    <Stack space={3}>
      <Card padding={3} radius={2} tone="transparent" border>
        <Stack space={3}>
          <Text size={1} muted>
            Paste into <b>Import</b> field above, then click Apply. Supports LRC
            or JSON. LRC <code>[offset: …]</code> is honoured.
          </Text>

          <Flex gap={2}>
            <Button text="Apply import → Cues" tone="primary" onClick={apply} />
            <Button text="Clear cues" tone="critical" onClick={clear} />
          </Flex>

          {status ? (
            <Text size={1} muted>
              {status}
            </Text>
          ) : null}

          <Text size={1} muted>
            Current cues: {Array.isArray(value) ? value.length : 0}
          </Text>
        </Stack>
      </Card>

      {/* Keep default editor so we can manually tweak after import */}
      {props.renderDefault(props)}
    </Stack>
  );
}