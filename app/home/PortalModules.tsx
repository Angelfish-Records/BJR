// web/app/home/PortalModules.tsx
import React from 'react'
import {listCurrentEntitlementKeys} from '../../lib/entitlements'
import PortalRichText from './modules/PortalRichText'
import {getAlbumOffer, type AlbumOfferAsset} from '../../lib/albumOffers'
import BuyAlbumButton from './modules/BuyAlbumButton'
import DownloadAlbumButton from './modules/DownloadAlbumButton'
import PortalTabs, {type PortalTabSpec} from './PortalTabs'

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

type ModuleDownloads = {
  _key: string
  _type: 'moduleDownloads'
  title?: string
  albumSlug: string
  teaserCopy?: string
  assets?: Array<{assetId: string; label?: string}>
}

type PortalModule = ModuleHeading | ModuleRichText | ModuleCardGrid | ModuleDownloads

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

// --------------------
// Downloads module
// --------------------

type DownloadsModuleProps = {
  title?: string
  albumSlug: string
  teaserCopy?: string
  owned: boolean
  assets?: Array<{assetId: string; label?: string}>
}

function DownloadsModule(props: DownloadsModuleProps) {
  const {title, albumSlug, teaserCopy, owned, assets} = props
  const offer = getAlbumOffer(albumSlug)

  const offerAssets: AlbumOfferAsset[] = offer?.assets ?? []

  const configured = assets && assets.length > 0 ? assets : null

  const assetsToRender: Array<{
    asset: AlbumOfferAsset
    labelOverride?: string
  }> = []

  if (configured) {
    for (const sel of configured) {
      const found = offerAssets.find((a) => a.id === sel.assetId)
      if (found) assetsToRender.push({asset: found, labelOverride: sel.label})
    }
  } else {
    for (const asset of offerAssets) assetsToRender.push({asset})
  }

  const missingConfiguredIds =
    configured?.filter((sel) => !offerAssets.some((a) => a.id === sel.assetId)) ?? []

  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 16,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10}}>
        <div style={{fontSize: 15, opacity: 0.92}}>{title ?? 'Downloads'}</div>
        {!owned ? <div style={{fontSize: 12, opacity: 0.65}}>locked</div> : null}
      </div>

      {!offer ? (
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.75}}>
          Missing AlbumOffer config for <code>{albumSlug}</code>.
        </div>
      ) : owned ? (
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.82}}>
          <div style={{opacity: 0.85}}>Owned: {offer.title}</div>

          {offerAssets.length === 0 ? (
            <div style={{marginTop: 10, opacity: 0.75}}>
              No downloadable assets configured in <code>albumOffers.ts</code>.
            </div>
          ) : (
            <>
              {missingConfiguredIds.length > 0 ? (
                <div style={{marginTop: 10, opacity: 0.75}}>
                  Invalid assetId(s) referenced in Sanity: {missingConfiguredIds.map((x) => x.assetId).join(', ')}
                </div>
              ) : null}

              <div style={{marginTop: 10}}>
                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                  {assetsToRender.map(({asset, labelOverride}) => (
                    <DownloadAlbumButton
                      key={asset.id}
                      albumSlug={albumSlug}
                      assetId={asset.id}
                      label={labelOverride ?? asset.label}
                    />
                  ))}
                  <span style={{opacity: 0.7}}>•</span>
                  <span style={{opacity: 0.85}}>{offer.title}</span>
                </div>
              </div>

              <div style={{marginTop: 10, opacity: 0.75}}>
                Planned inclusions:{' '}
                {offer.includes.map((x) => (
                  <span
                    key={x}
                    style={{
                      display: 'inline-block',
                      marginLeft: 8,
                      padding: '2px 10px',
                      borderRadius: 999,
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'rgba(255,255,255,0.03)',
                      fontSize: 12,
                    }}
                  >
                    {x}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.80}}>
          <div>{teaserCopy ?? 'Buy the digital album to unlock downloads (perpetual).'}</div>
          <div style={{marginTop: 10}}>
            <BuyAlbumButton albumSlug={albumSlug} label="Buy digital album" />
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
  if (m._type === 'moduleHeading') {
    // headings become tabs; we don’t render them inside tab content
    return null
  }

  if (m._type === 'moduleRichText') {
    const entitled = hasKey(entitlementKeys, m.requiresEntitlement)
    const blocks = entitled ? m.full ?? m.teaser ?? [] : m.teaser ?? []
    return (
      <PortalRichText
        key={m._key}
        title={m.title}
        blocks={blocks}
        locked={!!m.requiresEntitlement && !entitled}
      />
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

  if (m._type === 'moduleDownloads') {
  const offer = getAlbumOffer(m.albumSlug)
  const owned = !!(offer && entitlementKeys.includes(offer.entitlementKey))

  return (
    <DownloadsModule
      key={m._key}
      title={m.title}
      albumSlug={m.albumSlug}
      teaserCopy={m.teaserCopy}
      owned={owned}
      assets={m.assets}
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

/**
 * Tab-level gating (convention-based, no schema change):
 * If the first non-heading module in a tab is moduleRichText with requiresEntitlement,
 * we treat the tab as "tab-locked" when not entitled.
 *
 * You can use this to make whole tabs gated by:
 * - putting teaser = small gate blurb
 * - putting full = the actual tab content (or follow-on modules that you only include when entitled)
 */
function inferTabs(modules: PortalModule[], entitlementKeys: string[]): BuiltTab[] {
  const out: BuiltTab[] = []

  let current: BuiltTab | null = null

  const pushCurrent = () => {
    if (!current) return
    // drop empty tabs
    if (current.modules.length === 0) return
    out.push(current)
  }

  for (const m of modules) {
    if (m._type === 'moduleHeading') {
      pushCurrent()

      const title = (m.title ?? '').trim() || 'Portal'
      const id = slugify(title) || m._key

      current = {
        id,
        title,
        locked: false,
        lockedHint: null,
        modules: [],
      }
      continue
    }

    // If no heading has appeared yet, create a default tab
    if (!current) {
      current = {
        id: 'portal',
        title: 'Portal',
        locked: false,
        lockedHint: null,
        modules: [],
      }
    }

    current.modules.push(m)
  }

  pushCurrent()

  // Compute tab-level lock using the convention
  for (const t of out) {
    const first = t.modules.find((x) => x._type !== 'moduleHeading') ?? null
    if (first && first._type === 'moduleRichText' && first.requiresEntitlement) {
      const entitled = hasKey(entitlementKeys, first.requiresEntitlement)
      if (!entitled) {
        t.locked = true
        t.lockedHint = 'Locked'
        // Optional stricter mode (commented): hide everything except the first module when locked.
        // If you want “entire tab gated” in practice, uncomment this so only the gate blurb shows.
        // t.modules = [first]
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

  return <PortalTabs tabs={tabs} defaultTabId={tabs[0]?.id ?? null} queryParam="pt" />
}
