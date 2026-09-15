// Case detail — timeline + SHAP waterfall + audit chain verify + copilot + PDF export
'use client'
import { useState, useRef } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { ShieldCheck, ShieldAlert, FileDown, Send, Lock, Unlock, Bot, User, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, ReferenceLine,
} from 'recharts'

interface CaseDetail {
  case: { id: string; caseId: string; status: string; priority: string; notes: string; createdAt: string; updatedAt: string }
  work: {
    id: string; workId: string; title: string; description: string; category: string
    fundSanctioned: number; fundUtilized: number; utilizationRate: number; status: string
    stateName: string; districtName: string; mpName: string
    vendor: { id: string; vendorId: string; name: string; pan: string; gst: string | null; bankAccount: string; phone: string | null; address: string | null } | null
    payments: { amount: number; paidAt: string; instrument: string; reference: string }[]
    risk: {
      ruleScore: number; isoScore: number; aeScore: number; graphScore: number; nlpScore: number
      ensembleScore: number; riskTier: string; blacklistMatch: boolean
      ruleFlags: { code: string; label: string; weight: number; evidence: string }[]
      shap: { feature: string; value: number; contribution: number; direction: string }[]
    } | null
  }
  auditLog: { id: string; action: string; actorName: string; timestamp: string; prevHash: string; thisHash: string; recomputedHash: string; valid: boolean }[]
  auditChainValid: boolean
  brokenAt: string | null
  notifications: { id: string; channel: string; recipient: string; subject: string; status: string; sentAt: string }[]
}

export function CaseDetailView({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [newStatus, setNewStatus] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [copilotQ, setCopilotQ] = useState('')
  const [copilotA, setCopilotA] = useState<{ answer: string; sources: { field: string; value: string }[]; refused: boolean } | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [revealedVendor, setRevealedVendor] = useState<{ pan: string; gst: string | null; bankAccount: string; phone: string | null } | null>(null)
  const copilotScrollRef = useRef<HTMLDivElement>(null)

  const refresh = async () => {
    setLoading(true)
    const res = await fetch(`/api/cases/${caseId}/detail`)
    if (res.ok) {
      const d = await res.json()
      setDetail(d)
      setNewStatus(d.case.status)
      setNotes(d.case.notes || '')
    }
    setLoading(false)
  }

  useAsyncEffect(async () => { await refresh() }, [caseId])

  const updateStatus = async () => {
    const res = await fetch(`/api/cases/${caseId}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, notes }),
    })
    if (res.ok) {
      toast({ title: 'Case updated', description: `Status → ${newStatus}` })
      refresh()
    }
  }

  const askCopilot = async () => {
    if (!copilotQ.trim()) return
    setCopilotLoading(true); setCopilotA(null)
    const res = await fetch('/api/copilot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, question: copilotQ }),
    })
    if (res.ok) {
      const data = await res.json()
      setCopilotA(data)
    }
    setCopilotLoading(false)
    setCopilotQ('')
  }

  const revealPii = async () => {
    const res = await fetch(`/api/cases/${caseId}/reveal`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setRevealedVendor(data.vendor)
      setRevealed(true)
      toast({ title: 'PII revealed', description: 'Action logged to audit trail.' })
    } else {
      toast({ title: 'Access denied', description: 'Admin role required.', variant: 'destructive' })
    }
  }

  const verifyChain = () => {
    toast({
      title: detail?.auditChainValid ? 'Chain valid' : 'Chain broken!',
      description: detail?.auditChainValid
        ? 'All audit entries are hash-consistent.'
        : `Tamper detected at entry ${detail?.brokenAt?.substring(0, 8)}`,
      variant: detail?.auditChainValid ? 'default' : 'destructive',
    })
  }

  if (loading || !detail) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const shapData = detail.work.risk?.shap.map(s => ({
    name: s.feature,
    contribution: s.direction === 'positive' ? s.contribution : -s.contribution,
  })) || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>← Back to cases</Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={verifyChain}>
            <ShieldCheck className="w-4 h-4 mr-1" /> Verify Chain
          </Button>
          <a href={`/api/reports/${caseId}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="outline"><FileDown className="w-4 h-4 mr-1" /> Export PDF</Button>
          </a>
        </div>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold">{detail.case.caseId}</h2>
                <Badge style={{
                  background: detail.work.risk?.riskTier === 'critical' ? '#dc2626' : '#ea580c',
                  color: 'white'
                }}>{detail.work.risk?.riskTier || '—'}</Badge>
                {detail.work.risk?.blacklistMatch && <Badge className="bg-red-700 text-white">Blacklist Match</Badge>}
                <Badge variant="outline">{detail.case.priority}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{detail.work.workId} — {detail.work.title}</p>
              <p className="text-xs text-muted-foreground">{detail.work.stateName} • {detail.work.districtName} • MP: {detail.work.mpName}</p>
            </div>
            <div className="flex items-center gap-2">
              {detail.auditChainValid ? (
                <Badge className="bg-emerald-100 text-emerald-800"><ShieldCheck className="w-3 h-3 mr-1" /> Chain valid</Badge>
              ) : (
                <Badge variant="destructive"><ShieldAlert className="w-3 h-3 mr-1" /> Chain BROKEN</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column — work details + payments */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Work & Vendor</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div><span className="text-muted-foreground">Category:</span> {detail.work.category}</div>
            <div><span className="text-muted-foreground">Sanctioned:</span> <span className="font-bold">₹{detail.work.fundSanctioned}L</span></div>
            <div><span className="text-muted-foreground">Utilized:</span> <span className="font-bold">₹{detail.work.fundUtilized}L</span></div>
            <div><span className="text-muted-foreground">Utilization:</span> <span className="font-bold">{(detail.work.utilizationRate * 100).toFixed(1)}%</span></div>
            <div><span className="text-muted-foreground">Status:</span> {detail.work.status}</div>
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Vendor</span>
                {user?.role === 'admin' && !revealed && (
                  <Button size="sm" variant="outline" onClick={revealPii}><Lock className="w-3 h-3 mr-1" /> Reveal PII</Button>
                )}
                {revealed && <Badge className="bg-emerald-100 text-emerald-800"><Unlock className="w-3 h-3 mr-1" /> Revealed</Badge>}
              </div>
              <div className="mt-1">
                <div><span className="text-muted-foreground">Name:</span> {detail.work.vendor?.name || '—'}</div>
                <div>
                  <span className="text-muted-foreground">PAN:</span>{' '}
                  {revealed && revealedVendor ? (
                    <span className="font-mono text-emerald-700">{revealedVendor.pan}</span>
                  ) : (
                    <span className="font-mono">{detail.work.vendor?.pan.substring(0, 3)}XXXXX{detail.work.vendor?.pan.substring(8)}</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Bank:</span>{' '}
                  {revealed && revealedVendor ? (
                    <span className="font-mono text-emerald-700">{revealedVendor.bankAccount}</span>
                  ) : (
                    <span className="font-mono">XXXXXX{detail.work.vendor?.bankAccount.substring(10)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="font-semibold mb-1">Payments ({detail.work.payments.length})</div>
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {detail.work.payments.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span>{new Date(p.paidAt).toLocaleDateString()}</span>
                      <span className="font-mono">₹{p.amount.toFixed(1)}L</span>
                      <span className="text-muted-foreground">{p.instrument}</span>
                    </div>
                  ))}
                  {detail.work.payments.length === 0 && <div className="text-muted-foreground">No payments recorded (ghost work indicator)</div>}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Middle — SHAP waterfall */}
        <Card>
          <CardHeader><CardTitle className="text-sm">SHAP Explanation</CardTitle></CardHeader>
          <CardContent>
            {shapData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={shapData} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} domain={[-0.3, 0.3]} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip formatter={(v: number) => v.toFixed(4)} />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                    {shapData.map((entry, i) => (
                      <Cell key={i} fill={entry.contribution >= 0 ? '#dc2626' : '#16a34a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-xs text-muted-foreground py-10 text-center">No SHAP data</div>}

            <div className="mt-3">
              <div className="text-xs font-semibold mb-1">Rule Flags</div>
              <div className="space-y-1">
                {detail.work.risk?.ruleFlags.map((f, i) => (
                  <div key={i} className="text-xs border-l-2 border-red-500 pl-2">
                    <div className="font-medium">{f.label} ({(f.weight * 100).toFixed(0)}%)</div>
                    <div className="text-muted-foreground text-[11px]">{f.evidence}</div>
                  </div>
                ))}
                {(!detail.work.risk?.ruleFlags || detail.work.risk.ruleFlags.length === 0) && (
                  <div className="text-xs text-muted-foreground">No rule flags</div>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2 rounded">
                <div className="text-muted-foreground">Rule Score</div>
                <div className="font-bold">{((detail.work.risk?.ruleScore || 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <div className="text-muted-foreground">Isolation Forest</div>
                <div className="font-bold">{((detail.work.risk?.isoScore || 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <div className="text-muted-foreground">Autoencoder</div>
                <div className="font-bold">{((detail.work.risk?.aeScore || 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <div className="text-muted-foreground">Graph</div>
                <div className="font-bold">{((detail.work.risk?.graphScore || 0) * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-emerald-50 p-2 rounded col-span-2">
                <div className="text-muted-foreground">Ensemble Score</div>
                <div className="font-bold text-lg text-emerald-700">{((detail.work.risk?.ensembleScore || 0) * 100).toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right — Audit chain + Copilot */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                Audit Trail
                {detail.auditChainValid
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : <XCircle className="w-4 h-4 text-red-600" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-72">
                <div className="space-y-2">
                  {detail.auditLog.map((e, i) => (
                    <div key={e.id} className="border-l-2 pl-2 text-xs" style={{ borderColor: e.valid ? '#16a34a' : '#dc2626' }}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{e.action}</span>
                        {e.valid ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                      </div>
                      <div className="text-muted-foreground">{e.actorName} • {new Date(e.timestamp).toLocaleString()}</div>
                      <div className="text-[9px] font-mono text-muted-foreground mt-1">hash: {e.thisHash.substring(0, 16)}…</div>
                      {i === 0 && <div className="text-[9px] font-mono text-muted-foreground">prev: 0000…genesis</div>}
                    </div>
                  ))}
                  {detail.auditLog.length === 0 && <div className="text-xs text-muted-foreground">No audit entries</div>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Status update */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Update Case</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="escalated">Escalated</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes…" className="text-xs min-h-[60px]" />
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={updateStatus}>Update</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Copilot */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-emerald-600" /> Investigator Copilot (Grounded RAG)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div ref={copilotScrollRef} className="min-h-[120px] bg-slate-50 rounded p-3 mb-2 max-h-48 overflow-y-auto">
                {copilotLoading && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</div>}
                {copilotA && (
                  <div className="text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <Bot className="w-3 h-3 mt-0.5 text-emerald-600" />
                      <div>
                        <div>{copilotA.answer}</div>
                        {copilotA.sources.length > 0 && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            Sources: {copilotA.sources.map(s => s.field).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {!copilotA && !copilotLoading && (
                  <div className="text-xs text-muted-foreground">
                    Ask a grounded question — the copilot answers strictly from this case's data.
                    <div className="mt-2 space-y-1">
                      <button onClick={() => setCopilotQ('Why was this case flagged?')} className="block text-left text-emerald-700 hover:underline">→ Why was this case flagged?</button>
                      <button onClick={() => setCopilotQ('What is the vendor risk profile?')} className="block text-left text-emerald-700 hover:underline">→ What is the vendor risk profile?</button>
                      <button onClick={() => setCopilotQ('Show payment timeline')} className="block text-left text-emerald-700 hover:underline">→ Show payment timeline</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input value={copilotQ} onChange={e => setCopilotQ(e.target.value)} placeholder="Ask…" className="text-xs" onKeyDown={e => e.key === 'Enter' && askCopilot()} />
                <Button onClick={askCopilot} disabled={copilotLoading} size="sm"><Send className="w-3 h-3" /></Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <div className="font-semibold mb-1 flex items-center gap-1"><User className="w-3 h-3" /> How the copilot works</div>
              <p>Every answer is grounded in the case's structured data (risk scores, SHAP features, payments, audit log). The system prompt forbids hallucination — if the question can't be answered from the data, it refuses politely.</p>
              <p className="mt-1">The LLM is called via <code className="text-[10px] bg-slate-100 px-1 rounded">z-ai-web-dev-sdk</code> with low temperature (0.1) for factual responses. PII is masked in the context — only admins with the Reveal action see full values.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
