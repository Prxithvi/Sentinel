'use client'

// Auth context — lightweight session store
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'analyst' | 'auditor' | 'citizen'
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetched, setFetched] = useState(false)

  const refresh = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'GET' })
      const data = await res.json()
      setUser(data.user || null)
    } catch {
      setUser(null)
    }
    setLoading(false)
    setFetched(true)
  }

  // Run once on mount — fetch current user (no setState directly in effect body, all via async)
  useEffect(() => {
    if (fetched) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/logout', { method: 'GET' })
        const data = await res.json()
        if (!cancelled) {
          setUser(data.user || null)
          setLoading(false)
          setFetched(true)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          setLoading(false)
          setFetched(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [fetched])

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setUser(data.user)
    return true
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>
}

export function useAuth() {
  return useContext(Ctx)
}
