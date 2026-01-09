// sanity/components/CuesImportInput.tsx
import React from 'react'
import {Stack, TextArea, Button, Card, Text, Inline, Code} from '@sanity/ui'
import {set, unset, type StringInputProps, PatchEvent} from 'sanity'

type LyricCue = {tMs: number; text: string; endMs?: number}

function isCue(x: unknown): x is LyricCue {
  if (!x || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.tMs === 'number' &&
    Number.isFinite(r.tMs) &&
    r.tMs >= 0 &&
    typeof r.text === 'string' &&
    r.text.trim().length > 0 &&
    (typeof r.endMs === 'undefined' || (typeof r.endMs === 'number' && Number.isFinite(r.endMs) && r.endMs >= 0))
  )
}

function normalizeCues(xs: unknown): LyricCue[] {
  if (!Array.isArray(xs)) return []
  const out: LyricCue[] = []
  for (const item of xs) if (isCue(item)) out.push({tMs: Math.floor(item.tMs), text: item.text.trim(), endMs: item.endMs})
  out.sort((a, b) => a.tMs - b.tMs)
  return out
}

function parseJsonOrLrc(input: string): {cues: LyricCue[]; offsetMs?: number; error?: string} {
  const s = input.trim()
  if (!s) return {cues: [], error: 'Paste JSON or LRC first.'}

  // JSON path: either [] or {offsetMs, cues}
  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const data = JSON.parse(s) as unknown
      if (Array.isArray(data)) return {cues: normalizeCues(data)}
      if (data && typeof data === 'object') {
        const rec = data as Record<string, unknown>
        const offsetMs = typeof rec.offsetMs === 'number' && Number.isFinite(rec.offsetMs) ? Math.floor(rec.offsetMs) : undefined
        const cues = normalizeCues(rec.cues)
        return {cues, offsetMs}
      }
      return {cues: [], error: 'JSON must be an array of cues, or {offsetMs, cues}.'}
    } catch {
      return {cues: [], error: 'Invalid JSON.'}
    }
  }

  // LRC path (very forgiving): [mm:ss.xx] line
  const lines = s.split(/\r?\n/)
  const cues: LyricCue[] = []
  const timeRe = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g
  for (const line of lines) {
    let m: RegExpExecArray | null
    const text = line.replace(timeRe, '').trim()
    while ((m = timeRe.exec(line))) {
      const mm = Number(m[1])
      const ss = Number(m[2])
      const frac = m[3] ?? '0'
      const ms =
        frac.length === 1 ? Number(frac) * 100 :
        frac.length === 2 ? Number(frac) * 10 :
        Number(frac.slice(0, 3))
      const tMs = (mm * 60 + ss) * 1000 + ms
      if (text) cues.push({tMs, text})
    }
  }
  cues.sort((a, b) => a.tMs - b.tMs)
  return cues.length ? {cues} : {cues: [], error: 'No LRC timestamps found.'}
}

export default function CuesImportInput(props: StringInputProps) {
  const {value, onChange} = props
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  const apply = () => {
    setErr(null)
    setOk(null)

    const raw = (value ?? '').toString()
    const res = parseJsonOrLrc(raw)
    if (res.error) {
      setErr(res.error)
      return
    }
    if (!res.cues.length) {
      setErr('No cues parsed.')
      return
    }

    // Patch BOTH cues[] and (optionally) offsetMs at the document root.
    const patches = [
      set(res.cues, ['cues']),
    ]

    if (typeof res.offsetMs === 'number') {
      patches.push(set(res.offsetMs, ['offsetMs']))
    }

    onChange(PatchEvent.from(patches))
    setOk(`Applied ${res.cues.length} cues${typeof res.offsetMs === 'number' ? ` and offsetMs=${res.offsetMs}` : ''}.`)
  }

  return (
    <Stack space={3}>
      <TextArea
        value={(value ?? '').toString()}
        onChange={(e) => {
          setErr(null)
          setOk(null)
          onChange(PatchEvent.from(e.currentTarget.value ? set(e.currentTarget.value) : unset()))
        }}
        rows={8}
        placeholder={`Paste JSON:\n[\n  {"tMs": 1200, "text":"…"},\n  {"tMs": 3400, "text":"…"}\n]\n\nOr:\n{"offsetMs": -120, "cues":[...]}\n\nOr LRC:\n[00:12.30] line`}
      />

      <Inline space={2}>
        <Button text="Apply to cues" tone="primary" onClick={apply} />
      </Inline>

      {err ? (
        <Card padding={3} radius={2} tone="critical">
          <Text size={1}>{err}</Text>
        </Card>
      ) : null}

      {ok ? (
        <Card padding={3} radius={2} tone="positive">
          <Text size={1}>{ok}</Text>
        </Card>
      ) : null}

      <Card padding={3} radius={2} tone="transparent">
        <Text size={1} muted>
          Output format remains canonical in <Code>cues[]</Code>, so your site code stays stable.
        </Text>
      </Card>
    </Stack>
  )
}
