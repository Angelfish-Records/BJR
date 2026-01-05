import React from 'react'
import {ENTITLEMENTS} from '../../lib/vocab'
import type {PortalModuleRichText} from '../../lib/portal'
import {hasAnyEntitlement} from '../../lib/entitlements'
import PortalRichText from './modules/PortalRichText'

type Props = {
  modules: PortalModuleRichText[]
  memberId: string | null
}

export default async function PortalModules({modules, memberId}: Props) {
  return (
    <div style={{display: 'grid', gap: 14}}>
      {modules.map(async (m) => {
        if (m._type !== 'moduleRichText') return null

        // If module declares a required entitlement, enforce it server-side.
        let allowed = false
        const reqKey = (m.requiresEntitlement ?? '').trim()

        if (!reqKey) {
          // no gate → always allow full
          allowed = true
        } else if (memberId) {
          // treat requiresEntitlement as literal entitlement key string
          allowed = await hasAnyEntitlement(memberId, [reqKey, ENTITLEMENTS.LIFETIME_ACCESS])
        } else {
          allowed = false
        }

        return (
          <PortalRichText
            key={m._key}
            title={m.title}
            blocks={allowed ? m.full ?? m.teaser ?? [] : m.teaser ?? []}
            locked={!allowed}
          />
        )
      })}
    </div>
  )
}
