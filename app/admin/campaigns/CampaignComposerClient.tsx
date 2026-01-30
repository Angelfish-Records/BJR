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

export default function CampaignComposerClient() {
  // Draft fields (local + sessionStorage)
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT)
  const dirtyRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Enqueue state
  const [enqueueing, setEnqueueing] = useState(false)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState<string | null>(null)
  const [enqueuedCount, setEnqueuedCount] = useState<number | null>(null)
  const [audienceCount, setAudienceCount] = useState<number | null>(null)

  // Drain state
  const [draining, setDraining] = useState(false)
  const [drainError, setDrainError] = useState<string | null>(null)
  const [drainResult, setDrainResult] = useState<{sent: number; remainingQueued: number; runId: string} | null>(null)

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

  const canEnqueue = useMemo(() => {
    return draft.subjectTemplate.trim().length > 0 && draft.bodyTemplate.trim().length > 0
  }, [draft.bodyTemplate, draft.subjectTemplate])

  const enqueue = useCallback(async () => {
    setEnqueueing(true)
    setEnqueueError(null)
    setDrainError(null)
    setDrainResult(null)

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

  const drainOnce = useCallback(async () => {
    if (!campaignId) return
    setDraining(true)
    setDrainError(null)

    try {
      const res = await fetch('/api/admin/campaigns/drain', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({campaignId, limit: 50}),
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
  }, [campaignId])

  const reset = useCallback(() => {
    setCampaignId(null)
    setEnqueuedCount(null)
    setAudienceCount(null)
    setDrainResult(null)
    setEnqueueError(null)
    setDrainError(null)
  }, [])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs opacity-70">Campaigns</div>
          <div className="text-lg font-semibold">Compose & send</div>
          <div className="text-xs opacity-70">
            This page keeps draft content locally; a campaign record is only created when you click Enqueue.
          </div>
          {campaignId ? (
            <div className="text-xs opacity-70 mt-2">
              Active campaign: <span className="font-mono">{campaignId}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              onClick={reset}
              type="button"
              disabled={enqueueing || draining}
              title="Clears the active campaignId (draft remains in sessionStorage)"
            >
              Reset session
            </button>

            <button
              className="px-3 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
              onClick={() => void enqueue()}
              type="button"
              disabled={!canEnqueue || enqueueing || draining}
              title="Creates campaign + inserts campaign_sends"
            >
              {enqueueing ? 'Enqueueing…' : 'Enqueue sends'}
            </button>

            <button
              className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              onClick={() => void drainOnce()}
              type="button"
              disabled={!campaignId || draining || enqueueing}
              title="Runs one drain pass now"
            >
              {draining ? 'Draining…' : 'Drain once'}
            </button>
          </div>

          {enqueueError ? <div className="text-xs text-red-600">{enqueueError}</div> : null}
          {drainError ? <div className="text-xs text-red-600">{drainError}</div> : null}

          {campaignId ? (
            <div className="text-xs opacity-80">
              {audienceCount != null ? <>Audience: ≈ {audienceCount.toLocaleString()} · </> : null}
              {enqueuedCount != null ? <>Enqueued: {enqueuedCount.toLocaleString()} · </> : null}
              <span className="opacity-70">(campaign id shown only for debugging / ops)</span>
            </div>
          ) : null}

          {drainResult ? (
            <div className="text-xs opacity-80">
              Sent: {drainResult.sent.toLocaleString()} · Remaining queued: {drainResult.remainingQueued.toLocaleString()} · Run:{' '}
              <span className="font-mono">{drainResult.runId}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="text-xs opacity-70">Name</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm"
              value={draft.campaignName}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, campaignName: e.target.value})}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Reply-To (optional)</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm font-mono"
              value={draft.replyTo}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, replyTo: e.target.value})}
              placeholder="admin@brendanjohnroch.com"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Source filter (optional)</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm font-mono"
              value={draft.source}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, source: e.target.value})}
              placeholder="e.g. early_access_form"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Subject template</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm"
              value={draft.subjectTemplate}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, subjectTemplate: e.target.value})}
              placeholder="A note from Brendan"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Body template</div>
            <textarea
              className="w-full min-h-[420px] px-3 py-2 rounded-md border text-sm"
              value={draft.bodyTemplate}
              onChange={(e) => markDirtyAndDebouncePersist({...draft, bodyTemplate: e.target.value})}
              placeholder="Write the email…"
            />
            <div className="text-xs opacity-60">
              Merge vars supported: <span className="font-mono">{'{{email}}'}</span>,{' '}
              <span className="font-mono">{'{{member_id}}'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs opacity-70">Preview (plain)</div>
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">{draft.subjectTemplate.trim() || '(no subject)'}</div>
            <div className="text-xs opacity-70">
              From: <span className="font-mono">(RESEND_FROM_MARKETING)</span>
              {draft.replyTo.trim() ? (
                <>
                  {' '}
                  · Reply-To: <span className="font-mono">{draft.replyTo.trim()}</span>
                </>
              ) : null}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-6">{draft.bodyTemplate || '(no body)'}</div>
          </div>

          <div className="text-xs opacity-60">
            Clicking <b>Enqueue sends</b> creates a campaign row + inserts rows into <span className="font-mono">campaign_sends</span>. <br />
            Clicking <b>Drain once</b> runs one batch via Resend.
          </div>
        </div>
      </div>
    </div>
  )
}
