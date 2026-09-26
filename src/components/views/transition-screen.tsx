// components/transition-screen.tsx
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

const STATUS_MESSAGES = [
  'Authenticating investigator...',
  'Loading intelligence...',
  'Analyzing risk signals...',
  'Preparing dashboard...',
]

export function TransitionScreen({ onDone }: { onDone?: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const stepMs = reduced ? 0 : 270
    const totalMs = reduced ? 250 : 1500

    const timers: number[] = []
    STATUS_MESSAGES.forEach((_, i) => {
      timers.push(window.setTimeout(() => setVisibleCount(i + 1), 200 + i * stepMs))
    })
    timers.push(window.setTimeout(() => onDone?.(), totalMs))

    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--sentinel-bg)] animate-fade-in">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <div className="relative w-14 h-14 animate-scale-in">
          <Image src="/logo.png" alt="Sentinel" fill sizes="56px" className="object-contain" priority />
        </div>

        <p className="font-display text-lg font-medium tracking-tight text-[var(--sentinel-navy)]">
          Initializing Sentinel
        </p>

        <div className="h-24 flex flex-col items-center justify-start gap-1.5 text-sm text-[var(--sentinel-navy-muted)]">
          {STATUS_MESSAGES.map((msg, i) => (
            <span
              key={msg}
              className={`transition-opacity duration-300 ${
                i < visibleCount ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {msg}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}