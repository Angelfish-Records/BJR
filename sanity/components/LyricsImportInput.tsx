//web/sanity/components/LyricsImportInput.tsx
import React from "react";
import { Stack, Card, Text, Button, Flex } from "@sanity/ui";
import { set, unset, useFormValue, PatchEvent } from "sanity";
import type { ArrayOfObjectsInputProps, FormPatch } from "sanity";

type LyricCue = { tMs: number; text: string; endMs?: number };
type ImportPayload = { offsetMs?: number; cues: LyricCue[] };

function parseTimestampToMs(ts: string): number | null {
  // supports mm:ss.xx , mm:ss.xxx , hh:mm:ss.xx
  const s = ts.trim();
  const parts = s.split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const secPart = parts[parts.length - 1]!;
  const minPart = parts[parts.length - 2]!;
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

function parseLrc(text: string): { cues: LyricCue[]; offsetMs?: number } {
  const lines = text.split(/\r?\n/);
  const cues: LyricCue[] = [];

  // matches [mm:ss.xx]text (can be multiple timestamps per line)
  const timeTag =
    /\[([0-9]{1,2}:[0-9]{2}(?:\.[0-9]{1,3})?|[0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?)\]/g;

  // honour [offset: ...] if present (ms, may be negative)
  let globalOffsetMs: number | undefined;
  {
    const m = text.match(/^\[offset:\s*(-?\d+)\s*\]/im);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) globalOffsetMs = Math.trunc(n);
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // ignore metadata tags like [ar:], [ti:], [by:], [length:], etc.
    // NOTE: we already captured [offset:] above.
    if (/^\[[a-zA-Z]+:/.test(line)) continue;

    const times: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = timeTag.exec(line))) {
      const ms = parseTimestampToMs(m[1]!);
      if (ms != null) times.push(ms);
    }
    if (times.length === 0) continue;

    const textOnly = line.replace(timeTag, "").trim();
    if (!textOnly) continue; // ignore blank lyric lines like "[00:35.583]"

    for (const baseMs of times) {
      const tMs = baseMs + (globalOffsetMs ?? 0);
      if (tMs >= 0) cues.push({ tMs, text: textOnly });
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

    const out: LyricCue[] = [];
    for (const c of cuesVal) {
      if (!c || typeof c !== "object") return null;
      const cc = c as Record<string, unknown>;
      const tMs = cc.tMs;
      const textVal = cc.text;
      const endMs = cc.endMs;

      if (typeof tMs !== "number" || !Number.isFinite(tMs)) return null;
      if (typeof textVal !== "string") return null;

      const cue: LyricCue = { tMs: Math.floor(tMs), text: textVal };
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
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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

    let cues: LyricCue[] = [];
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

    const siblingOffset =
      asJson?.offsetMs != null
        ? asJson.offsetMs
        : offsetFromLrc != null
          ? offsetFromLrc
          : undefined;

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

      {/* Keep default editor so you can manually tweak after import */}
      {props.renderDefault(props)}
    </Stack>
  );
}
