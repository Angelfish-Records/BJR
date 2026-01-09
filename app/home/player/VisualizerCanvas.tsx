'use client'

import React from 'react'

export default function VisualizerCanvas() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const sizeRef = React.useRef<{w: number; h: number; dpr: number}>({w: 1, h: 1, dpr: 1})

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const ro = new ResizeObserver(() => {
      const r = parent.getBoundingClientRect()
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
      sizeRef.current = {w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)), dpr}
      canvas.width = Math.floor(sizeRef.current.w * dpr)
      canvas.height = Math.floor(sizeRef.current.h * dpr)
      canvas.style.width = `${sizeRef.current.w}px`
      canvas.style.height = `${sizeRef.current.h}px`
    })

    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    const loop = (t: number) => {
      const {w, h, dpr} = sizeRef.current
      const W = Math.floor(w * dpr)
      const H = Math.floor(h * dpr)
      if (canvas.width !== W) canvas.width = W
      if (canvas.height !== H) canvas.height = H

      if (!prefersReduced) {
        const tt = t / 1000
        const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.7)
        g.addColorStop(0, `rgba(170,170,255,${0.22 + 0.04 * Math.sin(tt * 0.9)})`)
        g.addColorStop(0.45, `rgba(255,255,255,${0.06 + 0.02 * Math.sin(tt * 1.3)})`)
        g.addColorStop(1, `rgba(0,0,0,0.0)`)

        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, 0, W, H)

        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)

        // faint moving bands
        ctx.globalAlpha = 0.18
        for (let i = 0; i < 6; i++) {
          const y = ((tt * 18 + i * 90) % (H + 180)) - 180
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fillRect(0, y, W, 28)
        }
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, 0, W, H)
      }

      rafRef.current = window.requestAnimationFrame(loop)
    }

    rafRef.current = window.requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  )
}
