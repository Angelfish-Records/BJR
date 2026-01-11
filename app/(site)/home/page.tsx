// web/app/(site)/home/page.tsx
import React from 'react'
import type {Metadata} from 'next'
import {headers} from 'next/headers'
import {client} from '@/sanity/lib/client'
import {urlFor} from '@/sanity/lib/image'
import {auth, currentUser} from '@clerk/nextjs/server'
import {ensureMemberByClerk} from '@/lib/members'
import {hasAnyEntitlement, listCurrentEntitlementKeys} from '@/lib/entitlements'
import {ENT, ENTITLEMENTS, deriveTier, pickAccent} from '@/lib/vocab'
import {fetchPortalPage} from '@/lib/portal'
import PortalModules from '@/app/home/PortalModules'
import PortalArea from '@/app/home/PortalArea'
import {listAlbumsForBrowse, getAlbumBySlug} from '@/lib/albums'
import type {AlbumNavItem} from '@/lib/types'
import StageInline from '@/app/home/player/StageInline'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type ShadowHomeDoc = {
  title?: string
  subtitle?: string
  backgroundImage?: unknown
  topLogoUrl?: string | null
  topLogoHeight?: number | null
}

type StyleWithAccent = React.CSSProperties & {'--accent'?: string}

const shadowHomeQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    title,
    subtitle,
    backgroundImage,
    "topLogoUrl": topLogo.asset->url,
    topLogoHeight
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

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  headers()

  const sp = (await props.searchParams) ?? {}
  const checkout = typeof sp.checkout === 'string' ? sp.checkout : null

  const {userId} = await auth()
  const loggedIn = !!userId

  // Post-checkout activation case (logged out)
  const showPaymentPrompt = checkout === 'success' && !userId
  const attentionMessage = showPaymentPrompt ? 'Payment confirmed – activate to unlock.' : null

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

  const bgUrl =
    page?.backgroundImage
      ? urlFor(page.backgroundImage).width(2400).height(1400).quality(80).url()
      : null

  const mainStyle: StyleWithAccent = {
    minHeight: '100svh',
    position: 'relative',
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

  const featuredAlbumSlug = 'consolers'
  const albumData = await getAlbumBySlug(featuredAlbumSlug)
  const albumSlug = featuredAlbumSlug
  const browseAlbumsRaw = await listAlbumsForBrowse()

  const browseAlbums: AlbumNavItem[] = browseAlbumsRaw
    .filter((a) => a.slug && a.title)
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      artist: a.artist ?? undefined,
      year: a.year ?? undefined,
      coverUrl: a.artwork ? urlFor(a.artwork).width(400).height(400).quality(80).url() : null,
    }))

  return (
    <main style={mainStyle}>
      <style>{`
        .shadowHomeGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) clamp(300px, 34vw, 380px);
          gap: 18px;
          align-items: start;
        }

        .shadowHomeMain,
        .shadowHomeSidebar,
        .shadowHomeGrid > * {
          min-width: 0;
        }

        .shadowHomeSidebar > * {
          width: 100%;
        }

        .portalCardGrid2up {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        @media (max-width: 700px) {
          .portalCardGrid2up {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 1060px) {
          .shadowHomeGrid {
            grid-template-columns: 1fr;
          }

          .shadowHomeSidebar {
            order: 1;
            position: static !important;
            top: auto !important;
          }

          .shadowHomeMain {
            order: 0;
          }
        }

        @media (max-width: 520px) {
          .shadowHomeOuter {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }
        }
      `}</style>

      {/* background layers */}
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
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
      </div>

      <div
        className="shadowHomeOuter"
        style={{
          position: 'relative',
          minHeight: '100svh',
          display: 'grid',
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
            gridTemplateRows: 'auto auto 1fr',
            alignItems: 'start',
            gap: 26,
          }}
        >

          <div className="shadowHomeGrid" style={{minHeight: 0}}>
            {/* GRID-WIDE TOP BAR SLOT (PortalShell portals into this) */}
            <div style={{gridColumn: '1 / -1', minWidth: 0}}>
              <div id="af-portal-topbar-slot" />
            </div>

            {/* LEFT: portal */}
            <div className="shadowHomeMain" style={{display: 'grid', gap: 18}}>
             <PortalArea
                portalPanel={portalPanel}
                albumSlug={albumSlug}
                album={albumData.album}
                tracks={albumData.tracks}
                albums={browseAlbums}
                checkout={checkout}
                attentionMessage={attentionMessage}
                loggedIn={loggedIn}
                hasGold={hasGold}
                canManageBilling={!!member}
                topLogoUrl={page?.topLogoUrl ?? null}
                topLogoHeight={page?.topLogoHeight ?? null}
              />

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

              <StageInline
                height={300}
                cuesByTrackId={albumData.lyrics.cuesByTrackId}
                offsetByTrackId={albumData.lyrics.offsetByTrackId}
              />
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}
