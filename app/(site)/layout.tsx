// web/app/(site)/layout.tsx
import React from 'react'
import PlayerHost from './PlayerHost'

export default function SiteLayout({children}: {children: React.ReactNode}) {
  return <PlayerHost>{children}</PlayerHost>
}
