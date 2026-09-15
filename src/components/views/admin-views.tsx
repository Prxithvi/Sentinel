// Admin: scoring config with live preview, model metrics, blacklist manager
'use client'
import { useState } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Save, Eye, Trash2, Plus } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, ReferenceLine } from 'recharts'

interface ScoringConfig {
  isoWeight: number; aeWeight: number; graphWeight: number; nlpWeight: number; ruleWeight: number
  criticalCutoff: number; highCutoff: number; mediumCutoff: number
}

interface ModelRun {
  id: string; modelName: string; version: string; trainedAt: string
  metrics: {
    precision: number; recall: number; f1: number; rocAuc: number
    perPattern: Record<string, { p: number; r: number; f1: number }>
    rocCurve: { fpr: number; tpr: number }[]
    prCurve: { recall: number; precision: number }[]
  }
  mlflowRunId: string | null
  notes: string | null
}

interface BlacklistEntry {
  id: string; identifierType: string; identifierMasked: string; identifierValue?: string
  reason: string; source: string; vendorName?: string; addedAt: string
}

export function AdminConfigView() {
  const { toast } = useToast()
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [preview, setPreview] = useState<{ before: any[]; after: any[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  useAsyncEffect(async () => {
    const data = await fetch('/api/admin/scoring-config').then(r => r.json())
    setConfig(data)
  }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/admin/scoring-config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    if (res.ok) toast({ title: 'Configuration saved' })
    setSaving(false)
  }

  const runPreview = async () => {
    setPreviewLoading(true)
    const res = await fetch('/api/admin/scoring-config/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleSize: 50, config }),
    })
    if (res.ok) {
      const data = await res.json()
      setPreview({ before: data.before, after: data.after })
    }
    setPreviewLoading(false)
  }

  if (!config) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const totalWeight = config.isoWeight + config.aeWeight + config.graphWeight + config.nlpWeight + config.ruleWeight

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Scoring Configuration</h1>
        <p className="text-sm text-muted-foreground">Tune ensemble weights and risk-tier cutoffs. Live preview shows before/after on a sample.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Ensemble Weights <span className="text-xs text-muted-foreground">(total: {totalWeight.toFixed(2)})</span></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <SliderRow label="Isolation Forest" value={config.isoWeight} onChange={v => setConfig({ ...config, isoWeight: v })} />
            <SliderRow label="Autoencoder" value={config.aeWeight} onChange={v => setConfig({ ...config, aeWeight: v })} />
            <SliderRow label="Graph / Ring" value={config.graphWeight} onChange={v => setConfig({ ...config, graphWeight: v })} />
            <SliderRow label="NLP" value={config.nlpWeight} onChange={v => setConfig({ ...config, nlpWeight: v })} />
            <SliderRow label="Rule Flags" value={config.ruleWeight} onChange={v => setConfig({ ...config, ruleWeight: v })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Risk Tier Cutoffs</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <SliderRow label="Critical ≥" value={config.criticalCutoff} onChange={v => setConfig({ ...config, criticalCutoff: v })} color="red" />
            <SliderRow label="High ≥" value={config.highCutoff} onChange={v => setConfig({ ...config, highCutoff: v })} color="orange" />
            <SliderRow label="Medium ≥" value={config.mediumCutoff} onChange={v => setConfig({ ...config, mediumCutoff: v })} color="yellow" />
            <div className="flex gap-2 pt-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Apply Configuration
              </Button>
              <Button variant="outline" onClick={runPreview} disabled={previewLoading}>
                {previewLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                Preview Re-score
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {preview && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Preview — Before/After on 50 sample works</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <PreviewStat label="Critical Before" value={preview.before.filter(p => p.riskTier === 'critical').length} color="bg-red-100 text-red-700" />
              <PreviewStat label="Critical After" value={preview.after.filter(p => p.riskTier === 'critical').length} color="bg-red-100 text-red-700" />
              <PreviewStat label="High Before" value={preview.before.filter(p => p.riskTier === 'high').length} color="bg-orange-100 text-orange-700" />
              <PreviewStat label="High After" value={preview.after.filter(p => p.riskTier === 'high').length} color="bg-orange-100 text-orange-700" />
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">Before Tier</TableHead>
                    <TableHead className="text-xs">Before Score</TableHead>
                    <TableHead className="text-xs">After Tier</TableHead>
                    <TableHead className="text-xs">After Score</TableHead>
                    <TableHead className="text-xs">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.before.map((b, i) => {
                    const a = preview.after[i]
                    const delta = (a.ensembleScore - b.ensembleScore) * 100
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{i + 1}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline">{b.riskTier}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{(b.ensembleScore * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline">{a.riskTier}</Badge></TableCell>
                        <TableCell className="text-xs font-mono">{(a.ensembleScore * 100).toFixed(1)}%</TableCell>
                        <TableCell className={`text-xs font-mono ${delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : ''}`}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SliderRow({ label, value, onChange, color = 'emerald' }: { label: string; value: number; onChange: (v: number) => void; color?: 'emerald' | 'red' | 'orange' | 'yellow' }) {
  const colors = { emerald: 'accent-emerald-600', red: 'accent-red-600', orange: 'accent-orange-600', yellow: 'accent-yellow-600' }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono">{value.toFixed(2)}</span>
      </div>
      <input type="range" min="0" max="1" step="0.05" value={value} onChange={e => onChange(Number(e.target.value))}
        className={`w-full ${colors[color]}`} />
    </div>
  )
}

function PreviewStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`p-2 rounded ${color}`}>
      <div className="text-[10px] uppercase">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

// ───────────────────────── Model Metrics View ─────────────────────────

export function ModelMetricsView() {
  const [runs, setRuns] = useState<ModelRun[]>([])
  const [loading, setLoading] = useState(true)

  useAsyncEffect(async () => {
    const data = await fetch('/api/admin/model-metrics').then(r => r.json())
    setRuns(data.runs || [])
    setLoading(false)
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const ensemble = runs.find(r => r.modelName === 'Ensemble') || runs[0]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Model Performance</h1>
        <p className="text-sm text-muted-foreground">Tracked via MLflow. Synthetic labels injected at data-generation time.</p>
      </div>

      {/* Comparison cards */}
      <div className="grid md:grid-cols-3 gap-3">
        {runs.map(r => (
          <Card key={r.id}>
            <CardHeader><CardTitle className="text-sm flex items-center justify-between">
              {r.modelName}
              <Badge variant="outline">{r.version}</Badge>
            </CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              <MetricRow label="Precision" value={r.metrics.precision} />
              <MetricRow label="Recall" value={r.metrics.recall} />
              <MetricRow label="F1" value={r.metrics.f1} />
              <MetricRow label="ROC-AUC" value={r.metrics.rocAuc} accent={r.metrics.rocAuc >= 0.9 ? 'emerald' : 'orange'} />
              <div className="text-[10px] text-muted-foreground mt-2">
                MLflow: <code className="font-mono">{r.mlflowRunId}</code>
              </div>
              <div className="text-[10px] text-muted-foreground">{r.notes}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ROC curve */}
      {ensemble && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">ROC Curve — Ensemble</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ensemble.metrics.rocCurve}>
                  <XAxis dataKey="fpr" tick={{ fontSize: 10 }} domain={[0, 1]} label={{ value: 'FPR', position: 'insideBottom', offset: -2, fontSize: 10 }} />
                  <YAxis dataKey="tpr" tick={{ fontSize: 10 }} domain={[0, 1]} label={{ value: 'TPR', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} />
                  <Line type="monotone" dataKey="tpr" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#94a3b8" strokeDasharray="3,3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Precision-Recall — Ensemble</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={ensemble.metrics.prCurve}>
                  <XAxis dataKey="recall" tick={{ fontSize: 10 }} domain={[0, 1]} />
                  <YAxis dataKey="precision" tick={{ fontSize: 10 }} domain={[0, 1]} />
                  <Tooltip formatter={(v: number) => v.toFixed(3)} />
                  <Legend />
                  <Line type="monotone" dataKey="precision" stroke="#0891b2" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-pattern metrics */}
      {ensemble && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Per-Fraud-Pattern Metrics — Ensemble</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pattern</TableHead>
                  <TableHead className="text-xs">Precision</TableHead>
                  <TableHead className="text-xs">Recall</TableHead>
                  <TableHead className="text-xs">F1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(ensemble.metrics.perPattern).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell className="text-xs font-medium">{k.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-xs font-mono">{(v.p * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-xs font-mono">{(v.r * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-xs font-mono">{(v.f1 * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricRow({ label, value, accent }: { label: string; value: number; accent?: 'emerald' | 'orange' }) {
  const colors = { emerald: 'text-emerald-700', orange: 'text-orange-700' }
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${accent ? colors[accent] : ''}`}>{(value * 100).toFixed(1)}%</span>
    </div>
  )
}

// ───────────────────────── Blacklist Manager ─────────────────────────

export function BlacklistView() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<BlacklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newType, setNewType] = useState('PAN')
  const [newValue, setNewValue] = useState('')
  const [newReason, setNewReason] = useState('')

  const refresh = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/blacklist')
    if (res.ok) {
      const data = await res.json()
      setEntries(data.entries || [])
    }
    setLoading(false)
  }

  useAsyncEffect(async () => { await refresh() }, [])

  const add = async () => {
    if (!newValue) return
    const res = await fetch('/api/admin/blacklist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifierType: newType, identifierValue: newValue, reason: newReason || 'Manually added' }),
    })
    if (res.ok) {
      toast({ title: 'Blacklist entry added' })
      setNewValue(''); setNewReason('')
      refresh()
    } else {
      toast({ title: 'Failed', variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Blacklist Manager</h1>
        <p className="text-sm text-muted-foreground">Vendors matching these identifiers auto-escalate to Critical.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Add Entry</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-2">
            <select value={newType} onChange={e => setNewType(e.target.value)} className="border rounded p-2 text-sm">
              <option value="PAN">PAN</option>
              <option value="GST">GST</option>
              <option value="bank_account">Bank Account</option>
            </select>
            <Input placeholder="Identifier value" value={newValue} onChange={e => setNewValue(e.target.value)} />
            <Input placeholder="Reason" value={newReason} onChange={e => setNewReason(e.target.value)} />
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={add}>Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Entries ({entries.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Identifier (masked)</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Vendor</TableHead>
                  <TableHead className="text-xs">Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs"><Badge variant="outline">{e.identifierType}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{e.identifierMasked}</TableCell>
                    <TableCell className="text-xs">{e.reason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.source}</TableCell>
                    <TableCell className="text-xs">{e.vendorName || '—'}</TableCell>
                    <TableCell className="text-xs">{new Date(e.addedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
