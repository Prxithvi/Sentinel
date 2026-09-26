// components/views/fraud-network-canvas.tsx
'use client'

import { useEffect, useRef } from 'react'

type Node = { x: number; y: number; vx: number; vy: number; r: number }

/**
 * Slow-drifting node graph used as ambient texture behind the login copy.
 * A couple of nodes are periodically marked "flagged" and pulse — a quiet
 * nod to DATA → ANALYSIS → RISK → ALERT without spelling it out in copy.
 * Fully static (single paint, no rAF loop) when prefers-reduced-motion is set.
 */
export function FraudNetworkCanvas({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    let width = 0
    let height = 0
    const nodes: Node[] = []
    const NODE_COUNT = 22
    const LINK_DIST = 150

    function resize() {
      const rect = parent!.getBoundingClientRect()
      width = rect.width
      height = rect.height
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${height}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function seed() {
      nodes.length = 0
      for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r: 1.6 + Math.random() * 1.8,
        })
      }
    }

    resize()
    seed()

    let raf = 0
    let pulseT = 0
    let flagged = new Set<number>()

    function pickFlags() {
      flagged = new Set()
      const n = 2 + Math.floor(Math.random() * 2)
      while (flagged.size < n) flagged.add(Math.floor(Math.random() * nodes.length))
    }
    pickFlags()

    function paint() {
      ctx!.clearRect(0, 0, width, height)

      // links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.16
            const isFlaggedLink = flagged.has(i) || flagged.has(j)
            ctx!.strokeStyle = isFlaggedLink
              ? `rgba(15, 107, 76, ${alpha + 0.22})`
              : `rgba(16, 24, 38, ${alpha})`
            ctx!.lineWidth = 1
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      // nodes
      nodes.forEach((n, i) => {
        const isFlag = flagged.has(i)
        ctx!.beginPath()
        ctx!.arc(n.x, n.y, isFlag ? n.r + 1.2 : n.r, 0, Math.PI * 2)
        ctx!.fillStyle = isFlag ? 'rgba(15, 107, 76, 0.85)' : 'rgba(16, 24, 38, 0.24)'
        ctx!.fill()

        if (isFlag) {
          const ringR = n.r + 5 + Math.sin(pulseT * Math.PI * 2) * 2
          ctx!.beginPath()
          ctx!.arc(n.x, n.y, ringR, 0, Math.PI * 2)
          ctx!.strokeStyle = 'rgba(15, 107, 76, 0.22)'
          ctx!.lineWidth = 1
          ctx!.stroke()
        }
      })
    }

    if (reduced) {
      // Single static paint — no motion, no timers.
      paint()
    } else {
      const step = () => {
        for (const n of nodes) {
          n.x += n.vx
          n.y += n.vy
          if (n.x < 0 || n.x > width) n.vx *= -1
          if (n.y < 0 || n.y > height) n.vy *= -1
        }
        pulseT += 0.006
        if (pulseT > 1) {
          pulseT = 0
          pickFlags()
        }
        paint()
        raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }

    const onResize = () => resize()
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}