// web/app/home/PortalModules.tsx
import React from 'react'
import {listCurrentEntitlementKeys} from '../../lib/entitlements'
import PortalRichText from './modules/PortalRichText'
import {getAlbumOffer, type AlbumOfferAsset} from '../../lib/albumOffers'
import {urlFor} from '../../sanity/lib/image'
import BuyAlbumButton from './modules/BuyAlbumButton'
import DownloadAlbumButton from './modules/DownloadAlbumButton'
import GiftAlbumButton from './modules/GiftAlbumButton'
import PortalTabs, {type PortalTabSpec} from './PortalTabs'
import PortalArtistPosts from './modules/PortalArtistPosts'

// --------------------
// Module discriminated unions
// --------------------

type ModuleHeading = {_key: string; _type: 'moduleHeading'; title?: string; blurb?: string}

type ModuleRichText = {
  _key: string
  _type: 'moduleRichText'
  title?: string
  teaser?: import('@portabletext/types').PortableTextBlock[]
  full?: import('@portabletext/types').PortableTextBlock[]
  requiresEntitlement?: string
}

type ModuleCardGrid = {
  _key: string
  _type: 'moduleCardGrid'
  title?: string
  cards: Array<{_key: string; title: string; body?: string; requiresEntitlement?: string}>
}

type SanityImage = {
  _type: 'image'
  asset: {_ref: string; _type: 'reference'}
  crop?: unknown
  hotspot?: unknown
}

type DownloadAssetSel = {assetId: string; label?: string}

type ModuleDownloads = {
  _key: string
  _type: 'moduleDownloads'
  title?: string
  albumSlug: string
  teaserCopy?: string
  assets?: DownloadAssetSel[]
  coverImage?: SanityImage
  productLabel?: string
  highlights?: string[]
  techSpec?: string
  giftBlurb?: string
}

type PortalDownloadOffer = {
  albumSlug: string
  coverImage?: SanityImage
  productLabel?: string
  teaserCopy?: string
  highlights?: string[]
  techSpec?: string
  giftBlurb?: string
  assets?: DownloadAssetSel[]
}

type ModuleDownloadGrid = {
  _key: string
  _type: 'moduleDownloadGrid'
  title?: string
  offers: PortalDownloadOffer[]
}

type ModuleArtistPosts = {
  _key: string
  _type: 'moduleArtistPosts'
  title?: string
  pageSize?: number
  requireAuthAfter?: number
  minVisibility?: 'public' | 'friend' | 'patron' | 'partner'
}

type PortalModule =
  | ModuleHeading
  | ModuleRichText
  | ModuleCardGrid
  | ModuleDownloads
  | ModuleDownloadGrid
  | ModuleArtistPosts

type Props = {
  modules: PortalModule[]
  memberId: string | null
}

// --------------------
// Helpers
// --------------------

function hasKey(entitlementKeys: string[], key: string | null | undefined): boolean {
  if (!key) return true
  return entitlementKeys.includes(key)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function PanelCard(props: {title: string; body?: string; locked?: boolean}) {
  const {title, body, locked} = props
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
        <div style={{fontSize: 14, opacity: 0.92}}>{title}</div>
        {locked ? <div style={{fontSize: 12, opacity: 0.60}}>locked</div> : null}
      </div>

      {body ? (
        <div style={{marginTop: 8, fontSize: 13, opacity: locked ? 0.55 : 0.80, lineHeight: 1.55}}>
          {locked ? 'Locked.' : body}
        </div>
      ) : null}
    </div>
  )
}

function buildAssetsToRender(offerAssets: AlbumOfferAsset[], configured: DownloadAssetSel[] | null) {
  const assetsToRender: Array<{asset: AlbumOfferAsset; labelOverride?: string}> = []

  if (configured) {
    for (const sel of configured) {
      const found = offerAssets.find((a) => a.id === sel.assetId)
      if (found) assetsToRender.push({asset: found, labelOverride: sel.label})
    }
  } else {
    for (const asset of offerAssets) assetsToRender.push({asset})
  }

  const missingConfiguredIds = configured?.filter((sel) => !offerAssets.some((a) => a.id === sel.assetId)) ?? []
  return {assetsToRender, missingConfiguredIds}
}

// --------------------
// Single offer card (Bandcamp-style, self-contained)
// --------------------

function DownloadOfferCard(props: {
  albumSlug: string
  owned: boolean
  coverImage?: SanityImage
  productLabel?: string
  teaserCopy?: string
  highlights?: string[]
  techSpec?: string
  // giftBlurb intentionally not passed into GiftAlbumButton here until you add that prop support
  assets?: DownloadAssetSel[]
}) {
  const {albumSlug, owned, coverImage, productLabel, teaserCopy, highlights, techSpec, assets} = props

  const offerCfg = getAlbumOffer(albumSlug)
  const title = offerCfg?.title ?? albumSlug
  const offerAssets: AlbumOfferAsset[] = offerCfg?.assets ?? []
  const configured = assets && assets.length > 0 ? assets : null
  const {assetsToRender, missingConfiguredIds} = buildAssetsToRender(offerAssets, configured)

  const coverUrl = coverImage ? urlFor(coverImage).width(900).height(900).fit('crop').url() : null

  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(0,0,0,0.18)',
        padding: 16,
        minWidth: 0,
      }}
    >
      {coverUrl ? (
        /* eslint-disable @next/next/no-img-element */
        <img
          src={coverUrl}
          alt={title}
          style={{
            width: '100%',
            aspectRatio: '1 / 1',
            objectFit: 'cover',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.02)',
          }}
        />
      ) : null}

      <div style={{marginTop: coverUrl ? 12 : 0}}>
        <div style={{fontSize: 20, opacity: 0.95, lineHeight: 1.1}}>{title}</div>
        <div style={{marginTop: 6, fontSize: 13, opacity: 0.72}}>{productLabel ?? 'Digital Album'}</div>
      </div>

      {highlights && highlights.length > 0 ? (
        <div style={{marginTop: 12, display: 'grid', gap: 8, fontSize: 13, opacity: 0.78, lineHeight: 1.5}}>
          {highlights.map((h, i) => (
            <div key={`${i}:${h}`}>{h}</div>
          ))}
        </div>
      ) : null}

      {techSpec ? <div style={{marginTop: 12, fontSize: 13, opacity: 0.78}}>{techSpec}</div> : null}

      {!offerCfg ? (
        <div style={{marginTop: 14, fontSize: 13, opacity: 0.75}}>
          Missing AlbumOffer config for <code>{albumSlug}</code>.
        </div>
      ) : owned ? (
        <div style={{marginTop: 14, display: 'grid', gap: 10}}>
          {offerAssets.length === 0 ? (
            <div style={{fontSize: 13, opacity: 0.75}}>
              No downloadable assets configured in <code>albumOffers.ts</code>.
            </div>
          ) : (
            <>
              {missingConfiguredIds.length > 0 ? (
                <div style={{fontSize: 13, opacity: 0.75}}>
                  Invalid assetId(s) referenced in Sanity: {missingConfiguredIds.map((x) => x.assetId).join(', ')}
                </div>
              ) : null}

              <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
                {assetsToRender.map(({asset, labelOverride}) => (
                  <DownloadAlbumButton
                    key={asset.id}
                    albumSlug={albumSlug}
                    assetId={asset.id}
                    label={labelOverride ?? asset.label}
                  />
                ))}
              </div>

              <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
                <GiftAlbumButton albumTitle={title} albumSlug={albumSlug} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{marginTop: 14, display: 'grid', gap: 10}}>
          <div style={{fontSize: 13, opacity: 0.80, lineHeight: 1.5}}>
            {teaserCopy ?? 'Buy the digital album to unlock downloads (perpetual).'}
          </div>
          <div>
            <BuyAlbumButton albumSlug={albumSlug} label="Buy digital album" />
          </div>
          <div>
            <GiftAlbumButton albumTitle={title} albumSlug={albumSlug} ctaLabel="Send as gift" />
          </div>
        </div>
      )}
    </div>
  )
}

// --------------------
// Module renderer (reused per tab)
// --------------------

function renderModule(m: PortalModule, entitlementKeys: string[]) {
  if (m._type === 'moduleHeading') return null

  if (m._type === 'moduleRichText') {
    const entitled = hasKey(entitlementKeys, m.requiresEntitlement)
    const blocks = entitled ? m.full ?? m.teaser ?? [] : m.teaser ?? []
    return (
      <PortalRichText key={m._key} title={m.title} blocks={blocks} locked={!!m.requiresEntitlement && !entitled} />
    )
  }

  if (m._type === 'moduleCardGrid') {
    return (
      <div key={m._key} style={{borderRadius: 18, padding: 16}}>
        <div className="portalCardGrid2up">
          {m.cards.map((c) => (
            <PanelCard
              key={c._key}
              title={c.title}
              body={c.body}
              locked={!!c.requiresEntitlement && !hasKey(entitlementKeys, c.requiresEntitlement)}
            />
          ))}
        </div>
      </div>
    )
  }

  if (m._type === 'moduleDownloadGrid') {
    return (
      <div
        key={m._key}
        style={{
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.04)',
          padding: 16,
          minWidth: 0,
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
          <div style={{fontSize: 15, opacity: 0.92}}>{m.title ?? 'Downloads'}</div>
        </div>

        <div style={{marginTop: 12}} className="portalDownloadGrid2up">
          {m.offers.map((o, idx) => {
            const offerCfg = getAlbumOffer(o.albumSlug)
            const owned = !!(offerCfg && entitlementKeys.includes(offerCfg.entitlementKey))

            return (
              <DownloadOfferCard
                key={`${m._key}:${idx}:${o.albumSlug}`}
                albumSlug={o.albumSlug}
                owned={owned}
                teaserCopy={o.teaserCopy}
                coverImage={o.coverImage}
                productLabel={o.productLabel}
                highlights={o.highlights}
                techSpec={o.techSpec}
                assets={o.assets}
              />
            )
          })}
        </div>
      </div>
    )
  }

  if (m._type === 'moduleDownloads') {
    const offerCfg = getAlbumOffer(m.albumSlug)
    const owned = !!(offerCfg && entitlementKeys.includes(offerCfg.entitlementKey))

    return (
      <div
        key={m._key}
        style={{
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(255,255,255,0.04)',
          padding: 16,
          minWidth: 0,
        }}
      >
        <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
          <div style={{fontSize: 15, opacity: 0.92}}>{m.title ?? 'Downloads'}</div>
          {!owned ? <div style={{fontSize: 12, opacity: 0.65}}>locked</div> : null}
        </div>

        <div style={{marginTop: 12}}>
          <DownloadOfferCard
            albumSlug={m.albumSlug}
            owned={owned}
            teaserCopy={m.teaserCopy}
            coverImage={m.coverImage}
            productLabel={m.productLabel}
            highlights={m.highlights}
            techSpec={m.techSpec}
            assets={m.assets}
          />
        </div>
      </div>
    )
  }

  if (m._type === 'moduleArtistPosts') {
    return (
      <PortalArtistPosts
        key={m._key}
        title={m.title ?? 'Posts'}
        pageSize={m.pageSize ?? 10}
        requireAuthAfter={m.requireAuthAfter ?? 3}
        minVisibility={m.minVisibility ?? 'public'}
      />
    )
  }

  return null
}

// --------------------
// Tab inference
// --------------------

type BuiltTab = {
  id: string
  title: string
  locked?: boolean
  lockedHint?: string | null
  modules: PortalModule[]
}

function inferTabs(modules: PortalModule[], entitlementKeys: string[]): BuiltTab[] {
  const out: BuiltTab[] = []
  let current: BuiltTab | null = null

  const pushCurrent = () => {
    if (!current) return
    if (current.modules.length === 0) return
    out.push(current)
  }

  for (const m of modules) {
    if (m._type === 'moduleHeading') {
      pushCurrent()

      const title = (m.title ?? '').trim() || 'Portal'
      const id = slugify(title) || m._key

      current = {id, title, locked: false, lockedHint: null, modules: []}
      continue
    }

    if (!current) {
      current = {id: 'download', title: 'Download', locked: false, lockedHint: null, modules: []}
    }

    current.modules.push(m)
  }

  pushCurrent()

  for (const t of out) {
    const first = t.modules.find((x) => x._type !== 'moduleHeading') ?? null
    if (first && first._type === 'moduleRichText' && first.requiresEntitlement) {
      const entitled = hasKey(entitlementKeys, first.requiresEntitlement)
      if (!entitled) {
        t.locked = true
        t.lockedHint = 'Locked'
      }
    }
  }

  return out
}

// --------------------
// Main renderer
// --------------------

export default async function PortalModules(props: Props) {
  const {modules, memberId} = props
  const entitlementKeys = memberId ? await listCurrentEntitlementKeys(memberId) : []

  const tabsBuilt = inferTabs(modules, entitlementKeys)

  const tabs: PortalTabSpec[] = tabsBuilt.map((t) => ({
    id: t.id,
    title: t.title,
    locked: t.locked,
        lockedHint: t.lockedHint,
    content: (
      <div style={{display: 'grid', gap: 14, minWidth: 0}}>
        {t.modules.map((m) => renderModule(m, entitlementKeys))}
      </div>
    ),
  }))

  return <PortalTabs tabs={tabs} defaultTabId={tabs[0]?.id ?? null} queryParam="p" />
}
