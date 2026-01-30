// web/app/api/admin/campaigns/audience-options/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

type AudienceOptionsOk = {
  ok: true
  sources: string[]
  entitlementKeys: string[]
  engagedEventTypes: string[]
  meta: {
    sourcesLimit: number
    entitlementKeysLimit: number
    engagedEventTypesLimit: number
  }
}

type AudienceOptionsErr = {ok?: false; error: string; message?: string}

export async function GET() {
  await requireAdminMemberId()

  // Keep these conservative; you can bump later.
  const SOURCES_LIMIT = 200
  const ENTITLEMENTS_LIMIT = 400
  const EVENT_TYPES_LIMIT = 200

  try {
    const [sourcesQ, entKeysQ, eventTypesQ] = await Promise.all([
      sql<{v: string}>`
        select distinct m.source as v
        from members_sendable_marketing m
        where
          m.marketing_opt_in is true
          and m.email is not null
          and m.email <> ''
          and m.source is not null
          and m.source <> ''
        order by v asc
        limit ${SOURCES_LIMIT}
      `,
      sql<{v: string}>`
        select distinct g.entitlement_key as v
        from entitlement_grants g
        where
          g.entitlement_key is not null
          and g.entitlement_key <> ''
          and g.revoked_at is null
          and (g.expires_at is null or g.expires_at > now())
        order by v asc
        limit ${ENTITLEMENTS_LIMIT}
      `,
      sql<{v: string}>`
        select distinct e.event_type as v
        from member_events e
        where
          e.event_type is not null
          and e.event_type <> ''
        order by v asc
        limit ${EVENT_TYPES_LIMIT}
      `,
    ])

    const sources = sourcesQ.rows.map((r) => r.v).filter(Boolean)
    const entitlementKeys = entKeysQ.rows.map((r) => r.v).filter(Boolean)
    const engagedEventTypes = eventTypesQ.rows.map((r) => r.v).filter(Boolean)

    const out: AudienceOptionsOk = {
      ok: true,
      sources,
      entitlementKeys,
      engagedEventTypes,
      meta: {
        sourcesLimit: SOURCES_LIMIT,
        entitlementKeysLimit: ENTITLEMENTS_LIMIT,
        engagedEventTypesLimit: EVENT_TYPES_LIMIT,
      },
    }

    return NextResponse.json(out, {
      headers: {
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const out: AudienceOptionsErr = {error: 'Failed to load audience options', message: msg}
    return NextResponse.json(out, {status: 500})
  }
}
