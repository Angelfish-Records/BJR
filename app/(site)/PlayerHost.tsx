// web/app/(site)/PlayerHost.tsx
'use client'

import React from 'react'
import {PlayerStateProvider} from '@/app/home/player/PlayerState'
import AudioEngine from '@/app/home/player/AudioEngine'

export default function PlayerHost({children}: {children: React.ReactNode}) {
  return (
    <PlayerStateProvider>
      <AudioEngine />
      {children}
    </PlayerStateProvider>
  )
}
