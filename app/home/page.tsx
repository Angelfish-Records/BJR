// web/app/home/page.tsx
import React from 'react'
import type {Metadata} from 'next'
import {headers} from 'next/headers'

import {client} from '../../sanity/lib/client'
import {urlFor} from '../../sanity/lib/image'
import ActivationGate from './ActivationGate'

import {auth, currentUser} from '@clerk/nextjs/server'
import {ensureMemberByClerk} from '../../lib/members'

import {hasAnyEntitlement, listCurrentEntitlementKeys} from '../../lib/entitlements'
import {ENT, ENTITLEMENTS, deriveTier, pickAccent} from '../../lib/vocab'

import SubscribeButton from './SubscribeButton'
import CancelSubscriptionButton from './CancelSubscriptionButton'

import {fetchPortalPage} from '../../lib/portal'
import PortalModules from './PortalModules'
import PortalArea from './PortalArea'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type ShadowHomeDoc = {
  title?: string
  subtitle?: string
  backgroundImage?: unknown
}

type StyleWithAccent = React.CSSProperties & {'--accent'?: string}

const shadowHomeQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    title,
    subtitle,
    backgroundImage
  }
`

export async function generateMetadata(): Promise<Metadata> {
  const page = await client.fetch<{title?: string; subtitle?: string}>(
    `*[_type == "shadowHomePage" && slug.current == "home"][0]{ title, subtitle }`,
    {},
    {next: {tags: ['shadowHome']}}
  )

  return {
    title: page?.title ?? 'Shadow Home',
    description:
      page?.subtitle ??
      'Portal shell: panels swap; identity stays boring; access stays canonical.',
  }
}

function CheckoutBanner(props: {checkout: string | null}) {
  const {checkout} = props
  if (checkout !== 'success' && checkout !== 'cancel') return null
  const isSuccess = checkout === 'success'

  return (
    <div
      style={{
        marginTop: 12,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.14)',
        background: isSuccess ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.20)',
        padding: '12px 14px',
        fontSize: 13,
        opacity: isSuccess ? 0.9 : 0.85,
        lineHeight: 1.45,
        textAlign: 'left',
      }}
    >
      {isSuccess ? (
        <>
          ✅ Checkout completed. If entitlements haven&apos;t appeared yet, refresh once (webhooks can be a
          beat behind).
        </>
      ) : (
        <>Checkout cancelled.</>
      )}
    </div>
  )
}

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  headers()

  const sp = (await props.searchParams) ?? {}
  const checkout = typeof sp.checkout === 'string' ? sp.checkout : null

  const {userId} = await auth()

  // Post-checkout activation case (logged out)
  const showPaymentPrompt = checkout === 'success' && !userId

  const user = userId ? await currentUser() : null
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null

  const [page, portal] = await Promise.all([
    client.fetch<ShadowHomeDoc>(shadowHomeQuery, {slug: 'home'}, {next: {tags: ['shadowHome']}}),
    fetchPortalPage('home'),
  ])

  let member:
    | null
    | {
        id: string
        created: boolean
        email: string
      } = null

  let entitlementKeys: string[] = []
  let tier = 'none'
  let accent = '#8b8bff'
  let accentLabel = 'default'

  if (userId && email) {
    const ensured = await ensureMemberByClerk({
      clerkUserId: userId,
      email,
      source: 'shadow_home_clerk',
      sourceDetail: {route: '/home'},
    })

    member = {id: ensured.id, created: ensured.created, email}

    entitlementKeys = await listCurrentEntitlementKeys(ensured.id)
    tier = deriveTier(entitlementKeys)

    const picked = pickAccent(entitlementKeys)
    accent = picked.accent
    accentLabel = picked.label
  }

  const hasGold = entitlementKeys.includes(ENTITLEMENTS.SUBSCRIPTION_GOLD)

  const canSeeMemberBox =
    member &&
    (await hasAnyEntitlement(member.id, [
      ENT.pageView('home'),
      ENTITLEMENTS.FREE_MEMBER,
      ENTITLEMENTS.PATRON_ACCESS,
      ENTITLEMENTS.LIFETIME_ACCESS,
    ]))

  const attentionMessage = showPaymentPrompt ? 'Payment confirmed – activate to unlock.' : null

  const bgUrl =
    page?.backgroundImage
      ? urlFor(page.backgroundImage).width(2400).height(1400).quality(80).url()
      : null

  const mainStyle: StyleWithAccent = {
    minHeight: '100svh',
    position: 'relative',
    overflowX: 'hidden',
    overflowY: 'auto',
    backgroundColor: '#050506',
    color: 'rgba(255,255,255,0.92)',
    '--accent': accent,
  }

  const portalPanel = portal?.modules?.length ? (
    <PortalModules modules={portal.modules} memberId={member?.id ?? null} />
  ) : (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 16,
        fontSize: 13,
        opacity: 0.78,
        lineHeight: 1.55,
      }}
    >
      No portal modules yet. Create a <code style={{opacity: 0.9}}>portalPage</code> with slug{' '}
      <code style={{opacity: 0.9}}>home</code> in Sanity Studio.
    </div>
  )

  return (
    <main style={mainStyle}>
      {/* Grid + responsive behavior kept here so it can’t “go missing” via CSS drift */}
      <style>{`
  .shadowHomeGrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(300px, 34vw, 380px);
    gap: 18px;
    align-items: start;
  }

  .shadowHomeMain { min-width: 0; }
  .shadowHomeSidebar { min-width: 0; }

  /* Make sidebar cards actually fit the column */
  .shadowHomeSidebar > * { width: 100%; }

  /* Stack earlier so “tablet / narrow desktop” doesn’t feel broken */
  @media (max-width: 1060px) {
    .shadowHomeGrid { grid-template-columns: 1fr; }
    .shadowHomeSidebar { order: 0; position: static !important; top: auto !important; }
    .shadowHomeMain { order: 1; }
  }
`}</style>


      {/* background layers */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: bgUrl
            ? `url(${bgUrl})`
            : `radial-gradient(1200px 800px at 20% 20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
               radial-gradient(900px 700px at 80% 40%, rgba(255,255,255,0.06), transparent 55%),
               linear-gradient(180deg, #050506 0%, #0b0b10 70%, #050506 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: bgUrl ? 'saturate(0.9) contrast(1.05)' : undefined,
          transform: 'scale(1.03)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      <div
  style={{
    position: 'relative',
    minHeight: '100svh',
    display: 'grid',

    // Key: do NOT vertically center the whole section
    justifyItems: 'center',
    alignItems: 'start',

    padding: '86px 24px',
  }}
>

        <section
  style={{
    width: '100%',
    maxWidth: 1120,
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr', // (or just remove this line entirely)
    alignItems: 'start',
    gap: 26,
  }}
>

  {/* HEADER (never moves) */}
  <div style={{textAlign: 'center'}}>
    <h1
      style={{
        fontSize: 'clamp(38px, 5.6vw, 70px)',
        lineHeight: 1.02,
        margin: 0,
        textWrap: 'balance',
      }}
    >
      {page?.title ?? 'Shadow home'}
    </h1>

    <div
      style={{
        height: 2,
        width: 'min(420px, 70vw)',
        margin: '18px auto 0',
        borderRadius: 999,
        background:
          'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 75%, white 10%), transparent)',
        opacity: 0.75,
      }}
    />
  </div>

  {/* CONTENT (this is the only row that changes height) */}
  <div className="shadowHomeGrid" style={{minHeight: 0}}>
            {/* LEFT: portal */}
            <div className="shadowHomeMain">
              <PortalArea portalPanel={portalPanel} />
            </div>

            {/* RIGHT: membership sidebar */}
            <aside
              className="shadowHomeSidebar"
              style={{
                position: 'sticky',
                top: 22,
                alignSelf: 'start',
                display: 'grid',
                gap: 14,
              }}
            >
              <div
                style={{
                  borderRadius: 18,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: 14,
                }}
              >
                <ActivationGate attentionMessage={attentionMessage}>
                  {member ? (
                    <div style={{display: 'grid', justifyItems: 'center', gap: 10}}>
                      {!hasGold ? <SubscribeButton loggedIn={!!userId} /> : null}
                      {hasGold ? <CancelSubscriptionButton /> : null}
                    </div>
                  ) : null}
                </ActivationGate>

                <CheckoutBanner checkout={checkout} />
              </div>

              {member && canSeeMemberBox && (
                <div
                  style={{
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '14px 16px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{display: 'flex', justifyContent: 'space-between', gap: 12}}>
                    <div>
                      <div style={{fontSize: 13, opacity: 0.72}}>Member</div>
                      <div style={{fontSize: 14, opacity: 0.92}}>{member.email}</div>
                    </div>

                    <div style={{textAlign: 'right'}}>
                      <div style={{fontSize: 13, opacity: 0.72}}>Tier</div>
                      <div style={{fontSize: 14, opacity: 0.92}}>
                        {tier} <span style={{opacity: 0.65}}>({accentLabel})</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}
