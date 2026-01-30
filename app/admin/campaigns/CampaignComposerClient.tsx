// web/app/admin/campaigns/CampaignComposerClient.tsx
'use client'

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'

type EnqueueOk = {
  ok: true
  campaignId: string
  enqueued: number
  audienceCount: number
}

type DrainOk = {
  ok: true
  sent: number
  remainingQueued: number
  nextPollMs: number
  runId: string
}

type ApiErr = {
  ok?: false
  error: string
  message?: string
  runId?: string
  code?: string
}

type EnqueueResponse = EnqueueOk | ApiErr
type DrainResponse = DrainOk | ApiErr

type PreviewOk = {ok: true; subject: string; html: string}
type PreviewResponse = PreviewOk | ApiErr

const DRAFT_KEY = 'bjr_campaign_draft_v1'

type Draft = {
  campaignName: string
  subjectTemplate: string
  bodyTemplate: string
  replyTo: string
  source: string
}

const DEFAULT_DRAFT: Draft = {
  campaignName: 'New campaign',
  subjectTemplate: 'A note from Brendan',
  bodyTemplate: 'Write the email…',
  replyTo: '',
  source: '',
}

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function isApiErr(x: unknown): x is ApiErr {
  return isObject(x) && typeof x.error === 'string'
}

function isEnqueueOk(x: unknown): x is EnqueueOk {
  if (!isObject(x)) return false
  return x.ok === true && typeof x.campaignId === 'string' && typeof x.enqueued === 'number' && typeof x.audienceCount === 'number'
}

function isDrainOk(x: unknown): x is DrainOk {
  if (!isObject(x)) return false
  return (
    x.ok === true &&
    typeof x.sent === 'number' &&
    typeof x.remainingQueued === 'number' &&
    typeof x.nextPollMs === 'number' &&
    typeof x.runId === 'string'
  )
}

function isPreviewOk(x: unknown): x is PreviewOk {
  if (!isObject(x)) return false
  return x.ok === true && typeof x.subject === 'string' && typeof x.html === 'string'
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return {error: 'Invalid JSON from server', message: text}
  }
}

// --- toolbar helpers (browser-only, but safe in client comp) ---
function handleUndoRedoKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const key = e.key.toLowerCase()

  const isUndo = (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && key === 'z'
  const isRedo = ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && key === 'z') || (!isMac && e.ctrlKey && !e.shiftKey && key === 'y')
  if (!isUndo && !isRedo) return

  e.preventDefault()
  try {
    document.execCommand(isUndo ? 'undo' : 'redo')
  } catch {
    // ignore
  }
}

function insertAtCursor(textarea: HTMLTextAreaElement, insert: string, selectRange?: [number, number]) {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)

  textarea.value = before + insert + after

  const cursorPos = selectRange ? start + selectRange[0] : start + insert.length
  textarea.focus()
  textarea.setSelectionRange(cursorPos, selectRange ? start + selectRange[1] : cursorPos)
}

function IconBold(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h6a4 4 0 0 1 0 8H8V4Zm0 8h7a4 4 0 1 1 0 8H8v-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
function IconItalic(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 4h10M4 20h10M14 4l-4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconLink(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconImage(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10a1.5 1.5 0 1 0 0.001 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}
function IconDivider(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6v1M12 6v1M16 6v1M8 17v1M12 17v1M16 17v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconH2(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6v12M12 6v12M4 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 11a2 2 0 1 1 4 0c0 1-1 1.5-2 2.2-1 .7-2 1.2-2 2.8h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function IconBullets(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 7h11M9 12h11M9 17h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 7h.01M5 12h.01M5 17h.01" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export default function CampaignComposerClient() {
  // Draft fields (local + sessionStorage)
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Enqueue state
  const [enqueueing, setEnqueueing] = useState(false)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [enqueuedCount, setEnqueuedCount] = useState<number | null>(null)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Drain state (single flag that covers drainOnce + auto loop)
  const [draining, setDraining] = useState(false)
  const [drainError, setDrainError] = useState<string | null>(null)
  const [drainResult, setDrainResult] = useState<{sent: number; remainingQueued: number; runId: string} | null>(null)

  // Preview state (server-rendered via React Email)
  const [previewHtml, setPreviewHtml] = useState<string>('')
  const [previewErr, setPreviewErr] = useState<string>('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const previewAbortRef = useRef<AbortController | null>(null)

  // Auto-drain cancellation + abort
  const drainAbortRef = useRef<AbortController | null>(null)
  const cancelSeqRef = useRef(0)

  // Optional: tune these defaults as you like
  const previewBrandName = 'Brendan John Roch'
  const previewLogoUrl = '' // put a real URL if you want a logo in preview
  const previewUnsubscribeUrl = '' // optional: keep blank unless you want it shown

  // Hydrate draft from sessionStorage
  useEffect(() => {
    const saved = safeJsonParse<Draft>(typeof window !== 'undefined' ? window.sessionStorage.getItem(DRAFT_KEY) : null)
    if (saved && typeof saved === 'object') {
      setDraft({
        campaignName: String(saved.campaignName ?? DEFAULT_DRAFT.campaignName),
        subjectTemplate: String(saved.subjectTemplate ?? DEFAULT_DRAFT.subjectTemplate),
        bodyTemplate: String(saved.bodyTemplate ?? DEFAULT_DRAFT.bodyTemplate),
        replyTo: String(saved.replyTo ?? ''),
        source: String(saved.source ?? ''),
      })
    }
  }, [])

  const persistDraftNow = useCallback((next: Draft) => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }, [])

  const markDirtyAndDebouncePersist = useCallback(
    (next: Draft) => {
      setDraft(next)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        persistDraftNow(next)
      }, 350)
    },
    [persistDraftNow]
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (previewAbortRef.current) previewAbortRef.current.abort()
      if (drainAbortRef.current) drainAbortRef.current.abort()
    }
  }, [])

  const canEnqueue = useMemo(
    () => draft.subjectTemplate.trim().length > 0 && draft.bodyTemplate.trim().length > 0,
    [draft.bodyTemplate, draft.subjectTemplate]
  )

  // --- styling helpers (match your prior "hazard zone" look) ---
  const surfaceBg = 'rgba(255,255,255,0.06)'
  const surfaceBorder = 'rgba(255,255,255,0.14)'
  const inputStyle: React.CSSProperties = useMemo(
    () => ({
      width: '100%',
      padding: 10,
      borderRadius: 10,
      border: `1px solid ${surfaceBorder}`,
      background: surfaceBg,
      color: 'inherit',
    }),
    [surfaceBorder, surfaceBg]
  )

  const hazardStripe = useCallback(
    (angleDeg: number) =>
      `repeating-linear-gradient(${angleDeg}deg,
        rgba(255, 205, 0, 0.95) 0px,
        rgba(255, 205, 0, 0.95) 10px,
        rgba(0, 0, 0, 0.95) 10px,
        rgba(0, 0, 0, 0.95) 20px
      )`,
    []
  )

  const hazardCardStyle = useMemo<React.CSSProperties>(
    () => ({
      marginTop: 14,
      borderRadius: 14,
      border: `1px solid rgba(255,205,0,0.35)`,
      background: 'rgba(255,255,255,0.035)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      overflow: 'hidden',
    }),
    []
  )

  const hazardEdgeStyle = useMemo<React.CSSProperties>(
    () => ({
      height: 10,
      opacity: 0.55,
      filter: 'saturate(1.05)',
    }),
    []
  )

  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)')
    const onChange = () => setIsNarrow(mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  const refreshPreviewHtml = useCallback(async () => {
    // Abort any in-flight preview request (cuts server load)
    if (previewAbortRef.current) previewAbortRef.current.abort()
    const ac = new AbortController()
    previewAbortRef.current = ac

    setPreviewLoading(true)
    setPreviewErr('')

    try {
      const res = await fetch('/api/admin/campaigns/preview', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          brandName: previewBrandName,
          logoUrl: previewLogoUrl || undefined,
          subject: draft.subjectTemplate,
          bodyText: draft.bodyTemplate,
          unsubscribeUrl: previewUnsubscribeUrl || undefined,
        }),
        signal: ac.signal,
      })

      const raw = await readJson(res)
      const data: PreviewResponse | null = raw as PreviewResponse | null

      if (!res.ok) {
        if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
        throw new Error(`Preview failed (${res.status})`)
      }

      if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
      if (!isPreviewOk(data)) throw new Error('Preview response had unexpected shape')

      setPreviewHtml(data.html)
    } catch (e) {
      // ignore aborts (user typed / refreshed quickly)
      if (e instanceof DOMException && e.name === 'AbortError') return
      setPreviewErr(errorMessage(e))
      setPreviewHtml('')
    } finally {
      // Only clear if we're still the current controller
      if (previewAbortRef.current === ac) {
        previewAbortRef.current = null
        setPreviewLoading(false)
      }
    }
  }, [draft.bodyTemplate, draft.subjectTemplate, previewBrandName, previewLogoUrl, previewUnsubscribeUrl])

  // Debounce preview refresh on subject/body changes
  useEffect(() => {
    const t = window.setTimeout(() => {
      void refreshPreviewHtml()
    }, 250)
    return () => window.clearTimeout(t)
  }, [refreshPreviewHtml])

  const iframeSrcDoc = useMemo(() => {
    if (!previewHtml) return ''
    return `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;">${previewHtml}</body></html>`
  }, [previewHtml])

  const enqueue = useCallback(async () => {
    setEnqueueing(true)
    setEnqueueError(null)
    setDrainError(null)
    setDrainResult(null)

    persistDraftNow(draft)

    try {
      const res = await fetch('/api/admin/campaigns/enqueue', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          campaignName: draft.campaignName,
          subjectTemplate: draft.subjectTemplate,
          bodyTemplate: draft.bodyTemplate,
          replyTo: draft.replyTo.trim() ? draft.replyTo.trim() : null,
          source: draft.source.trim() ? draft.source.trim() : null,
        }),
      })

      const raw = await readJson(res)
      const data: EnqueueResponse | null = raw as EnqueueResponse | null

      if (!res.ok) {
        if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
        throw new Error(`Enqueue failed (${res.status})`)
      }

      if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
      if (!isEnqueueOk(data)) throw new Error('Enqueue response had unexpected shape')

      setCampaignId(data.campaignId)
      setEnqueuedCount(data.enqueued)
      setAudienceCount(data.audienceCount)
    } catch (e: unknown) {
      setEnqueueError(errorMessage(e))
    } finally {
      setEnqueueing(false)
    }
  }, [draft, persistDraftNow])

  const drainOnce = useCallback(
    async (limit: number) => {
      if (!campaignId) return
      if (draining) return

      setDraining(true)
      setDrainError(null)

      try {
        const res = await fetch('/api/admin/campaigns/drain', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({campaignId, limit}),
        })

        const raw = await readJson(res)
        const data: DrainResponse | null = raw as DrainResponse | null

        if (!res.ok) {
          if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
          throw new Error(`Drain failed (${res.status})`)
        }

        if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
        if (!isDrainOk(data)) throw new Error('Drain response had unexpected shape')

        setDrainResult({sent: data.sent, remainingQueued: data.remainingQueued, runId: data.runId})
      } catch (e: unknown) {
        setDrainError(errorMessage(e))
      } finally {
        setDraining(false)
      }
    },
    [campaignId, draining]
  )

  // Auto-drain loop status
  const [sendStatus, setSendStatus] = useState<
    | {state: 'idle'}
    | {state: 'sending'; campaignId: string; totalSent: number; lastSent: number; remainingQueued: number; loops: number; startedAtMs: number; runId?: string}
    | {state: 'done'; campaignId: string; totalSent: number; endedAtMs: number}
    | {state: 'cancelled'; campaignId: string; totalSent: number}
    | {state: 'locked'; message: string}
    | {state: 'error'; message: string}
  >({state: 'idle'})

  const cancelSending = useCallback(() => {
    cancelSeqRef.current += 1
    if (drainAbortRef.current) drainAbortRef.current.abort()
  }, [])

  const sleep = useCallback(async (ms: number, signal?: AbortSignal) => {
    if (ms <= 0) return
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, ms)
      if (!signal) return
      const onAbort = () => {
        window.clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, {once: true})
    })
  }, [])

  const sendAutoDrain = useCallback(
    async (opts?: {limit?: number; maxLoops?: number}) => {
      if (!campaignId) return
      if (draining) return

      // Abort any prior run
      if (drainAbortRef.current) drainAbortRef.current.abort()

      const ac = new AbortController()
      drainAbortRef.current = ac
      const myCancelSeq = cancelSeqRef.current

      const limit = clampInt(opts?.limit ?? 50, 1, 100)
      const maxLoops = clampInt(opts?.maxLoops ?? 50, 1, 50)
      const startedAtMs = Date.now()

      setDraining(true)
      setDrainError(null)
      setSendStatus({state: 'sending', campaignId, totalSent: 0, lastSent: 0, remainingQueued: Number.NaN, loops: 0, startedAtMs})

      try {
        let totalSent = 0
        let loops = 0
        let remainingQueued = Infinity
        let lastRunId: string | undefined

        while (loops < maxLoops && remainingQueued > 0) {
          if (cancelSeqRef.current !== myCancelSeq) {
            setSendStatus({state: 'cancelled', campaignId, totalSent})
            return
          }

          loops++

          const res = await fetch('/api/admin/campaigns/drain', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({campaignId, limit}),
            signal: ac.signal,
          })

          const raw = await readJson(res)

          if (!res.ok) {
            const code = isObject(raw) ? (raw as {code?: unknown}).code : undefined
            const err = isObject(raw) ? (raw as {error?: unknown; message?: unknown}).error : undefined
            const msg =
              (typeof err === 'string' && err) ||
              (isObject(raw) && typeof (raw as {message?: unknown}).message === 'string' ? (raw as {message: string}).message : '') ||
              'Drain failed'

            if (res.status === 409 || code === 'CAMPAIGN_LOCKED') {
              setSendStatus({state: 'locked', message: msg})
              return
            }

            throw new Error(msg)
          }

          const data: DrainResponse | null = raw as DrainResponse | null
          if (isApiErr(data)) throw new Error(`${data.error}${data.message ? `: ${data.message}` : ''}`)
          if (!isDrainOk(data)) throw new Error('Drain response had unexpected shape')

          const sentThis = data.sent
          remainingQueued = data.remainingQueued
          lastRunId = data.runId

          totalSent += sentThis

          setSendStatus({
            state: 'sending',
            campaignId,
            totalSent,
            lastSent: sentThis,
            remainingQueued: Number.isFinite(remainingQueued) ? remainingQueued : 0,
            loops,
            startedAtMs,
            runId: lastRunId,
          })

          setDrainResult({sent: sentThis, remainingQueued, runId: lastRunId})

          if (remainingQueued <= 0) break

          const nextPollMs = clampInt(data.nextPollMs ?? 900, 0, 5000)
          await sleep(nextPollMs, ac.signal)
        }

        setSendStatus({state: 'done', campaignId, totalSent, endedAtMs: Date.now()})
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setSendStatus({state: 'cancelled', campaignId, totalSent: 0})
          return
        }
        setSendStatus({state: 'error', message: errorMessage(e)})
      } finally {
        if (drainAbortRef.current === ac) drainAbortRef.current = null
        setDraining(false)
      }
    },
    [campaignId, draining, sleep]
  )

  const reset = useCallback(() => {
    if (drainAbortRef.current) drainAbortRef.current.abort()
    setCampaignId(null)
    setEnqueuedCount(null)
    setAudienceCount(null)
    setDrainResult(null)
    setEnqueueError(null)
    setDrainError(null)
    setSendStatus({state: 'idle'})
  }, [])

  const hazardZone = useMemo(() => {
    return (
      <div style={hazardCardStyle}>
        <div style={{...hazardEdgeStyle, backgroundImage: hazardStripe(45)}} />

        <div style={{padding: 12}}>
          <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
            <div style={{fontSize: 12, fontWeight: 700, letterSpacing: 0.6, opacity: 0.92}}>
              SEND CONTROLS <span style={{marginLeft: 10, fontWeight: 500, opacity: 0.7}}>Triggers real email activity.</span>
            </div>
            <div style={{fontSize: 11, opacity: 0.75}}>Double-check count / copy / links</div>
          </div>

          <div style={{height: 10}} />

          <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
            <button onClick={() => void enqueue()} disabled={enqueueing || draining || !canEnqueue} style={{padding: '10px 14px', borderRadius: 10}}>
              {enqueueing ? 'Enqueueing…' : 'Enqueue campaign'}
            </button>

            <div style={{fontSize: 12, opacity: 0.85}}>
              Campaign ID:{' '}
              <code style={{background: surfaceBg, border: `1px solid ${surfaceBorder}`, padding: '2px 6px', borderRadius: 6}}>
                {campaignId || '—'}
              </code>
            </div>

            <div style={{fontSize: 12, opacity: 0.85}}>
              Mailable:{' '}
              <b style={{marginLeft: 6}}>{audienceCount ?? '—'}</b>
            </div>
          </div>

          <div style={{marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
            <button
              onClick={() => void sendAutoDrain({limit: 50, maxLoops: 50})}
              disabled={!campaignId || enqueueing || draining}
              style={{padding: '10px 14px', borderRadius: 10}}
            >
              Send campaign (auto-drain)
            </button>

            <button onClick={cancelSending} disabled={!draining} style={{padding: '10px 14px', borderRadius: 10}}>
              Cancel
            </button>

            <button onClick={() => void drainOnce(25)} disabled={!campaignId || enqueueing || draining} style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}>
              Drain 25
            </button>
            <button onClick={() => void drainOnce(50)} disabled={!campaignId || enqueueing || draining} style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}>
              Drain 50
            </button>
            <button onClick={() => void drainOnce(100)} disabled={!campaignId || enqueueing || draining} style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}>
              Drain 100
            </button>
          </div>

          <div style={{marginTop: 10, padding: 10, borderRadius: 12, border: `1px solid ${surfaceBorder}`, background: surfaceBg}}>
            {sendStatus.state === 'idle' && <div style={{fontSize: 12, opacity: 0.8}}>Ready.</div>}

            {sendStatus.state === 'sending' && (
              <div style={{fontSize: 12}}>
                <div>
                  <b>Sending…</b> Total sent: <b>{sendStatus.totalSent}</b> • Last batch: {sendStatus.lastSent} • Remaining queued:{' '}
                  <b>{Number.isFinite(sendStatus.remainingQueued) ? sendStatus.remainingQueued : '—'}</b> • Batches: {sendStatus.loops}
                </div>
                {sendStatus.runId ? (
                  <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>
                    runId:{' '}
                    <code style={{background: 'transparent', border: `1px solid ${surfaceBorder}`, padding: '1px 6px', borderRadius: 6}}>
                      {sendStatus.runId}
                    </code>
                  </div>
                ) : null}
              </div>
            )}

            {sendStatus.state === 'done' && (
              <div style={{fontSize: 12}}>
                <b>Done.</b> Sent <b>{sendStatus.totalSent}</b> total.
              </div>
            )}

            {sendStatus.state === 'cancelled' && (
              <div style={{fontSize: 12}}>
                <b>Cancelled.</b> You can resume with auto-drain again.
              </div>
            )}

            {sendStatus.state === 'locked' && (
              <div style={{fontSize: 12}}>
                <b>Blocked:</b> {sendStatus.message}
                <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>Another drain is likely running. Try again shortly.</div>
              </div>
            )}

            {sendStatus.state === 'error' && (
              <div style={{fontSize: 12, color: '#ffb3c0'}}>
                <b>Error:</b> {sendStatus.message}
              </div>
            )}

            {enqueueError ? (
              <div style={{marginTop: 8, fontSize: 12, color: '#ffb3c0'}}>
                <b>Enqueue error:</b> {enqueueError}
              </div>
            ) : null}
            {drainError ? (
              <div style={{marginTop: 8, fontSize: 12, color: '#ffb3c0'}}>
                <b>Drain error:</b> {drainError}
              </div>
            ) : null}
            {drainResult ? (
              <div style={{marginTop: 8, fontSize: 11, opacity: 0.8}}>
                Last drain: sent {drainResult.sent} • remaining {drainResult.remainingQueued} • runId <code>{drainResult.runId}</code>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{...hazardEdgeStyle, backgroundImage: hazardStripe(-45)}} />
      </div>
    )
  }, [
    hazardCardStyle,
    hazardEdgeStyle,
    hazardStripe,
    enqueue,
    enqueueing,
    draining,
    sendStatus,
    canEnqueue,
    campaignId,
    audienceCount,
    cancelSending,
    drainOnce,
    sendAutoDrain,
    surfaceBg,
    surfaceBorder,
    enqueueError,
    drainError,
    drainResult,
  ])

  return (
    <div style={{maxWidth: 1100, margin: '24px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'}}>
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
        <div>
          <div style={{fontSize: 12, opacity: 0.7}}>Campaigns</div>
          <h1 style={{margin: 0}}>Composer</h1>
          <div style={{fontSize: 12, opacity: 0.7, marginTop: 6}}>Draft stays local until you enqueue. Preview is server-rendered from your React Email template.</div>
        </div>

        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <button onClick={reset} disabled={enqueueing || draining} style={{padding: '10px 14px', borderRadius: 10}}>
            Reset session
          </button>

          <button onClick={() => void refreshPreviewHtml()} disabled={previewLoading} style={{padding: '10px 14px', borderRadius: 10}}>
            {previewLoading ? 'Refreshing…' : 'Refresh preview'}
          </button>
        </div>
      </div>

      <div style={{padding: 12, borderRadius: 12, marginTop: 10, marginBottom: 16}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(186,156,103,0.18)',
              border: '1px solid rgba(186,156,103,0.45)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Mailable Contacts <b style={{marginLeft: 6}}>{audienceCount ?? '—'}</b>
          </div>

          <div style={{fontSize: 12, opacity: 0.75}}>
            Enqueued <b>{enqueuedCount ?? 0}</b> (this session)
          </div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 2fr', gap: 16, alignItems: 'start'}}>
        {/* LEFT */}
        <div style={{padding: 12, borderRadius: 12, fontSize: 14}}>
          <h2 style={{marginTop: 0, marginBottom: 8, fontSize: 18}}>Compose</h2>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={{fontSize: 10, opacity: 0.7, marginBottom: 6}}>Campaign name</div>
            <input value={draft.campaignName} onChange={(e) => markDirtyAndDebouncePersist({...draft, campaignName: e.target.value})} style={inputStyle} />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={{fontSize: 10, opacity: 0.7, marginBottom: 6}}>Reply-To (optional)</div>
            <input
              value={draft.replyTo}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, replyTo: e.target.value})}
              style={inputStyle}
              placeholder="admin@brendanjohnroch.com"
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={{fontSize: 10, opacity: 0.7, marginBottom: 6}}>Source filter (optional)</div>
            <input
              value={draft.source}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, source: e.target.value})}
              style={inputStyle}
              placeholder="e.g. early_access_form"
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={{fontSize: 10, opacity: 0.7, marginBottom: 6}}>Subject</div>
            <input value={draft.subjectTemplate} onChange={(e) => markDirtyAndDebouncePersist({...draft, subjectTemplate: e.target.value})} style={inputStyle} />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={{fontSize: 10, opacity: 0.7, marginBottom: 6}}>Body (Markdown)</div>

            <div style={{border: `1px solid ${surfaceBorder}`, borderRadius: 12, overflow: 'hidden', background: surfaceBg}}>
              <div style={{display: 'flex', gap: 6, padding: 8, borderBottom: `1px solid ${surfaceBorder}`, alignItems: 'center', flexWrap: 'wrap'}}>
                {[
                  {
                    title: 'Bold',
                    icon: <IconBold />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '**bold text**', [2, 11])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Italic',
                    icon: <IconItalic />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '*italic text*', [1, 12])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Link',
                    icon: <IconLink />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '[link text](https://)', [1, 10])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Image',
                    icon: <IconImage />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '![alt text](https://image-url)', [2, 10])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Divider',
                    icon: <IconDivider />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '\n\n---\n\n')
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Heading',
                    icon: <IconH2 />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '\n\n## Heading text\n\n', [4, 16])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Bullets',
                    icon: <IconBullets />,
                    run: () => {
                      const el = document.getElementById('body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '\n\n- Bullet one\n- Bullet two\n- Bullet three\n\n', [4, 14])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                ].map((b) => (
                  <button
                    key={b.title}
                    type="button"
                    onClick={b.run}
                    title={b.title}
                    aria-label={b.title}
                    style={{
                      width: 34,
                      height: 30,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 10,
                      border: `1px solid ${surfaceBorder}`,
                      background: 'rgba(255,255,255,0.04)',
                      color: 'inherit',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {b.icon}
                  </button>
                ))}
              </div>

              <textarea
                id="body-template"
                value={draft.bodyTemplate}
                onChange={(e) => markDirtyAndDebouncePersist({...draft, bodyTemplate: e.target.value})}
                onKeyDown={(e) => handleUndoRedoKeydown(e)}
                rows={18}
                style={{
                  width: '100%',
                  padding: 12,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{marginTop: 10, fontSize: 11, opacity: 0.7}}>
              Merge vars supported: <code>{'{{email}} {{member_id}}'}</code>
            </div>
          </label>

          {!isNarrow && hazardZone}
        </div>

        {/* RIGHT */}
        <div style={{padding: 12, borderRadius: 12}}>
          <h2 style={{marginTop: 0, marginBottom: 8, fontSize: 18}}>Preview (React Email)</h2>

          {previewErr ? (
            <div style={{padding: 10, borderRadius: 10, background: 'rgba(176,0,32,0.12)', border: '1px solid rgba(176,0,32,0.35)', color: '#ffb3c0'}}>
              <b>Preview error:</b> {previewErr}
            </div>
          ) : (
            <iframe
              title="email-preview"
              srcDoc={iframeSrcDoc}
              style={{width: '100%', height: 520, border: `1px solid ${surfaceBorder}`, borderRadius: 10, background: surfaceBg}}
              sandbox="allow-same-origin"
            />
          )}

          <div style={{marginTop: 12}}>
            <div style={{fontSize: 12, opacity: 0.7, marginBottom: 6}}>Rendered plaintext (stored in campaign body)</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                padding: 10,
                borderRadius: 10,
                background: surfaceBg,
                border: `1px solid ${surfaceBorder}`,
                margin: 0,
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              {draft.bodyTemplate}
            </pre>
          </div>
        </div>

        {isNarrow && hazardZone}
      </div>
    </div>
  )
}
