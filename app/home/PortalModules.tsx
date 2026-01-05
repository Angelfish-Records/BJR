// web/app/home/PortalModules.tsx
import React from 'react'
import PortalRichText from './modules/PortalRichText'
import type {PortalModule} from '../../lib/portal'

export default function PortalModules(props: {
  modules: PortalModule[]
  memberId: string | null
  entitlementKeys: string[]
}) {
  const {modules, memberId, entitlementKeys} = props

  return (
    <div style={{display: 'grid', gap: 14, minWidth: 0}}>
      {modules.map((m, idx) => {
        const isAuthed = !!memberId
        const required = (m.requiresEntitlement ?? '').toString().trim()
        const isEntitled = !required || entitlementKeys.includes(required)
        const locked = !isAuthed || !isEntitled

        if (m._type === 'moduleRichText') {
          return (
            <PortalRichText
              key={m._key ?? `moduleRichText_${idx}`}
              title={m.title}
              locked={locked}
              teaserBlocks={m.teaser ?? []}
              blocks={m.full ?? []}
            />
          )
        }

        return (
          <div
            key={m._key ?? `${m._type}_${idx}`}
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
            Unknown module type: <code style={{opacity: 0.9}}>{m._type}</code>
          </div>
        )
      })}
    </div>
  )
}
