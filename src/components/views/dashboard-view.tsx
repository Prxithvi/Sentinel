// Dashboard view — KPIs, map preview, trend chart, top risks table, live feed
'use client'
import { useEffect, useState, useRef } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TrendingUp, AlertTriangle, FileWarning, Users, IndianRupee, Activity, Radio, Loader2 } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import { io, Socket } from 'socket.io-client'
import { useLang } from '@/hooks/use-lang'

const RISK_COLORS: Record<string, string> = {
  critical: '#dc2626', high: '#ea580c', medium: '#ca8a04', low: '#16a34a',
}

interface KpiData {
  totalWorks: number; totalSanctioned: number; totalUtilized: number; utilizationRate: number
  criticalCount: number; highCount: number; mediumCount: number; lowCount: number
  openCases: number; resolvedCases: number; citizenReports: number; flaggedVendors: number
  trend: { month: string; critical: number; high: number; medium: number; low: number }[]
}

interface TopRisk {
  id: string; workId: string; title: string; stateName: string; vendor: { name: string } | null
  risk: { ensembleScore: number; riskTier: string; blacklistMatch: boolean } | null
}

interface LiveEvent {
  id: string; type: string; timestamp: string; state: string; district?: string; workId: string
  amount?: number; vendor?: string; category?: string; tier?: string; message: string
}

export function DashboardView({ onOpenWork }: { onOpenWork: (workId: string) => void }) {
  const { lang, tr } = useLang()
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [topRisks, setTopRisks] = useState<TopRisk[]>([])
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([])
  const [scoring, setScoring] = useState(false)
  const [scoringResult, setScoringResult] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useAsyncEffect(async () => {
    const [kpiRes, alertsRes] = await Promise.all([
      fetch('/api/kpi').then(r => r.json()),
      fetch('/api/alerts?limit=20').then(r => r.json()),
    ])
    setKpi(kpiRes)
    setTopRisks(alertsRes.works?.filter((w: TopRisk) => w.risk).slice(0, 10) || [])
  }, [])

  // Socket.IO — separate effect with cleanup
  useEffect(() => {
    const socket = io('/?XTransformPort=3003', { transports: ['websocket', 'polling'] })
    socketRef.current = socket
    socket.on('recent-events', (events: LiveEvent[]) => setLiveEvents(events))
    socket.on('live-event', (evt: LiveEvent) => {
      setLiveEvents(prev => [evt, ...prev].slice(0, 50))
    })
    return () => { socket.disconnect() }
  }, [])

  const refresh = async () => {
    const [kpiRes, alertsRes] = await Promise.all([
      fetch('/api/kpi').then(r => r.json()),
      fetch('/api/alerts?limit=20').then(r => r.json()),
    ])
    setKpi(kpiRes)
    setTopRisks(alertsRes.works?.filter((w: TopRisk) => w.risk).slice(0, 10) || [])
  }

  const runScoring = async () => {
    setScoring(true); setScoringResult(null)
    try {
      const res = await fetch('/api/score/run', { method: 'POST' })
      const data = await res.json()
      setScoringResult(`✓ Scored ${data.scored} works — ${data.critical} critical, ${data.high} high, ${data.medium} medium, ${data.low} low.`)
      await refresh()
    } catch (e) {
      setScoringResult(`✗ Error: ${e}`)
    }
    setScoring(false)
  }

  const tierDistribution = kpi ? [
    { name: 'Critical', value: kpi.criticalCount, fill: RISK_COLORS.critical },
    { name: 'High', value: kpi.highCount, fill: RISK_COLORS.high },
    { name: 'Medium', value: kpi.mediumCount, fill: RISK_COLORS.medium },
    { name: 'Low', value: kpi.lowCount, fill: RISK_COLORS.low },
  ] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tr('nav_dashboard')}</h1>
          <p className="text-sm text-muted-foreground">Investigator overview — {kpi ? `${kpi.totalWorks} works tracked` : 'loading…'}</p>
        </div>
        <Button onClick={runScoring} disabled={scoring} className="bg-emerald-600 hover:bg-emerald-700">
          {scoring ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : 'Re-run Scoring'}
        </Button>
      </div>

      {scoringResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm p-3 rounded-md">{scoringResult}</div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard icon={<FileWarning className="w-4 h-4" />} label={tr('kpi_totalWorks')} value={kpi?.totalWorks ?? '—'} />
        <KpiCard icon={<IndianRupee className="w-4 h-4" />} label={tr('kpi_sanctioned')} value={kpi ? `₹${kpi.totalSanctioned.toFixed(0)}L` : '—'} />
        <KpiCard icon={<IndianRupee className="w-4 h-4" />} label={tr('kpi_utilized')} value={kpi ? `₹${kpi.totalUtilized.toFixed(0)}L` : '—'} accent="emerald" />
        <KpiCard icon={<TrendingUp className="w-4 h-4" />} label={tr('kpi_utilizationRate')} value={kpi ? `${(kpi.utilizationRate * 100).toFixed(1)}%` : '—'} accent="emerald" />
        <KpiCard icon={<AlertTriangle className="w-4 h-4" />} label={tr('kpi_critical')} value={kpi?.criticalCount ?? '—'} accent="red" />
        <KpiCard icon={<Activity className="w-4 h-4" />} label={tr('kpi_openCases')} value={kpi?.openCases ?? '—'} accent="orange" />
        <KpiCard icon={<Users className="w-4 h-4" />} label={tr('kpi_citizenReports')} value={kpi?.citizenReports ?? '—'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Risk trend */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">{tr('riskTrend')}</CardTitle></CardHeader>
          <CardContent>
            {kpi?.trend && kpi.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={kpi.trend}>
                  <defs>
                    <linearGradient id="gcrit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ghigh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="critical" stackId="1" stroke="#dc2626" fill="url(#gcrit)" />
                  <Area type="monotone" dataKey="high" stackId="1" stroke="#ea580c" fill="url(#ghigh)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-muted-foreground py-10 text-center">No trend data yet. Run scoring.</div>}
          </CardContent>
        </Card>

        {/* Tier distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm">{tr('tierDistribution')}</CardTitle></CardHeader>
          <CardContent>
            {tierDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={tierDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {tierDistribution.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-muted-foreground py-10 text-center">No data</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Top risks table */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">{tr('topRiskWorks')}</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Work ID</TableHead>
                    <TableHead className="text-xs">Title</TableHead>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs">Vendor</TableHead>
                    <TableHead className="text-xs">Tier</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRisks.map(w => (
                    <TableRow key={w.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenWork(w.id)}>
                      <TableCell className="text-xs font-mono">{w.workId}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{w.title}</TableCell>
                      <TableCell className="text-xs">{w.stateName || '—'}</TableCell>
                      <TableCell className="text-xs">{w.vendor?.name || '—'}</TableCell>
                      <TableCell>
                        <Badge style={{ background: RISK_COLORS[w.risk?.riskTier || 'low'], color: 'white' }} className="text-xs">
                          {w.risk?.riskTier || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{w.risk ? `${(w.risk.ensembleScore * 100).toFixed(0)}%` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Live feed */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
              <CardTitle className="text-sm">{tr('liveFeed')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-80 overflow-y-auto">
              <div className="space-y-2">
                {liveEvents.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">Connecting…</div>}
                {liveEvents.map(evt => (
                  <div key={evt.id} className="border-l-2 pl-2 py-1 text-xs" style={{
                    borderColor: evt.type === 'risk_flag' ? '#dc2626' : evt.type === 'citizen_report' ? '#0891b2' : '#16a34a'
                  }}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{evt.workId}</span>
                      <span className="text-muted-foreground text-[10px]">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-muted-foreground">{evt.message}</div>
                    {evt.tier && (
                      <Badge style={{ background: RISK_COLORS[evt.tier], color: 'white' }} className="text-[9px] mt-1">{evt.tier}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, accent = 'slate' }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: 'slate' | 'emerald' | 'red' | 'orange' }) {
  const colors = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
  }
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-7 h-7 rounded ${colors[accent]} flex items-center justify-center`}>{icon}</div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
    </Card>
  )
}
