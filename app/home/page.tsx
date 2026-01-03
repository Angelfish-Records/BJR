import React from 'react'
import type {Metadata} from 'next'
import {unstable_noStore as noStore} from 'next/cache'

import {client} from '../../sanity/lib/client'
import {urlFor} from '../../sanity/lib/image'
import EarlyAccessForm from '../EarlyAccessForm'

import {ensureMemberByEmail, normalizeEmail} from '../../lib/members'
import {hasAnyEntitlement, listCurrentEntitlementKeys} from '../../lib/entitlements'
import {ENT, ENTITLEMENTS, deriveTier, pickAccent} from '../../lib/vocab'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ShadowHomeDoc = {
  title?: string
  subtitle?: string
  backgroundImage?: unknown
  primaryCtaText?: string
  primaryCtaHref?: string
  secondaryCtaText?: string
  secondaryCtaHref?: string
  sections?: Array<{heading?: string; body?: string; gatedHint?: string}>
}

type SiteFlagsDoc = {
  shadowHomeEnabled?: boolean
  shadowHomeRoute?: string
}

type SearchParams = Record<string, string | string[] | undefined>

type StyleWithAccent = React.CSSProperties & {'--accent'?: string}

const siteFlagsQuery = `
  *[_id == "siteFlags"][0]{
    shadowHomeEnabled,
    shadowHomeRoute
  }
`

const shadowHomeQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    title,
    subtitle,
    backgroundImage,
    primaryCtaText,
    primaryCtaHref,
    secondaryCtaText,
    secondaryCtaHref,
    sections[]{
      heading,
      body,
      gatedHint
    }
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
      'Shadow homepage: content evolves fast, identity stays boring, access stays canonical.',
  }
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function Home({searchParams}: {searchParams?: SearchParams}) {
  noStore()
  // ---- Soft identity controls (prod-safe) ----
  const isProd = process.env.NODE_ENV === 'production'
  const allowSoftIdentityInProd = process.env.ALLOW_SOFT_IDENTITY_IN_PROD === 'true'
  const requiredToken = process.env.SOFT_IDENTITY_TOKEN || ''

  const emailRaw = firstParam(searchParams?.email)
  const tokenRaw = firstParam(searchParams?.token)

  const tokenOk =
    !isProd || !allowSoftIdentityInProd
      ? true
      : Boolean(requiredToken && tokenRaw === requiredToken)

  const email =
    (!isProd || allowSoftIdentityInProd) &&
    tokenOk &&
    emailRaw &&
    emailRaw.includes('@')
      ? normalizeEmail(emailRaw)
      : null

  const [flags, page] = await Promise.all([
    client.fetch<SiteFlagsDoc>(siteFlagsQuery, {}, {next: {tags: ['siteFlags']}}),
    client.fetch<ShadowHomeDoc>(shadowHomeQuery, {slug: 'home'}, {next: {tags: ['shadowHome']}}),
  ])

  const enabled = flags?.shadowHomeEnabled !== false

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

  if (email) {
    const ensured = await ensureMemberByEmail({
      email,
      source: 'shadow_home_soft_identity',
      sourceDetail: {route: '/home'},
    })

    member = {id: ensured.id, created: ensured.created, email}

    entitlementKeys = await listCurrentEntitlementKeys(ensured.id)
    tier = deriveTier(entitlementKeys)

    const picked = pickAccent(entitlementKeys)
    accent = picked.accent
    accentLabel = picked.label
  }

  const canSeeMemberBox =
    member &&
    (await hasAnyEntitlement(member.id, [
      ENT.pageView('home'),
      ENTITLEMENTS.FREE_MEMBER,
      ENTITLEMENTS.PATRON_ACCESS,
      ENTITLEMENTS.LIFETIME_ACCESS,
    ]))

  const bgUrl =
    page?.backgroundImage
      ? urlFor(page.backgroundImage).width(2400).height(1400).quality(80).url()
      : null

  const mainStyle: StyleWithAccent = {
    minHeight: '100svh',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#050506',
    color: 'rgba(255,255,255,0.92)',
    '--accent': accent,
  }

  return (
    <main style={mainStyle}>
      {/* Background */}
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

      {/* Dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      {/* Flag ribbon */}
      {!enabled && (
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '10px 14px',
            background: 'rgba(255,255,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.10)',
            fontSize: 13,
            color: 'rgba(255,255,255,0.80)',
          }}
        >
          Shadow homepage is currently disabled via Site Flags.
        </div>
      )}

      {/* Content */}
      <div
        style={{
          position: 'relative',
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          padding: '96px 24px',
        }}
      >
        <section style={{width: '100%', maxWidth: 980, textAlign: 'center'}}>
          <div style={{display: 'grid', gap: 18}}>
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

            <p
              style={{
                fontSize: 'clamp(16px, 2.1vw, 22px)',
                lineHeight: 1.5,
                opacity: 0.85,
                margin: '0 auto',
                maxWidth: 760,
                textWrap: 'pretty',
              }}
            >
              {page?.subtitle ??
                'This is the shadow homepage: content evolves fast, identity stays boring, access stays canonical.'}
            </p>

            {/* CTAs */}
            <div style={{display: 'grid', justifyItems: 'center', gap: 12}}>
              <EarlyAccessForm />

              <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center'}}>
                {page?.primaryCtaText && page?.primaryCtaHref && (
                  <a
                    href={page.primaryCtaHref}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '11px 16px',
                      borderRadius: 999,
                      border:
                        '1px solid color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.22))',
                      background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
                      textDecoration: 'none',
                      color: 'rgba(255,255,255,0.90)',
                      fontSize: 14,
                    }}
                  >
                    {page.primaryCtaText}
                  </a>
                )}

                {page?.secondaryCtaText && page?.secondaryCtaHref && (
                  <a
                    href={page.secondaryCtaHref}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '11px 16px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.22)',
                      background: 'transparent',
                      textDecoration: 'none',
                      color: 'rgba(255,255,255,0.82)',
                      fontSize: 14,
                    }}
                  >
                    {page.secondaryCtaText}
                  </a>
                )}
              </div>
            </div>

            {/* Member box */}
            {member && canSeeMemberBox && (
              <div style={{marginTop: 18, display: 'grid', justifyItems: 'center'}}>
                <div
                  style={{
                    width: 'min(880px, 100%)',
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    padding: '14px 16px',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{display: 'grid', gap: 2}}>
                      <div style={{fontSize: 13, opacity: 0.72}}>Member</div>
                      <div style={{fontSize: 14, opacity: 0.92}}>{member.email}</div>
                    </div>

                    <div style={{display: 'grid', gap: 2, textAlign: 'right'}}>
                      <div style={{fontSize: 13, opacity: 0.72}}>Tier (derived)</div>
                      <div style={{fontSize: 14, opacity: 0.92}}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                          }}
                        >
                          {tier}
                        </span>
                        <span style={{marginLeft: 10, fontSize: 12, opacity: 0.65}}>
                          accent: {accentLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{marginTop: 10, fontSize: 12, opacity: 0.70, lineHeight: 1.45}}>
                    Display-only: derived from canonical entitlements. No engagement metrics. Just legible state.
                  </div>
                </div>
              </div>
            )}

            {/* Sections */}
            {page?.sections?.length ? (
              <div
                style={{
                  marginTop: 36,
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  textAlign: 'left',
                }}
              >
                {page.sections.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      borderRadius: 18,
                      border: '1px solid rgba(255,255,255,0.10)',
                      background: 'rgba(255,255,255,0.04)',
                      padding: 16,
                    }}
                  >
                    {s?.heading && (
                      <div style={{fontSize: 15, opacity: 0.92, marginBottom: 6}}>
                        {s.heading}
                      </div>
                    )}
                    {s?.body && (
                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.78,
                          lineHeight: 1.55,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {s.body}
                      </div>
                    )}
                    {s?.gatedHint && (
                      <div style={{marginTop: 10, fontSize: 12, opacity: 0.60}}>
                        Hint: {s.gatedHint}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Footer */}
            <div
              style={{
                marginTop: 34,
                display: 'flex',
                justifyContent: 'center',
                gap: 10,
                flexWrap: 'wrap',
                opacity: 0.70,
                fontSize: 13,
              }}
            >
              <span>
                Route: <code style={{opacity: 0.9}}>{flags?.shadowHomeRoute ?? '/home'}</code>
              </span>
              <span>·</span>
              <span>
                Soft identity:{' '}
                <code style={{opacity: 0.9}}>?email=you@example.com&token=…</code>
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
