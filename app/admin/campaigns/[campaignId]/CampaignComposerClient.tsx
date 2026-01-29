'use client'

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react'

type Json =
  | string
  | number
  | boolean
  | null
  | {[key: string]: Json}
  | Json[]

type Campaign = {
  id: string
  name: string
  audience_key: string
  sender_key: string
  from_email: string
  reply_to: string | null
  subject_template: string
  body_template: string
  filters: Json
  status: string
  locked_at: string | null
  locked_by: string | null
  cancel_requested_at: string | null
  created_at: string
  updated_at: string
}

type Props = {
  campaignId: string
  /** Optional: hydrate from server to avoid a first fetch */
  initialCampaign?: Campaign
}


/**
 * BJR Campaign Composer
 * - Single sender: RESEND_FROM_MARKETING -> oracle@post.brendanjohnroch.com
 * - Audience: members_sendable_marketing (members only, already “sendable”)
 * - Persists to: public.campaigns
 * - Queues to: public.campaign_sends
 */
export default function CampaignComposerClient({campaignId, initialCampaign}: Props) {
  const [campaign, setCampaign] = useState<Campaign | null>(initialCampaign ?? null)
  const [loading, setLoading] = useState(!initialCampaign)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [audienceCount, setAudienceCount] = useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [audienceError, setAudienceError] = useState<string | null>(null)

  const [queueing, setQueueing] = useState(false)
  const [queueResult, setQueueResult] = useState<{queued: number; skipped: number} | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)

  // Local draft fields (so we can debounce-save)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState('')

  const canEdit = useMemo(() => {
    if (!campaign) return false
    return !campaign.locked_at && campaign.status !== 'sending' && campaign.status !== 'sent'
  }, [campaign])

  // Debounce save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  
  // Keep local draft fields in sync when campaign changes
  useEffect(() => {
    if (!campaign) return
    setName(campaign.name ?? '')
    setSubject(campaign.subject_template ?? '')
    setBody(campaign.body_template ?? '')
    setReplyTo(campaign.reply_to ?? '')
  }, [campaign])

  const loadCampaign = useCallback(async () => {
    setLoading(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {cache: 'no-store'})
      if (!res.ok) throw new Error(`Load failed (${res.status})`)
      const data = (await res.json()) as {campaign: Campaign}
      setCampaign(data.campaign)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load campaign'
      setSaveError(msg)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    if (!initialCampaign) void loadCampaign()
  }, [initialCampaign, loadCampaign])

  const refreshAudience = useCallback(async () => {
    setAudienceLoading(true)
    setAudienceError(null)
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/audience`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Audience failed (${res.status})`)
      const data = (await res.json()) as {count: number}
      setAudienceCount(data.count)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load audience count'
      setAudienceError(msg)
    } finally {
      setAudienceLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    if (campaign) void refreshAudience()
  }, [campaign, refreshAudience])

  const saveNow = useCallback(
    async (next?: Partial<Campaign>) => {
      if (!campaign) return
      setSaving(true)
      setSaveError(null)
      try {
        const payload = {
          name,
          subject_template: subject,
          body_template: body,
          reply_to: replyTo.trim() ? replyTo.trim() : null,
          ...next,
        }

        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
          method: 'PUT',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `Save failed (${res.status})`)
        }
        const data = (await res.json()) as {campaign: Campaign}
        setCampaign(data.campaign)
        dirtyRef.current = false
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to save'
        setSaveError(msg)
      } finally {
        setSaving(false)
      }
    },
    [body, campaign, name, replyTo, subject]
  )

  const markDirtyAndDebounceSave = useCallback(() => {
    dirtyRef.current = true
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void saveNow()
    }, 600)
  }, [saveNow])

  const lockCampaign = useCallback(async () => {
    if (!campaign) return
    await saveNow({status: 'locked'})
    await loadCampaign()
  }, [campaign, loadCampaign, saveNow])

  const queueSends = useCallback(async () => {
    setQueueing(true)
    setQueueError(null)
    setQueueResult(null)
    try {
      // Flush any pending debounce save first
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (dirtyRef.current) await saveNow()

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/queue`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(text || `Queue failed (${res.status})`)
      }
      const data = (await res.json()) as {queued: number; skipped: number}
      setQueueResult({queued: data.queued, skipped: data.skipped})
      await loadCampaign()
      await refreshAudience()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to queue sends'
      setQueueError(msg)
    } finally {
      setQueueing(false)
    }
  }, [campaignId, loadCampaign, refreshAudience, saveNow])

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  if (loading) return <div className="p-6 text-sm opacity-80">Loading campaign…</div>
  if (!campaign) return <div className="p-6 text-sm text-red-600">Failed to load campaign.</div>

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs opacity-70">Campaign</div>
          <div className="text-lg font-semibold">{campaign.id}</div>
          <div className="text-xs opacity-70 mt-1">
            From: <span className="font-mono">{campaign.from_email}</span>
            {campaign.reply_to ? (
              <>
                {' '}
                · Reply-To: <span className="font-mono">{campaign.reply_to}</span>
              </>
            ) : null}
          </div>
          <div className="text-xs opacity-70 mt-1">
            Audience: <span className="font-mono">{campaign.audience_key}</span>{' '}
            {audienceLoading ? (
              <span className="ml-2 opacity-70">counting…</span>
            ) : audienceCount != null ? (
              <span className="ml-2">≈ {audienceCount.toLocaleString()} recipients</span>
            ) : null}
          </div>
          {audienceError ? <div className="text-xs text-red-600 mt-1">{audienceError}</div> : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="text-xs opacity-70">
            Status: <span className="font-mono">{campaign.status}</span>
            {campaign.locked_at ? <span className="ml-2">(locked)</span> : null}
          </div>

          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              onClick={() => void refreshAudience()}
              disabled={audienceLoading}
              type="button"
            >
              Refresh audience
            </button>

            <button
              className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              onClick={() => void saveNow()}
              disabled={!canEdit || saving}
              type="button"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>

            <button
              className="px-3 py-2 rounded-md border text-sm disabled:opacity-50"
              onClick={() => void lockCampaign()}
              disabled={!canEdit || saving}
              type="button"
              title="Lock before queueing"
            >
              Lock
            </button>

            <button
              className="px-3 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
              onClick={() => void queueSends()}
              disabled={queueing || saving || !campaign.subject_template || !campaign.body_template}
              type="button"
            >
              {queueing ? 'Queueing…' : 'Queue sends'}
            </button>
          </div>

          {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}
          {queueError ? <div className="text-xs text-red-600">{queueError}</div> : null}
          {queueResult ? (
            <div className="text-xs opacity-80">
              Queued: {queueResult.queued.toLocaleString()} · Skipped:{' '}
              {queueResult.skipped.toLocaleString()}
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
              value={name}
              disabled={!canEdit}
              onChange={(e) => {
                setName(e.target.value)
                markDirtyAndDebounceSave()
              }}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Reply-To (optional)</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm font-mono"
              value={replyTo}
              disabled={!canEdit}
              onChange={(e) => {
                setReplyTo(e.target.value)
                markDirtyAndDebounceSave()
              }}
              placeholder="admin@brendanjohnroch.com"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Subject template</div>
            <input
              className="w-full px-3 py-2 rounded-md border text-sm"
              value={subject}
              disabled={!canEdit}
              onChange={(e) => {
                setSubject(e.target.value)
                markDirtyAndDebounceSave()
              }}
              placeholder="A note from Brendan"
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs opacity-70">Body template</div>
            <textarea
              className="w-full min-h-[420px] px-3 py-2 rounded-md border text-sm"
              value={body}
              disabled={!canEdit}
              onChange={(e) => {
                setBody(e.target.value)
                markDirtyAndDebounceSave()
              }}
              placeholder="Write the email…"
            />
            <div className="text-xs opacity-60">
              (Keep it simple for now; merge vars can come later via campaign_sends.merge_vars.)
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs opacity-70">Preview</div>
          <div className="rounded-md border p-4 space-y-3">
            <div className="text-sm font-semibold">{subject || '(no subject)'}</div>
            <div className="text-xs opacity-70">
              From: <span className="font-mono">{campaign.from_email}</span>
              {replyTo.trim() ? (
                <>
                  {' '}
                  · Reply-To: <span className="font-mono">{replyTo.trim()}</span>
                </>
              ) : null}
            </div>
            <div className="text-sm whitespace-pre-wrap leading-6">{body || '(no body)'}</div>
          </div>

          <div className="text-xs opacity-60">
            Locking/queueing just creates rows in <span className="font-mono">campaign_sends</span>{' '}
            (no sending loop here).
          </div>
        </div>
      </div>
    </div>
  )
}
