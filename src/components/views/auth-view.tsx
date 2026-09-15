// Auth view — login form
'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { ShieldCheck, Loader2 } from 'lucide-react'

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@mplad.gov.in', password: 'admin123', desc: 'Full access + PII reveal' },
  { role: 'Analyst', email: 'analyst@mplad.gov.in', password: 'analyst123', desc: 'Investigation workflow' },
  { role: 'Auditor', email: 'auditor@mplad.gov.in', password: 'auditor123', desc: 'Field verification' },
  { role: 'Citizen', email: 'citizen@citizen.in', password: 'citizen123', desc: 'Public portal access' },
]

export function AuthView({ onLoginSuccess }: { onLoginSuccess?: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('admin@mplad.gov.in')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const ok = await login(email, password)
    setLoading(false)
    if (!ok) setError('Invalid credentials. Try a demo account below.')
    else onLoginSuccess?.()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center">
        <div className="space-y-6 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">MPLAD Sentinel</h1>
              <p className="text-sm text-slate-600">AI-powered fraud detection for the MPLAD Scheme</p>
            </div>
          </div>
          <p className="text-slate-700 leading-relaxed">
            Detect fund diversion, ghost works, duplicate billing, and contractor collusion at scale — with explainable ML, graph-based ring detection, and a tamper-evident audit trail for legally defensible flags.
          </p>
          <div className="bg-white/60 backdrop-blur rounded-lg p-4 border border-slate-200">
            <p className="text-xs font-semibold text-slate-700 uppercase mb-2">Demo accounts — click to autofill</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.email} onClick={() => { setEmail(a.email); setPassword(a.password) }}
                  className="text-left p-2 rounded border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition">
                  <div className="font-semibold text-sm text-slate-900">{a.role}</div>
                  <div className="text-xs text-slate-600">{a.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use a demo account above or your credentials</CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="space-y-4">
              {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Signing in…</> : 'Sign in'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
