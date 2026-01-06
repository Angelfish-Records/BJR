import React from 'react'
import {listCurrentEntitlementKeys} from '../../lib/entitlements'
import PortalRichText from './modules/PortalRichText'
import {getAlbumOffer} from '../../lib/albumOffers'
import BuyAlbumButton from './modules/BuyAlbumButton'

// Local discriminated union so we don't depend on lib/portal exporting PortalModule correctly yet.
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
}

type PortalModule = ModuleHeading | ModuleRichText | ModuleCardGrid | ModuleDownloads

type Props = {
  modules: PortalModule[]
  memberId: string | null
}

function hasKey(entitlementKeys: string[], key: string | null | undefined): boolean {
  if (!key) return true
  return entitlementKeys.includes(key)
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

function DownloadsModule(props: {
  title?: string
  albumSlug: string
  teaserCopy?: string
  owned: boolean
}) {
  const {title, albumSlug, teaserCopy, owned} = props
  const offer = getAlbumOffer(albumSlug)

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
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.75, lineHeight: 1.55}}>
          Missing AlbumOffer config for <code style={{opacity: 0.9}}>{albumSlug}</code>. Add it in{' '}
          <code style={{opacity: 0.9}}>web/lib/albumOffers.ts</code>.
        </div>
      ) : owned ? (
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.82, lineHeight: 1.55}}>
          <div style={{opacity: 0.85}}>Owned: {offer.title}</div>
          <div style={{marginTop: 8, opacity: 0.75}}>
            Downloads will appear here next. Planned inclusions:{' '}
            {offer.includes.map((x: string) => (
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
        </div>
      ) : (
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.80, lineHeight: 1.55}}>
          <div style={{opacity: 0.85}}>
            {teaserCopy ?? 'Buy the digital album to unlock downloads (perpetual).'}
          </div>

          <div style={{marginTop: 10, opacity: 0.9}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
              <BuyAlbumButton albumSlug={albumSlug} label="Buy digital album" />
              <span style={{opacity: 0.7}}>•</span>
              <span style={{opacity: 0.85}}>{offer.title}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default async function PortalModules(props: Props) {
  const {modules, memberId} = props
  const entitlementKeys = memberId ? await listCurrentEntitlementKeys(memberId) : []

  return (
    <div style={{display: 'grid', gap: 14, minWidth: 0}}>
      {modules.map((m) => {
        if (m._type === 'moduleHeading') {
          return (
            <div key={m._key} style={{padding: '6px 2px'}}>
              <div style={{fontSize: 16, opacity: 0.92}}>{m.title}</div>
              {m.blurb ? (
                <div style={{marginTop: 6, fontSize: 13, opacity: 0.72, lineHeight: 1.55}}>
                  {m.blurb}
                </div>
              ) : null}
            </div>
          )
        }

        if (m._type === 'moduleRichText') {
          const required = m.requiresEntitlement ?? null
          const entitled = hasKey(entitlementKeys, required)
          const blocks = entitled ? (m.full ?? m.teaser ?? []) : (m.teaser ?? [])
          const locked = !!required && !entitled

          return <PortalRichText key={m._key} title={m.title} blocks={blocks} locked={locked} />
        }

        if (m._type === 'moduleCardGrid') {
          return (
            <div
              key={m._key}
              style={{
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(255,255,255,0.04)',
                padding: 16,
              }}
            >
              {m.title ? (
                <div style={{fontSize: 15, opacity: 0.92, marginBottom: 10}}>{m.title}</div>
              ) : null}

              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {m.cards.map((c) => {
                  const entitled = hasKey(entitlementKeys, c.requiresEntitlement ?? null)
                  const locked = !!c.requiresEntitlement && !entitled
                  return <PanelCard key={c._key} title={c.title} body={c.body} locked={locked} />
                })}
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
            />
          )
        }

        return null
      })}
    </div>
  )
}
