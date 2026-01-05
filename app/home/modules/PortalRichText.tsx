// web/app/home/modules/PortalRichText.tsx
import React from 'react'
import {PortableText} from '@portabletext/react'
import type {PortableTextBlock} from '@portabletext/types'

export default function PortalRichText(props: {
  title?: string
  blocks: PortableTextBlock[]
  teaserBlocks?: PortableTextBlock[]
  locked?: boolean
}) {
  const {title, blocks, teaserBlocks = [], locked} = props
  const value: PortableTextBlock[] = locked ? teaserBlocks : blocks

  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 16,
      }}
    >
      {title ? (
        <div style={{fontSize: 15, opacity: 0.92, marginBottom: 8}}>
          {title}
          {locked ? <span style={{marginLeft: 10, fontSize: 12, opacity: 0.65}}>locked</span> : null}
        </div>
      ) : null}

      <div style={{fontSize: 13, opacity: 0.82, lineHeight: 1.65}}>
        <PortableText value={value} />
      </div>
    </div>
  )
}
