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
  return (
    x.ok === true &&
    typeof x.campaignId === 'string' &&
    typeof x.enqueued === 'number' &&
    typeof x.audienceCount === 'number'
  )
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

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return {error: 'Invalid JSON from server', message: text}
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function handleUndoRedoKeydown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const key = e.key.toLowerCase()

  const isUndo = (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && key === 'z'
  const isRedo =
    ((isMac ? e.metaKey : e.ctrlKey) && e.shiftKey && key === 'z') ||
    (!isMac && e.ctrlKey && !e.shiftKey && key === 'y')

  if (!isUndo && !isRedo) return
  e.preventDefault()

  try {
    document.execCommand(isUndo ? 'undo' : 'redo')
  } catch {
    // no-op
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
      <path
        d="M8 4h6a4 4 0 0 1 0 8H8V4Zm0 8h7a4 4 0 1 1 0 8H8v-8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
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
  )
}

function IconImage(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
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
      <path
        d="M8 6v1M12 6v1M16 6v1M8 17v1M12 17v1M16 17v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconH2(props: {size?: number}) {
  const s = props.size ?? 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6v12M12 6v12M4 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16 11a2 2 0 1 1 4 0c0 1-1 1.5-2 2.2-1 .7-2 1.2-2 2.8h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
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

export default function CampaignComposerClient() {
  // --- styling helpers (match the reference layout but using this app’s Tailwind base) ---
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
    [surfaceBg, surfaceBorder]
  )

  const labelTitleStyleLeft: React.CSSProperties = {fontSize: 10, opacity: 0.7, marginBottom: 6}
  const labelTitleStyleRight: React.CSSProperties = {fontSize: 12, opacity: 0.7, marginBottom: 6}

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

 const hazardCardStyle = useMemo<React.CSSProperties>(() => {
  return {
    marginTop: 14,
    borderRadius: 14,
    border: `1px solid rgba(255,205,0,0.35)`,
    background: 'rgba(255,255,255,0.035)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  }
}, [])

const hazardEdgeStyle = useMemo<React.CSSProperties>(() => {
  return {
    height: 10,
    opacity: 0.55,
    filter: 'saturate(1.05)',
  }
}, [])


  // responsive breakpoint like the reference
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

  // Draft fields (local + sessionStorage)
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Enqueue state
  const [loading, setLoading] = useState(false)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string>('')
  const [enqueuedCount, setEnqueuedCount] = useState<number | null>(null)

  // IMPORTANT: we want an audience count visible *before* enqueueing
  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)

  // Drain state
  const [drainError, setDrainError] = useState<string | null>(null)
  const [drainResult, setDrainResult] = useState<{sent: number; remainingQueued: number; runId: string} | null>(null)

  // Auto-drain state (mimics the old tool)
  const [sendStatus, setSendStatus] = useState<
    | {state: 'idle'}
    | {state: 'sending'; totalSent: number; lastSent: number; remainingQueued: number; loops: number; startedAtMs: number; runId?: string}
    | {state: 'done'; totalSent: number; endedAtMs: number}
    | {state: 'error'; message: string}
    | {state: 'locked'; message: string}
    | {state: 'cancelled'; totalSent: number}
  >({state: 'idle'})
  const [cancelToken, setCancelToken] = useState(0)

  const cancelSending = useCallback(() => {
  setCancelToken((x) => x + 1)
}, [])

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
      dirtyRef.current = true
      setDraft(next)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        persistDraftNow(next)
        dirtyRef.current = false
      }, 350)
    },
    [persistDraftNow]
  )

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Audience count: best-effort preflight using existing endpoint.
  // Note: /api/campaigns/[id]/audience currently ignores filters and just counts members_sendable_marketing,
  // so we display it as "≈" and we use the same count regardless of source filter.
  const refreshAudience = useCallback(async () => {
    setAudienceLoading(true)
    setAudienceError(null)
    try {
      // We need an id for this endpoint; to avoid creating campaigns just for counting,
      // we hit a simple count endpoint if you have one. If not, we fallback:
      //
      // CURRENTLY in your pasted server routes you have:
      //   /api/campaigns/[id]/audience  (needs id)  AND it doesn't support source filter.
      //
      // So instead we do a “safe” preflight by calling enqueue with dryRun? (doesn't exist),
      // therefore we must call the public count route only if it exists.
      //
      // Pragmatic approach: call a small new endpoint would be ideal, but you asked for *no other files*.
      // So we display a count only *after* enqueue via response.audienceCount, AND we also try a best-effort
      // guess by calling the same underlying view through an existing endpoint if present.
      //
      // We'll attempt: GET /api/campaigns/_audience (if you later add it) else noop.
      const res = await fetch('/api/campaigns/_audience', {cache: 'no-store'})
      if (!res.ok) throw new Error(`Audience failed (${res.status})`)
      const raw = await readJson(res)
      if (!isObject(raw) || typeof raw.count !== 'number') throw new Error('Audience response had unexpected shape')
      setAudienceCount(raw.count)
    } catch (e: unknown) {
      // Not fatal; we still show audience count after enqueue.
      setAudienceError(errorMessage(e))
    } finally {
      setAudienceLoading(false)
    }
  }, [])

  useEffect(() => {
    // auto-load audience once; if the endpoint doesn't exist, it will just show an error line (non-blocking)
    void refreshAudience()
  }, [refreshAudience])

  const canEnqueue = useMemo(() => {
    return draft.subjectTemplate.trim().length > 0 && draft.bodyTemplate.trim().length > 0
  }, [draft.bodyTemplate, draft.subjectTemplate])

  const enqueue = useCallback(async () => {
    setLoading(true)
    setEnqueueError(null)
    setDrainError(null)
    setDrainResult(null)
    setSendStatus({state: 'idle'})

    // flush draft to sessionStorage
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

      if (!res.ok) {
        if (isApiErr(raw)) throw new Error(`${raw.error}${raw.message ? `: ${raw.message}` : ''}`)
        throw new Error(`Enqueue failed (${res.status})`)
      }

      if (isApiErr(raw)) throw new Error(`${raw.error}${raw.message ? `: ${raw.message}` : ''}`)
      if (!isEnqueueOk(raw)) throw new Error('Enqueue response had unexpected shape')

      setCampaignId(raw.campaignId)
      setEnqueuedCount(raw.enqueued)
      setAudienceCount(raw.audienceCount)
    } catch (e: unknown) {
      setEnqueueError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [draft, persistDraftNow])

  const drainOnce = useCallback(
    async (limit: number) => {
      if (!campaignId) return
      setLoading(true)
      setDrainError(null)

      try {
        const res = await fetch('/api/admin/campaigns/drain', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({campaignId, limit}),
        })

        const raw = await readJson(res)

        if (!res.ok) {
          if (isApiErr(raw)) throw new Error(`${raw.error}${raw.message ? `: ${raw.message}` : ''}`)
          throw new Error(`Drain failed (${res.status})`)
        }

        if (isApiErr(raw)) throw new Error(`${raw.error}${raw.message ? `: ${raw.message}` : ''}`)
        if (!isDrainOk(raw)) throw new Error('Drain response had unexpected shape')

        setDrainResult({sent: raw.sent, remainingQueued: raw.remainingQueued, runId: raw.runId})
        return raw
      } catch (e: unknown) {
        setDrainError(errorMessage(e))
        return null
      } finally {
        setLoading(false)
      }
    },
    [campaignId]
  )

  const sendAutoDrain = useCallback(
    async (opts?: {limit?: number; maxLoops?: number}) => {
      if (!campaignId) return
      const limit = Math.max(1, Math.min(100, Math.floor(opts?.limit ?? 50)))
      const maxLoops = Math.max(1, Math.min(50, Math.floor(opts?.maxLoops ?? 50)))

      const startedAtMs = Date.now()
      const myCancelToken = cancelToken

      setSendStatus({
        state: 'sending',
        totalSent: 0,
        lastSent: 0,
        remainingQueued: Number.NaN,
        loops: 0,
        startedAtMs,
      })

      setLoading(true)
      try {
        let totalSent = 0
        let loops = 0
        let remainingQueued = Infinity
        let lastRunId: string | undefined

        while (loops < maxLoops && remainingQueued > 0) {
          if (cancelToken !== myCancelToken) {
            setSendStatus({state: 'cancelled', totalSent})
            return
          }

          loops++
          const r = await drainOnce(limit)
          if (!r) throw new Error('Drain failed')

          const sentThis = r.sent
          remainingQueued = r.remainingQueued
          lastRunId = r.runId ?? lastRunId

          totalSent += sentThis

          setSendStatus({
            state: 'sending',
            totalSent,
            lastSent: sentThis,
            remainingQueued: Number.isFinite(remainingQueued) ? remainingQueued : 0,
            loops,
            startedAtMs,
            runId: lastRunId,
          })

          if (remainingQueued <= 0) break

          const nextPollMs =
            typeof r.nextPollMs === 'number' && Number.isFinite(r.nextPollMs)
              ? Math.max(0, Math.min(5000, Math.floor(r.nextPollMs)))
              : 900

          if (cancelToken !== myCancelToken) {
            setSendStatus({state: 'cancelled', totalSent})
            return
          }

          await sleep(nextPollMs)
        }

        setSendStatus({state: 'done', totalSent, endedAtMs: Date.now()})
      } catch (e: unknown) {
        const msg = errorMessage(e)
        // if the API returned a “locked” response, it’ll be in drainError; mirror old behavior
        if (drainError && drainError.toLowerCase().includes('locked')) {
          setSendStatus({state: 'locked', message: drainError})
        } else {
          setSendStatus({state: 'error', message: msg})
        }
      } finally {
        setLoading(false)
      }
    },
    [campaignId, cancelToken, drainOnce, drainError]
  )

  const reset = useCallback(() => {
    setCampaignId('')
    setEnqueuedCount(null)
    // draft remains
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
              SEND CONTROLS
              <span style={{marginLeft: 10, fontWeight: 500, opacity: 0.7}}>Triggers real email activity.</span>
            </div>
            <div style={{fontSize: 11, opacity: 0.75}}>Double-check copy / filters / links</div>
          </div>

          <div style={{height: 10}} />

          <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
            <button
              onClick={() => void enqueue()}
              disabled={loading || sendStatus.state === 'sending' || !canEnqueue}
              style={{padding: '10px 14px', borderRadius: 10}}
              type="button"
            >
              Enqueue campaign
            </button>

            <div style={{fontSize: 12, opacity: 0.85}}>
              Campaign ID:{' '}
              <code
                style={{
                  background: surfaceBg,
                  border: `1px solid ${surfaceBorder}`,
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                {campaignId || '—'}
              </code>
            </div>
          </div>

          <div style={{marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
            <button
              onClick={() => void sendAutoDrain({limit: 50, maxLoops: 50})}
              disabled={loading || !campaignId || sendStatus.state === 'sending'}
              style={{padding: '10px 14px', borderRadius: 10}}
              type="button"
            >
              Send campaign (auto-drain)
            </button>

            <button
              onClick={cancelSending}
              disabled={sendStatus.state !== 'sending'}
              style={{padding: '10px 14px', borderRadius: 10}}
              type="button"
            >
              Cancel
            </button>

            <button
              onClick={() => void drainOnce(25)}
              disabled={loading || !campaignId}
              style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
              type="button"
            >
              Drain 25
            </button>
            <button
              onClick={() => void drainOnce(50)}
              disabled={loading || !campaignId}
              style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
              type="button"
            >
              Drain 50
            </button>
            <button
              onClick={() => void drainOnce(100)}
              disabled={loading || !campaignId}
              style={{padding: '8px 10px', borderRadius: 10, fontSize: 10}}
              type="button"
            >
              Drain 100
            </button>
          </div>

          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 12,
              border: `1px solid ${surfaceBorder}`,
              background: surfaceBg,
            }}
          >
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
                    <code
                      style={{
                        background: 'transparent',
                        border: `1px solid ${surfaceBorder}`,
                        padding: '1px 6px',
                        borderRadius: 6,
                      }}
                    >
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
                <b>Cancelled.</b> Sent <b>{sendStatus.totalSent}</b> before stopping.
              </div>
            )}

            {sendStatus.state === 'locked' && (
              <div style={{fontSize: 12}}>
                <b>Blocked:</b> {sendStatus.message}
                <div style={{marginTop: 6, fontSize: 11, opacity: 0.7}}>Another drain is likely running. Try again shortly.</div>
              </div>
            )}

            {sendStatus.state === 'error' && (
              <div style={{fontSize: 12, color: '#b00020'}}>
                <b>Error:</b> {sendStatus.message}
              </div>
            )}
          </div>

          {enqueueError ? (
            <div style={{marginTop: 10, fontSize: 12, color: '#ffb3c0'}}>
              <b>Enqueue error:</b> {enqueueError}
            </div>
          ) : null}

          {drainError ? (
            <div style={{marginTop: 10, fontSize: 12, color: '#ffb3c0'}}>
              <b>Drain error:</b> {drainError}
            </div>
          ) : null}

          {drainResult ? (
            <div style={{marginTop: 10, fontSize: 12, opacity: 0.85}}>
              Last drain: sent <b>{drainResult.sent}</b> • remaining queued <b>{drainResult.remainingQueued}</b> • runId{' '}
              <code
                style={{
                  background: 'transparent',
                  border: `1px solid ${surfaceBorder}`,
                  padding: '1px 6px',
                  borderRadius: 6,
                }}
              >
                {drainResult.runId}
              </code>
            </div>
          ) : null}
        </div>
        <div style={{...hazardEdgeStyle, backgroundImage: hazardStripe(-45)}} />
      </div>
    )
  }, [
    canEnqueue,
    campaignId,
    cancelSending,
    drainError,
    drainOnce,
    drainResult,
    enqueue,
    enqueueError,
    hazardStripe,
    loading,
    sendAutoDrain,
    sendStatus,
    surfaceBg,
    surfaceBorder,
    hazardCardStyle,
    hazardEdgeStyle,
  ])

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '24px auto',
        padding: 16,
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'}}>
        <div>
          <div style={{fontSize: 24, fontWeight: 800, letterSpacing: -0.2}}>BJR Campaign Composer</div>
          <div style={{fontSize: 12, opacity: 0.7, marginTop: 2}}>Compose → preview → enqueue → drain (Resend + Neon)</div>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
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
            title="Best-effort count of members_sendable_marketing; may differ from 'source' filter unless you add an endpoint that supports it."
          >
            Mailable members&nbsp;<b style={{marginLeft: 6}}>{audienceCount ?? '—'}</b>
          </div>

          {campaignId ? (
  <div
    style={{
      padding: '10px 14px',
      borderRadius: 10,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.14)',
      color: 'rgba(255,255,255,0.9)',
      fontSize: 13,
      fontWeight: 500,
    }}
    title="Counts returned by enqueue"
  >
    Enqueued&nbsp;<b style={{marginLeft: 6}}>{enqueuedCount ?? '—'}</b>
  </div>
) : null}


          <button onClick={() => void refreshAudience()} disabled={audienceLoading} style={{padding: '10px 14px', borderRadius: 10}} type="button">
            {audienceLoading ? 'Refreshing…' : 'Refresh audience'}
          </button>

          <button onClick={reset} disabled={loading || sendStatus.state === 'sending'} style={{padding: '10px 14px', borderRadius: 10}} type="button">
            Reset session
          </button>
        </div>
      </div>

      {audienceError ? (
        <div style={{marginTop: 10, fontSize: 12, opacity: 0.8}}>
          Audience count preflight unavailable (optional): <span style={{color: '#ffb3c0'}}>{audienceError}</span>
        </div>
      ) : null}

      <div style={{padding: 12, borderRadius: 12, marginTop: 10, marginBottom: 16}}>
        <div style={{display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'}}>
          <div style={{fontSize: 12, opacity: 0.7}}>
            Source filter (optional): <code style={{opacity: 0.9}}>{draft.source.trim() || '—'}</code>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : '1fr 2fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* LEFT */}
        <div style={{padding: 12, borderRadius: 12, fontSize: 14}}>
          <h2 style={{marginTop: 0, marginBottom: 5, fontSize: 18}}>Compose</h2>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Campaign name</div>
            <input
              value={draft.campaignName}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, campaignName: e.target.value})}
              style={inputStyle}
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Reply-To (optional)</div>
            <input
              value={draft.replyTo}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, replyTo: e.target.value})}
              style={inputStyle}
              placeholder="admin@brendanjohnroch.com"
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Source filter (optional)</div>
            <input
              value={draft.source}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, source: e.target.value})}
              style={inputStyle}
              placeholder="e.g. early_access_form"
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Subject template</div>
            <input
              value={draft.subjectTemplate}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, subjectTemplate: e.target.value})}
              style={inputStyle}
              placeholder="A note from Brendan"
            />
          </label>

          <label style={{display: 'block', marginBottom: 10}}>
            <div style={labelTitleStyleLeft}>Body template</div>

            {/* Joined control: toolbar + textarea */}
            <div
              style={{
                border: `1px solid ${surfaceBorder}`,
                borderRadius: 12,
                overflow: 'hidden',
                background: surfaceBg,
              }}
            >
              {/* Toolbar */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  padding: 8,
                  borderBottom: `1px solid ${surfaceBorder}`,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  {
                    title: 'Bold',
                    icon: <IconBold />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '**bold text**', [2, 11])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Italic',
                    icon: <IconItalic />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '*italic text*', [1, 12])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Link',
                    icon: <IconLink />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '[link text](https://)', [1, 10])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Image',
                    icon: <IconImage />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '![alt text](https://image-url)', [2, 10])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Divider',
                    icon: <IconDivider />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '\n\n---\n\n')
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Heading',
                    icon: <IconH2 />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
                      if (!el) return
                      insertAtCursor(el, '\n\n## Heading text\n\n', [4, 16])
                      markDirtyAndDebouncePersist({...draft, bodyTemplate: el.value})
                    },
                  },
                  {
                    title: 'Bullets',
                    icon: <IconBullets />,
                    run: () => {
                      const el = document.getElementById('bjr-body-template') as HTMLTextAreaElement | null
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

              {/* Textarea */}
              <textarea
                id="bjr-body-template"
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
                placeholder="Write the email…"
              />
            </div>
          </label>

          <div style={{marginTop: 12, fontSize: 11, opacity: 0.7}}>
            Tokens supported: <code>{'{{email}} {{member_id}}'}</code>
          </div>

          {!isNarrow && hazardZone}
        </div>

        {/* RIGHT */}
        <div style={{padding: 12, borderRadius: 12}}>
          <h2 style={{marginTop: 0, marginBottom: 5, fontSize: 18}}>Preview</h2>

          <div style={{marginBottom: 10}}>
            <div style={labelTitleStyleRight}>Rendered subject (plain)</div>
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                background: surfaceBg,
                border: `1px solid ${surfaceBorder}`,
              }}
            >
              {draft.subjectTemplate.trim() || '(no subject)'}
            </div>
          </div>

          <div style={{marginBottom: 10}}>
            <div style={labelTitleStyleRight}>Rendered plaintext</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                padding: 10,
                borderRadius: 10,
                background: surfaceBg,
                border: `1px solid ${surfaceBorder}`,
                margin: 0,
                maxHeight: 520,
                overflow: 'auto',
              }}
            >
              {draft.bodyTemplate || '(no body)'}
            </pre>
          </div>

          <div style={{fontSize: 12, opacity: 0.7}}>
            From: <code>(RESEND_FROM_MARKETING)</code>
            {draft.replyTo.trim() ? (
              <>
                {' '}
                • Reply-To: <code>{draft.replyTo.trim()}</code>
              </>
            ) : null}
          </div>

          <div style={{marginTop: 10, fontSize: 11, opacity: 0.65}}>
            To get a *perfect* “about to email” count with the <code>source</code> filter applied, we’d add one small count endpoint
            that accepts <code>source</code>. Right now you’ll see: (a) best-effort global count, and (b) the exact count returned by
            enqueue after you click it.
          </div>
        </div>

        {isNarrow && hazardZone}
      </div>
    </div>
  )
}
