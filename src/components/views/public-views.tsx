// Public views: transparency, leaderboard, citizen report, field verification, system health
'use client'
import { useState, useEffect } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { Loader2, MapPin, Camera, Trophy, Activity, Server, Cpu, HardDrive, Clock, Globe } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'

// ─────────────── Transparency Portal ───────────────

export function TransparencyView() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useAsyncEffect(async () => {
    const d = await fetch('/api/public/transparency').then(r => r.json())
    setData(d); setLoading(false)
  }, [])

  if (loading || !data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const stateChart = data.stateStats.map((s: any) => ({
    name: s.stateName.split(' ').map((w: string) => w[0]).join(''),
    utilization: Math.round(s.utilizationRate * 100),
    transparency: s.transparencyScore,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Public Transparency Portal</h1>
        <p className="text-sm text-muted-foreground">Aggregate, no-login view of MPLAD fund flows. {data.statesTracked} states tracked.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Works" value={data.totalWorks} icon={<Globe className="w-4 h-4" />} />
        <StatCard label="Funds Sanctioned" value={`₹${data.totalSanctioned.toFixed(0)}L`} icon={<Activity className="w-4 h-4" />} />
        <StatCard label="Funds Utilized" value={`₹${data.totalUtilized.toFixed(0)}L`} icon={<Activity className="w-4 h-4" />} accent="emerald" />
        <StatCard label="Utilization %" value={`${(data.overallUtilization * 100).toFixed(1)}%`} icon={<Activity className="w-4 h-4" />} accent="emerald" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">State-wise Transparency Score</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stateChart}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="utilization" name="Utilization %" fill="#16a34a" />
              <Bar dataKey="transparency" name="Transparency Score" fill="#0891b2" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Performing States</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topPerforming.map((s: any, i: number) => (
                <div key={s.stateName} className="flex items-center justify-between p-2 bg-emerald-50 rounded text-xs">
                  <span><span className="font-bold mr-2">#{i + 1}</span>{s.stateName}</span>
                  <Badge className="bg-emerald-600 text-white">{s.transparencyScore}/100</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Underperforming States</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.underperforming.map((s: any, i: number) => (
                <div key={s.stateName} className="flex items-center justify-between p-2 bg-orange-50 rounded text-xs">
                  <span><span className="font-bold mr-2">#{i + 1}</span>{s.stateName}</span>
                  <Badge className="bg-orange-600 text-white">{s.transparencyScore}/100</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground text-center">
          Data source: {data.dataSource} • Last updated: {new Date(data.lastUpdated).toLocaleString()}
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────── Leaderboard ───────────────

export function LeaderboardView() {
  const [data, setData] = useState<{ mpLeaderboard: any[]; districtLeaderboard: any[] } | null>(null)
  const [tab, setTab] = useState<'mp' | 'district'>('mp')

  useAsyncEffect(async () => {
    const data = await fetch('/api/leaderboard').then(r => r.json())
    setData(data)
  }, [])

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const rows = tab === 'mp' ? data.mpLeaderboard : data.districtLeaderboard

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-amber-500" /> Transparency Leaderboard</h1>
        <p className="text-sm text-muted-foreground">Composite score = 40% utilization + 30% (1 - flag rate) + 30% resolution rate</p>
      </div>

      <div className="flex gap-2">
        <Button variant={tab === 'mp' ? 'default' : 'outline'} onClick={() => setTab('mp')} className={tab === 'mp' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>MPs</Button>
        <Button variant={tab === 'district' ? 'default' : 'outline'} onClick={() => setTab('district')} className={tab === 'district' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>Districts</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Rank</TableHead>
                <TableHead className="text-xs">{tab === 'mp' ? 'MP' : 'District'}</TableHead>
                <TableHead className="text-xs">State</TableHead>
                <TableHead className="text-xs">Works</TableHead>
                <TableHead className="text-xs">Utilization</TableHead>
                <TableHead className="text-xs">Flag Rate</TableHead>
                {tab === 'mp' && <TableHead className="text-xs">Resolution</TableHead>}
                <TableHead className="text-xs">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">
                    {i + 1 <= 3 ? (
                      <Badge className={i + 1 === 1 ? 'bg-amber-500 text-white' : i + 1 === 2 ? 'bg-slate-400 text-white' : 'bg-orange-700 text-white'}>#{i + 1}</Badge>
                    ) : <span className="text-xs">#{i + 1}</span>}
                  </TableCell>
                  <TableCell className="text-xs font-medium">{r.name}{r.constituency ? ` (${r.constituency})` : ''}</TableCell>
                  <TableCell className="text-xs">{r.stateName}</TableCell>
                  <TableCell className="text-xs">{r.totalWorks}</TableCell>
                  <TableCell className="text-xs font-mono">{(r.utilizationRate * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-xs font-mono">{(r.flagRate * 100).toFixed(1)}%</TableCell>
                  {tab === 'mp' && <TableCell className="text-xs font-mono">{(r.resolutionRate * 100).toFixed(1)}%</TableCell>}
                  <TableCell><Badge className="bg-emerald-600 text-white">{r.transparencyScore}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────── Citizen Report Form ───────────────

export function CitizenReportView() {
  const { toast } = useToast()
  const [workId, setWorkId] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [contact, setContact] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ matchedFlags: string[]; crossReference: string } | null>(null)

  const captureLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          toast({ title: 'Location captured' })
        },
        () => toast({ title: 'Location denied', variant: 'destructive' })
      )
    }
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // For demo, we just use the filename as the URL (no real upload)
      setPhotoUrl(`photo://${file.name}`)
      toast({ title: 'Photo attached', description: file.name })
    }
  }

  const submit = async () => {
    if (description.length < 10) {
      toast({ title: 'Description too short', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/citizen-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workId, reporterName: reporterName || null, contact: contact || null,
        description, photoUrl, geoLat: geo?.lat, geoLng: geo?.lng,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setResult({ matchedFlags: data.matchedFlags || [], crossReference: data.crossReference })
      toast({ title: 'Report submitted' })
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Report a Suspicious Work</h1>
        <p className="text-sm text-muted-foreground">Whistleblower portal — your report is auto cross-referenced against system flags.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Report details</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Work ID (if known)</Label>
              <Input value={workId} onChange={e => setWorkId(e.target.value)} placeholder="e.g., W00123" />
            </div>
            <div>
              <Label className="text-xs">Your name (optional — leave blank for anonymous)</Label>
              <Input value={reporterName} onChange={e => setReporterName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Contact (optional — for follow-up)</Label>
              <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="phone or email" />
            </div>
            <div>
              <Label className="text-xs">Describe what you observed</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g., Road work marked completed but no construction visible at site. Funds seem diverted." className="min-h-[100px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Photo</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
                    <Camera className="w-4 h-4 mr-1" /> Attach
                  </Button>
                  {photoUrl && <span className="text-xs text-emerald-700">attached ✓</span>}
                  <input id="photo-upload" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={captureLocation}>
                    <MapPin className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  {geo && <span className="text-xs text-emerald-700 font-mono">{geo.lat.toFixed(3)},{geo.lng.toFixed(3)}</span>}
                </div>
              </div>
            </div>
            <Button className="bg-emerald-600 hover:bg-emerald-700 w-full" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : 'Submit Report'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">How it works</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <p>1. You submit a report with optional photo + geolocation.</p>
              <p>2. The system cross-references your report against existing flags for the work_id you provide.</p>
              <p>3. If the work is already flagged by the ensemble model, your report is automatically marked as "matched" and escalated.</p>
              <p>4. Reports without matching flags are still logged for manual review.</p>
              <p className="pt-2 border-t">Rate-limited to prevent abuse. PII in vendor records is masked by default.</p>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Cross-Reference Result</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-2">
                <p className="text-sm">{result.crossReference}</p>
                {result.matchedFlags.length > 0 && (
                  <div className="space-y-1">
                    <div className="font-semibold">Matched flags:</div>
                    {result.matchedFlags.map((f, i) => <Badge key={i} variant="outline" className="mr-1 text-xs">{f}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────── Field Verification (PWA-style) ───────────────

export function FieldVerificationView() {
  const { toast } = useToast()
  const [workId, setWorkId] = useState('')
  const [work, setWork] = useState<any>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [matchesClaim, setMatchesClaim] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifications, setVerifications] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadWork = async () => {
    if (!workId) return
    setLoading(true)
    const res = await fetch(`/api/works/${workId}/risk`)
    if (res.ok) {
      const data = await res.json()
      setWork(data)
      // Also fetch existing verifications
      const verRes = await fetch(`/api/field-verification?workId=${workId}`)
      if (verRes.ok) {
        const vData = await verRes.json()
        setVerifications(vData.verifications || [])
      }
    } else {
      toast({ title: 'Work not found', variant: 'destructive' })
    }
    setLoading(false)
  }

  const captureLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); toast({ title: 'Location captured' }) },
      () => toast({ title: 'Location denied', variant: 'destructive' })
    )
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setPhotoUrl(`photo://${file.name}`)
  }

  const submit = async () => {
    if (matchesClaim === null) {
      toast({ title: 'Select whether the work matches the claim', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/field-verification', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workId, photoUrl, geoLat: geo?.lat, geoLng: geo?.lng,
        matchesClaim, notes,
      }),
    })
    if (res.ok) {
      toast({ title: 'Verification logged', description: matchesClaim ? 'Work matches claim' : 'Mismatch logged to audit trail' })
      // Reload verifications
      const verRes = await fetch(`/api/field-verification?workId=${workId}`)
      if (verRes.ok) {
        const vData = await verRes.json()
        setVerifications(vData.verifications || [])
      }
    }
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Field Verification</h1>
        <p className="text-sm text-muted-foreground">Mobile-friendly PWA view for field auditors to verify flagged works.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Look up work</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={workId} onChange={e => setWorkId(e.target.value)} placeholder="Work ID e.g., W00001" />
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={loadWork} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {work && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Work Details</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              <div><span className="text-muted-foreground">ID:</span> {work.workId}</div>
              <div><span className="text-muted-foreground">Title:</span> {work.title}</div>
              <div><span className="text-muted-foreground">Category:</span> {work.category}</div>
              <div><span className="text-muted-foreground">State:</span> {work.stateName}</div>
              <div><span className="text-muted-foreground">District:</span> {work.districtName}</div>
              <div><span className="text-muted-foreground">Sanctioned:</span> ₹{work.fundSanctioned}L</div>
              <div><span className="text-muted-foreground">Utilized:</span> ₹{work.fundUtilized}L</div>
              <div><span className="text-muted-foreground">Vendor:</span> {work.vendor?.name}</div>
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Risk:</span>{' '}
                <Badge style={{ background: work.risk?.riskTier === 'critical' ? '#dc2626' : work.risk?.riskTier === 'high' ? '#ea580c' : '#16a34a', color: 'white' }}>
                  {work.risk?.riskTier || '—'}
                </Badge>
                <span className="ml-2 font-mono">{work.risk ? `${(work.risk.ensembleScore * 100).toFixed(0)}%` : ''}</span>
              </div>
              {work.fieldVerifications.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="font-semibold mb-1">Previous verifications:</div>
                  {work.fieldVerifications.map((v: any, i: number) => (
                    <div key={i} className="text-[10px]">
                      {new Date(v.verifiedAt).toLocaleDateString()} — {v.auditorName}: {v.matchesClaim ? 'MATCH' : 'MISMATCH'}
                      {v.notes && ` — ${v.notes}`}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Log Verification</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Photo</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('fv-photo')?.click()}>
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  {photoUrl && <span className="text-xs text-emerald-700">attached ✓</span>}
                  <input id="fv-photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
                </div>
              </div>
              <div>
                <Label className="text-xs">GPS Location</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={captureLocation}>
                    <MapPin className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  {geo && <span className="text-xs text-emerald-700 font-mono">{geo.lat.toFixed(4)},{geo.lng.toFixed(4)}</span>}
                </div>
              </div>
              <div>
                <Label className="text-xs">Does the work match the claim?</Label>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant={matchesClaim === true ? 'default' : 'outline'} className={matchesClaim === true ? 'bg-emerald-600 hover:bg-emerald-700' : ''} onClick={() => setMatchesClaim(true)}>✓ Matches</Button>
                  <Button size="sm" variant={matchesClaim === false ? 'default' : 'outline'} className={matchesClaim === false ? 'bg-red-600 hover:bg-red-700' : ''} onClick={() => setMatchesClaim(false)}>✗ Mismatch</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Road surface missing; only sub-base visible at site." className="min-h-[60px]" />
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Log Verification
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ─────────────── System Health ───────────────

export function SystemHealthView() {
  const [data, setData] = useState<any>(null)
  const [forecast, setForecast] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const d = await fetch('/api/system/health').then(r => r.json())
      if (!cancelled) setData(d)
    }
    ;(async () => {
      await refresh()
      const f = await fetch('/api/forecast').then(r => r.json())
      if (!cancelled) setForecast(f)
    })()
    const interval = setInterval(refresh, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" /></div>

  const memMb = data.memoryUsage ? (data.memoryUsage.rss / 1024 / 1024).toFixed(1) : '—'
  const uptimeStr = formatUptime(data.uptime)

  const forecastChart = forecast?.forecasts?.flatMap((f: any) => [
    ...f.history.map((h: any) => ({ date: h.date.substring(0, 7), value: h.count, type: 'history' })),
    ...f.forecast.map((f: any) => ({ date: f.date.substring(0, 7), value: f.predicted, type: 'forecast' })),
  ]).slice(-24) || []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-emerald-600" /> System Health</h1>
        <p className="text-sm text-muted-foreground">Live operational metrics + forecast trends.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <HealthCard icon={<Clock />} label="API Latency (p95)" value={`${data.apiLatencyP95.toFixed(1)}ms`} />
        <HealthCard icon={<Server />} label="Uptime" value={uptimeStr} />
        <HealthCard icon={<Cpu />} label="Memory (RSS)" value={`${memMb} MB`} />
        <HealthCard icon={<HardDrive />} label="DB Rows" value={data.dbSize.approxRows.toLocaleString()} />
        <HealthCard icon={<Activity />} label="Total Requests" value={data.totalRequests.toLocaleString()} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Pipeline Status</CardTitle></CardHeader>
        <CardContent className="text-xs">
          <div>Status: <Badge variant="outline">{data.pipeline.status}</Badge></div>
          <div>Last run: {data.pipeline.lastRun ? new Date(data.pipeline.lastRun).toLocaleString() : 'never'}</div>
          <div>Works scored: {data.pipeline.scored}</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">DB Tables (row counts)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Object.entries(data.dbSize.tables).map(([k, v]: [string, any]) => (
                  <TableRow key={k}>
                    <TableCell className="text-xs">{k}</TableCell>
                    <TableCell className="text-xs font-mono text-right">{v.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Forecast — Aggregate Flag Trend (next quarter)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={forecastChart}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-2">
              Aggregated across states. Forecast uses historical flag counts + trend projection.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground text-center">
          Timestamp: {new Date(data.timestamp).toLocaleString()} • Auto-refreshing every 5s
        </CardContent>
      </Card>
    </div>
  )
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

function StatCard({ label, value, icon, accent = 'slate' }: { label: string; value: React.ReactNode; icon: React.ReactNode; accent?: 'slate' | 'emerald' }) {
  const colors = { slate: 'bg-slate-100 text-slate-700', emerald: 'bg-emerald-100 text-emerald-700' }
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-6 h-6 rounded ${colors[accent]} flex items-center justify-center`}>{icon}</div>
        <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </Card>
  )
}

function HealthCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">{icon}</div>
        <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm font-bold">{value}</div>
    </Card>
  )
}
