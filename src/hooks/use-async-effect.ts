'use client'
// Helper hook to safely run an async effect that sets state
import { useEffect, useRef } from 'react'

export function useAsyncEffect(fn: () => Promise<void> | (() => void), deps: any[]) {
  useEffect(() => {
    let cancelled = false
    let cleanup: void | (() => void)
    ;(async () => {
      try {
        if (!cancelled) {
          cleanup = await fn()
        }
      } catch (e) {
        console.error('[useAsyncEffect]', e)
      }
    })()
    return () => {
      cancelled = true
      if (typeof cleanup === 'function') cleanup()
    }
  }, deps)
}
