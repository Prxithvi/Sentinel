// components/views/auth-view.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { FraudNetworkCanvas } from './fraud-network-canvas'
import { TransitionScreen } from './transition-screen'

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@mplad.gov.in', password: 'admin123' },
  { role: 'Analyst', email: 'analyst@mplad.gov.in', password: 'analyst123' },
  { role: 'Auditor', email: 'auditor@mplad.gov.in', password: 'auditor123' },
  { role: 'Citizen', email: 'citizen@citizen.in', password: 'citizen123' },
]

type Phase = 'idle' | 'submitting' | 'success'

export function AuthView({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('admin@mplad.gov.in')
  const [password, setPassword] = useState('admin123')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPhase('submitting')
    setError(null)

    const ok = await login(email, password)

    if (!ok) {
      setPhase('idle')
      setError('Invalid credentials. Try a demo account below.')
      return
    }
    // Do not switch views yet — the transition screen calls onLoginSuccess
    // once its sequence finishes, so the dashboard never appears instantly.
    setPhase('success')
  }

  if (phase === 'success') {
    return <TransitionScreen onDone={onLoginSuccess} />
  }

  return (
    <div className="min-h-screen bg-[var(--sentinel-bg)]">
      <div className="min-h-screen grid lg:grid-cols-[1.15fr_1fr]">
        {/* Left — brand & context */}
        <div className="relative hidden lg:flex flex-col justify-center overflow-hidden px-16 xl:px-24">
          <FraudNetworkCanvas className="absolute inset-0 h-full w-full" />

          <div className="relative z-10 max-w-lg animate-slide-right stagger-1">
            <div className="flex items-center gap-3 mb-10">
              <div className="relative w-9 h-9 shrink-0">
                <Image src="/logo.png" alt="Sentinel" fill sizes="36px" className="object-contain" priority />
              </div>
              <span className="font-display text-2xl font-medium tracking-tight text-[var(--sentinel-navy)]">
                Sentinel
              </span>
            </div>

            <h1 className="font-display text-[2.4rem] leading-[1.1] font-medium tracking-tight text-[var(--sentinel-navy)] mb-4">
              AI-powered fraud detection platform
            </h1>

            <p className="text-[15px] leading-relaxed text-[var(--sentinel-navy-muted)] max-w-md">
              Detect suspicious transactions, anomalous works, vendor networks and
              potential fraud before they become losses.
            </p>
          </div>

          <div className="absolute right-0 top-0 h-full w-px bg-[var(--sentinel-line)]" />
        </div>

        {/* Right — sign in */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm">
            {/* Mobile brand mark — left panel is hidden below lg */}
            <div className="flex lg:hidden items-center gap-2.5 mb-10 animate-fade-in">
              <div className="relative w-8 h-8 shrink-0">
                <Image src="/logo.png" alt="Sentinel" fill sizes="32px" className="object-contain" />
              </div>
              <span className="font-display text-xl font-medium tracking-tight text-[var(--sentinel-navy)]">
                Sentinel
              </span>
            </div>

            <div className="animate-slide-up stagger-2 rounded-2xl border border-[var(--sentinel-line)] bg-white/70 backdrop-blur-md shadow-[0_1px_2px_rgba(16,24,38,0.04),0_12px_32px_-16px_rgba(16,24,38,0.18)] p-8 sm:p-9">
              <h2 className="font-display text-xl font-medium tracking-tight text-[var(--sentinel-navy)]">
                Welcome to Sentinel
              </h2>
              <p className="mt-1.5 text-sm text-[var(--sentinel-navy-muted)]">
                Secure investigator access
              </p>

              <form onSubmit={submit} className="mt-7 space-y-4">
                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[var(--sentinel-navy)]">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-[var(--sentinel-line)] focus-visible:ring-[var(--sentinel-green-500)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[var(--sentinel-navy)]">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-[var(--sentinel-line)] focus-visible:ring-[var(--sentinel-green-500)]"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={phase === 'submitting'}
                  className="w-full bg-[var(--sentinel-green-700)] hover:bg-[var(--sentinel-green-900)] transition-colors duration-200 hover:shadow-[0_4px_16px_-4px_rgba(15,107,76,0.45)]"
                >
                  {phase === 'submitting' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Securing session...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>

              <div className="mt-7 pt-6 border-t border-[var(--sentinel-line)]">
                <p className="text-xs text-[var(--sentinel-navy-muted)] mb-2.5">Demo accounts</p>
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => {
                        setEmail(a.email)
                        setPassword(a.password)
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-full border border-[var(--sentinel-line)] text-[var(--sentinel-navy-muted)] hover:border-[var(--sentinel-green-500)] hover:text-[var(--sentinel-green-700)] hover:bg-[var(--sentinel-green-100)] transition-colors duration-150"
                    >
                      {a.role}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}