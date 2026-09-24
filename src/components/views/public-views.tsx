// Public views: transparency, leaderboard, citizen report, field verification, system health
'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import {
  Loader2, MapPin, Camera, Trophy, Activity, Server, Cpu, HardDrive, Clock, Globe,
  ArrowRight, ArrowDown, ArrowUpDown, Search, Info, ShieldCheck, ShieldAlert,
  AlertTriangle, CheckCircle2, XCircle, FileWarning, Database as DatabaseIcon, RefreshCw,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, LineChart, Line,
} from 'recharts'

// ══════════════════════════════════════════════════════════════════════════
// Shared helpers & small reusable components
// ══════════════════════════════════════════════════════════════════════════

type BadgeVariant =
  | 'live' | 'demo' | 'synthetic' | 'verified' | 'pending' | 'flagged'
  | 'error' | 'healthy' | 'degraded' | 'warning' | 'critical' | 'unknown'

const BADGE_STYLES: Record<BadgeVariant, string> = {
  live: 'bg-emerald-600 text-white',
  healthy: 'bg-emerald-600 text-white',
  verified: 'bg-emerald-600 text-white',
  demo: 'bg-amber-500 text-white',
  synthetic: 'bg-amber-500 text-white',
  degraded: 'bg-amber-500 text-white',
  warning: 'bg-amber-500 text-white',
  pending: 'bg-slate-400 text-white',
  flagged: 'bg-orange-600 text-white',
  error: 'bg-red-600 text-white',
  critical: 'bg-red-600 text-white',
  unknown: 'bg-slate-300 text-slate-700',
}

const BADGE_TEXT: Record<BadgeVariant, string> = {
  live: 'LIVE', demo: 'DEMO DATA', synthetic: 'SYNTHETIC DATA', verified: 'VERIFIED',
  pending: 'PENDING', flagged: 'FLAGGED', error: 'ERROR', healthy: 'HEALTHY',
  degraded: 'DEGRADED', warning: 'ATTENTION', critical: 'CRITICAL', unknown: 'UNKNOWN',
}

function StatusBadge({ variant, label }: { variant: BadgeVariant; label?: string }) {
  return <Badge className={`${BADGE_STYLES[variant]} text-[10px] tracking-wide font-medium`}>{label ?? BADGE_TEXT[variant]}</Badge>
}

/** Infers whether a dataset is live/official or demo/synthetic from its stated source label.
 *  Never guesses in the other direction — unlabeled sources are "unknown", not "live". */
function detectDataMode(dataSource?: string): BadgeVariant {
  if (!dataSource || typeof dataSource !== 'string') return 'unknown'
  const s = dataSource.toLowerCase()
  if (s.includes('synthetic')) return 'synthetic'
  if (s.includes('demo') || s.includes('mock') || s.includes('sample') || s.includes('seed') || s.includes('test')) return 'demo'
  if (s.includes('live') || s.includes('official') || s.includes('mospi') || s.includes('govt') || s.includes('government')) return 'live'
  return 'unknown'
}

function fmtNum(v: unknown): string {
  return typeof v === 'number' && !Number.isNaN(v) ? v.toLocaleString() : 'Not available'
}
function fmtLakh(v: unknown): string {
  return typeof v === 'number' && !Number.isNaN(v) ? `₹${v.toFixed(0)}L` : 'Not available'
}
function fmtPct(v: unknown, digits = 1): string {
  return typeof v === 'number' && !Number.isNaN(v) ? `${(v * 100).toFixed(digits)}%` : 'Not available'
}
function fmtDate(v: unknown): string {
  if (!v || typeof v !== 'string') return 'Not available'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? 'Not available' : d.toLocaleString()
}
function fmtRelative(v: unknown): string {
  if (!v || typeof v !== 'string') return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
function formatUptime(sec: unknown): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return 'Not available'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

/** Safe fetch wrapper: never throws, always returns { data } or { error }. */
async function fetchSafe<T = any>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, init)
    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error || body?.message || ''
      } catch { /* non-JSON error body */ }
      return { error: detail || `Request failed (${res.status})` }
    }
    try {
      const data = await res.json()
      return { data }
    } catch {
      return { error: 'Received a malformed response from the server.' }
    }
  } catch {
    return { error: 'Network error — could not reach the server.' }
  }
}

function SectionHeader({ title, subtitle, badge }: { title: string; subtitle?: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {badge && <div className="pt-1">{badge}</div>}
    </div>
  )
}

function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin" />
      <span className="text-xs">{label}</span>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="py-8 flex flex-col items-center text-center gap-2">
        <AlertTriangle className="w-6 h-6 text-red-600" />
        <p className="text-sm font-medium text-red-800">Couldn't load this data</p>
        <p className="text-xs text-red-700">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" className="mt-2 border-red-300 text-red-700 hover:bg-red-100" onClick={onRetry}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 flex flex-col items-center text-center gap-2 text-muted-foreground">
        <FileWarning className="w-6 h-6" />
        <p className="text-xs">{message}</p>
      </CardContent>
    </Card>
  )
}

function MetricTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span title={text} tabIndex={0} className="inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
      {children}
      <Info className="w-3 h-3 text-muted-foreground" />
    </span>
  )
}

function MetricCard({ label, value, icon, accent = 'slate', tooltip }: {
  label: string; value: React.ReactNode; icon?: React.ReactNode; accent?: 'slate' | 'emerald' | 'amber' | 'red'; tooltip?: string
}) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700',
  }
  const label_ = tooltip ? <MetricTooltip text={tooltip}><span className="text-[10px] uppercase text-muted-foreground">{label}</span></MetricTooltip> : <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon && <div className={`w-6 h-6 rounded ${colors[accent]} flex items-center justify-center shrink-0`}>{icon}</div>}
        {label_}
      </div>
      <div className="text-xl font-bold">{value}</div>
    </Card>
  )
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${active ? 'text-emerald-600' : 'text-muted-foreground/50'}`} />
    </button>
  )
}

function FundFlowStage({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex-1 rounded-lg border p-3 text-center min-w-[120px] ${accent ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground shrink-0 py-1 sm:py-0">
      <ArrowRight className="w-4 h-4 hidden sm:block" />
      <ArrowDown className="w-4 h-4 sm:hidden" />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 1. Transparency Portal
// ══════════════════════════════════════════════════════════════════════════

export function TransparencyView() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [stateFilter, setStateFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<'stateName' | 'utilizationRate' | 'transparencyScore' | 'flagRate' | 'totalWorks'>('transparencyScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useAsyncEffect(async () => {
    setLoading(true)
    setError(null)
    const { data: d, error: err } = await fetchSafe('/api/public/transparency')
    if (err) setError(err)
    else setData(d)
    setLoading(false)
  }, [reloadKey])

  const stateStats: any[] = Array.isArray(data?.stateStats) ? data.stateStats : []
  const dataMode = detectDataMode(data?.dataSource)

  const stateOptions = useMemo(
    () => Array.from(new Set(stateStats.map((s) => s?.stateName).filter(Boolean))).sort(),
    [stateStats]
  )

  const filteredStates = stateFilter === 'all' ? stateStats : stateStats.filter((s) => s?.stateName === stateFilter)

  const sortedStates = useMemo(() => {
    const rows = [...filteredStates]
    rows.sort((a, b) => {
      let av = a?.[sortKey]
      let bv = b?.[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [filteredStates, sortKey, sortDir])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const stateChart = filteredStates.map((s: any) => ({
    name: (s?.stateName || '').split(' ').map((w: string) => w[0]).join('').slice(0, 4) || '—',
    utilization: typeof s?.utilizationRate === 'number' ? Math.round(s.utilizationRate * 100) : 0,
    transparency: typeof s?.transparencyScore === 'number' ? s.transparencyScore : 0,
  }))

  const hasReleased = typeof data?.totalReleased === 'number'
  const hasFlagged = typeof data?.totalFlagged === 'number'
  const hasVerificationCoverage = typeof data?.verificationCoverage === 'number'

  if (loading) return <LoadingBlock label="Loading transparency data…" />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!data) return <EmptyState message="No transparency data is available yet." />

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Public Transparency Portal"
        subtitle={`Aggregate, no-login view of MPLAD fund flows.${typeof data.statesTracked === 'number' ? ` ${data.statesTracked} states tracked.` : ''}`}
        badge={<StatusBadge variant={dataMode} />}
      />

      {/* About this data / methodology */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Info className="w-4 h-4 text-muted-foreground" /> About this data</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            <div><span className="font-medium text-foreground">Source:</span> {data.dataSource || 'Not available'}</div>
            <div>
              <span className="font-medium text-foreground">Last updated:</span> {fmtDate(data.lastUpdated)}
              {fmtRelative(data.lastUpdated) && <span className="text-muted-foreground"> ({fmtRelative(data.lastUpdated)})</span>}
            </div>
            <div><span className="font-medium text-foreground">States covered:</span> {data.statesTracked ?? stateStats.length ?? 'Not available'}</div>
            <div><span className="font-medium text-foreground">Works tracked:</span> {fmtNum(data.totalWorks)}</div>
          </div>
          <p className="pt-2 border-t leading-relaxed">
            Utilization is calculated as funds utilized ÷ funds sanctioned across tracked works.
            {dataMode === 'demo' || dataMode === 'synthetic'
              ? ' This deployment is currently running on demo/synthetic data for evaluation purposes and does not reflect official government records.'
              : ' Figures are aggregated from records ingested into this platform.'}
            {' '}Transparency scores shown throughout this portal are a platform-generated analytical metric, not an official government ranking.
          </p>
        </CardContent>
      </Card>

      {/* Core metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Works" value={fmtNum(data.totalWorks)} icon={<Globe className="w-4 h-4" />} />
        <MetricCard label="Funds Sanctioned" value={fmtLakh(data.totalSanctioned)} icon={<Activity className="w-4 h-4" />} />
        <MetricCard label="Funds Utilized" value={fmtLakh(data.totalUtilized)} icon={<Activity className="w-4 h-4" />} accent="emerald" />
        <MetricCard label="Utilization %" value={fmtPct(data.overallUtilization)} icon={<Activity className="w-4 h-4" />} accent="emerald" />
      </div>

      {/* Transparency metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Works Tracked" value={fmtNum(data.totalWorks)} tooltip="Total number of works currently ingested into the platform." />
        <MetricCard
          label="Flagged Works"
          value={hasFlagged ? fmtNum(data.totalFlagged) : 'Not available'}
          accent={hasFlagged && data.totalFlagged > 0 ? 'amber' : 'slate'}
          tooltip="Works associated with one or more risk indicators from the analytical model. A flag signals that a work may need review — it does not by itself establish fraud."
        />
        <MetricCard
          label="Verification Coverage"
          value={hasVerificationCoverage ? fmtPct(data.verificationCoverage) : 'Not available'}
          tooltip="Share of tracked works that have at least one recorded field verification."
        />
        <MetricCard label="Data Freshness" value={fmtRelative(data.lastUpdated) || 'Not available'} tooltip="Time since this dataset was last refreshed." />
      </div>

      {/* Fund flow */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Fund Flow</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <FundFlowStage label="Sanctioned" value={fmtLakh(data.totalSanctioned)} />
            <FlowArrow />
            {hasReleased && (
              <>
                <FundFlowStage label="Released" value={fmtLakh(data.totalReleased)} />
                <FlowArrow />
              </>
            )}
            <FundFlowStage label="Utilized" value={fmtLakh(data.totalUtilized)} accent />
          </div>
          {!hasReleased && (
            <p className="text-[11px] text-muted-foreground mt-2">A separate "released funds" stage isn't available from the current data source, so only sanctioned and utilized amounts are shown.</p>
          )}
        </CardContent>
      </Card>

      {/* Chart + filter */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm">State-wise Transparency Score</CardTitle>
          {stateOptions.length > 0 && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              aria-label="Filter by state"
              className="text-xs border rounded-md px-2 py-1.5 bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <option value="all">All states</option>
              {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </CardHeader>
        <CardContent>
          {stateChart.length === 0 ? (
            <EmptyState message="No state-level data matches the current filter." />
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Top / underperforming */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Performing States</CardTitle></CardHeader>
          <CardContent>
            {!Array.isArray(data.topPerforming) || data.topPerforming.length === 0 ? (
              <EmptyState message="Not available." />
            ) : (
              <div className="space-y-2">
                {data.topPerforming.map((s: any, i: number) => (
                  <div key={s?.stateName ?? i} className="flex items-center justify-between p-2 bg-emerald-50 rounded text-xs">
                    <span><span className="font-bold mr-2">#{i + 1}</span>{s?.stateName ?? 'Unknown'}</span>
                    <Badge className="bg-emerald-600 text-white">{typeof s?.transparencyScore === 'number' ? `${s.transparencyScore}/100` : 'N/A'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">States Requiring Review</CardTitle></CardHeader>
          <CardContent>
            {!Array.isArray(data.underperforming) || data.underperforming.length === 0 ? (
              <EmptyState message="Not available." />
            ) : (
              <div className="space-y-2">
                {data.underperforming.map((s: any, i: number) => (
                  <div key={s?.stateName ?? i} className="flex items-center justify-between p-2 bg-amber-50 rounded text-xs">
                    <span><span className="font-bold mr-2">#{i + 1}</span>{s?.stateName ?? 'Unknown'}</span>
                    <Badge className="bg-amber-600 text-white">{typeof s?.transparencyScore === 'number' ? `${s.transparencyScore}/100` : 'N/A'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* State detail table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">State Details</CardTitle>
          <CardDescription className="text-[11px]">
            Transparency score is a platform-generated analytical metric based on available utilization, verification and risk data — not an official government ranking.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sortedStates.length === 0 ? (
            <div className="p-6"><EmptyState message="No states match the current filter." /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortHeader label="State" active={sortKey === 'stateName'} dir={sortDir} onClick={() => toggleSort('stateName')} /></TableHead>
                  <TableHead><SortHeader label="Works" active={sortKey === 'totalWorks'} dir={sortDir} onClick={() => toggleSort('totalWorks')} /></TableHead>
                  <TableHead><SortHeader label="Utilization" active={sortKey === 'utilizationRate'} dir={sortDir} onClick={() => toggleSort('utilizationRate')} /></TableHead>
                  <TableHead>
                    <MetricTooltip text="Percentage of this state's tracked works associated with one or more risk indicators.">
                      <SortHeader label="Flag Rate" active={sortKey === 'flagRate'} dir={sortDir} onClick={() => toggleSort('flagRate')} />
                    </MetricTooltip>
                  </TableHead>
                  <TableHead>
                    <MetricTooltip text="Platform-generated analytical score, not an official ranking.">
                      <SortHeader label="Transparency Score" active={sortKey === 'transparencyScore'} dir={sortDir} onClick={() => toggleSort('transparencyScore')} />
                    </MetricTooltip>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStates.map((s: any, i: number) => (
                  <TableRow key={s?.stateName ?? i}>
                    <TableCell className="text-xs font-medium">{s?.stateName ?? 'Not available'}</TableCell>
                    <TableCell className="text-xs font-mono">{typeof s?.totalWorks === 'number' ? s.totalWorks.toLocaleString() : 'Not available'}</TableCell>
                    <TableCell className="text-xs font-mono">{fmtPct(s?.utilizationRate)}</TableCell>
                    <TableCell className="text-xs font-mono">{typeof s?.flagRate === 'number' ? fmtPct(s.flagRate) : 'Not available'}</TableCell>
                    <TableCell>
                      {typeof s?.transparencyScore === 'number'
                        ? <Badge className="bg-emerald-600 text-white">{s.transparencyScore}/100</Badge>
                        : <span className="text-xs text-muted-foreground">Not available</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground text-center">
          Data source: {data.dataSource || 'Not available'} • Last updated: {fmtDate(data.lastUpdated)}
        </CardContent>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 2. Leaderboard / Performance Overview
// ══════════════════════════════════════════════════════════════════════════

export function LeaderboardView() {
  const [data, setData] = useState<{ mpLeaderboard: any[]; districtLeaderboard: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<'mp' | 'district'>('mp')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'transparencyScore' | 'utilizationRate' | 'flagRate' | 'resolutionRate' | 'totalWorks'>('transparencyScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useAsyncEffect(async () => {
    setLoading(true)
    setError(null)
    const { data: d, error: err } = await fetchSafe('/api/leaderboard')
    if (err) setError(err)
    else setData(d)
    setLoading(false)
  }, [reloadKey])

  const rawRows: any[] = data ? (tab === 'mp' ? data.mpLeaderboard : data.districtLeaderboard) || [] : []

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rawRows
    return rawRows.filter((r) =>
      (r?.name || '').toLowerCase().includes(q) ||
      (r?.constituency || '').toLowerCase().includes(q) ||
      (r?.stateName || '').toLowerCase().includes(q)
    )
  }, [rawRows, search])

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows]
    rows.sort((a, b) => {
      const av = a?.[sortKey]
      const bv = b?.[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [filteredRows, sortKey, sortDir])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (loading) return <LoadingBlock label="Loading performance data…" />
  if (error) return <ErrorState message={error} onRetry={() => setReloadKey((k) => k + 1)} />
  if (!data) return <EmptyState message="No performance data available yet." />

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Transparency & Risk Overview"
        subtitle="Analytical score = 40% utilization + 30% (1 − flag rate) + 30% resolution rate. This is a platform-generated ranking, not an official government assessment."
      />

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2">
          <Button variant={tab === 'mp' ? 'default' : 'outline'} onClick={() => setTab('mp')} className={tab === 'mp' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>MPs</Button>
          <Button variant={tab === 'district' ? 'default' : 'outline'} onClick={() => setTab('district')} className={tab === 'district' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>Districts</Button>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'mp' ? 'Search by MP, constituency or state' : 'Search by district or state'}
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {sortedRows.length === 0 ? (
            <div className="p-6"><EmptyState message={search ? 'No results match your search.' : 'No data available for this view.'} /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Rank</TableHead>
                    <TableHead className="text-xs">{tab === 'mp' ? 'MP' : 'District'}</TableHead>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead><SortHeader label="Works" active={sortKey === 'totalWorks'} dir={sortDir} onClick={() => toggleSort('totalWorks')} /></TableHead>
                    <TableHead><SortHeader label="Utilization" active={sortKey === 'utilizationRate'} dir={sortDir} onClick={() => toggleSort('utilizationRate')} /></TableHead>
                    <TableHead>
                      <MetricTooltip text="Share of this entity's works associated with one or more risk indicators. A flag signals a work may need review, not confirmed wrongdoing.">
                        <SortHeader label="Flag Rate" active={sortKey === 'flagRate'} dir={sortDir} onClick={() => toggleSort('flagRate')} />
                      </MetricTooltip>
                    </TableHead>
                    {tab === 'mp' && (
                      <TableHead>
                        <MetricTooltip text="Share of flagged works that have since been resolved or cleared on review.">
                          <SortHeader label="Resolution" active={sortKey === 'resolutionRate'} dir={sortDir} onClick={() => toggleSort('resolutionRate')} />
                        </MetricTooltip>
                      </TableHead>
                    )}
                    <TableHead>
                      <MetricTooltip text="Platform-generated analytical score combining utilization, flag rate and resolution rate. Not an official ranking.">
                        <SortHeader label="Analytical Score" active={sortKey === 'transparencyScore'} dir={sortDir} onClick={() => toggleSort('transparencyScore')} />
                      </MetricTooltip>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r, i) => (
                    <TableRow key={`${r?.name}-${i}`}>
                      <TableCell className="text-xs">
                        {i + 1 <= 3 && sortKey === 'transparencyScore' && sortDir === 'desc' ? (
                          <Badge className={i + 1 === 1 ? 'bg-amber-500 text-white' : i + 1 === 2 ? 'bg-slate-400 text-white' : 'bg-orange-700 text-white'}>#{i + 1}</Badge>
                        ) : <span className="text-xs">#{i + 1}</span>}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{r?.name ?? 'Not available'}{r?.constituency ? ` (${r.constituency})` : ''}</TableCell>
                      <TableCell className="text-xs">{r?.stateName ?? 'Not available'}</TableCell>
                      <TableCell className="text-xs font-mono">{typeof r?.totalWorks === 'number' ? r.totalWorks : 'Not available'}</TableCell>
                      <TableCell className="text-xs font-mono">{fmtPct(r?.utilizationRate)}</TableCell>
                      <TableCell className="text-xs font-mono">{fmtPct(r?.flagRate)}</TableCell>
                      {tab === 'mp' && <TableCell className="text-xs font-mono">{fmtPct(r?.resolutionRate)}</TableCell>}
                      <TableCell>
                        {typeof r?.transparencyScore === 'number'
                          ? <Badge className="bg-emerald-600 text-white">{r.transparencyScore}</Badge>
                          : <span className="text-xs text-muted-foreground">N/A</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        These figures reflect risk indicators and reporting activity captured by the platform. They are not a finding of wrongdoing — flagged works and lower scores mean "requires review," not "confirmed fraud."
      </p>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 3. Citizen Report
// ══════════════════════════════════════════════════════════════════════════

const MAX_PHOTO_MB = 8
const ACCEPTED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export function CitizenReportView() {
  const { toast } = useToast()
  const [workId, setWorkId] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [contact, setContact] = useState('')
  const [description, setDescription] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [geo, setGeo] = useState<{ lat: number; lng: number; capturedAt: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({ title: 'Location not supported on this device', variant: 'destructive' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, capturedAt: new Date().toISOString() })
        toast({ title: 'Location captured' })
      },
      () => toast({ title: 'Location permission denied', variant: 'destructive' })
    )
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported file type', description: 'Please attach a JPG, PNG, WEBP or HEIC image.', variant: 'destructive' })
      return
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      toast({ title: 'File too large', description: `Photos must be under ${MAX_PHOTO_MB}MB.`, variant: 'destructive' })
      return
    }
    setPhotoFile(file)
    // Note: this only records the filename locally. The current backend does not
    // accept binary uploads, so no file bytes are actually sent to the server.
    setPhotoUrl(`photo://${file.name}`)
    toast({ title: 'Photo attached (local only)', description: file.name })
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!workId.trim()) errs.workId = 'Work ID is required.'
    if (description.trim().length < 10) errs.description = 'Please describe what you observed in at least 10 characters.'
    if (description.trim().length > 2000) errs.description = 'Description is too long (max 2000 characters).'
    if (contact.trim() && !/^[\d+\-\s()]{7,15}$/.test(contact.trim()) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim())) {
      errs.contact = 'Enter a valid phone number or email address.'
    }
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async () => {
    if (!validate()) {
      toast({ title: 'Please fix the highlighted fields', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const { data, error } = await fetchSafe('/api/citizen-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workId: workId.trim(),
        reporterName: reporterName.trim() || null,
        contact: contact.trim() || null,
        description: description.trim(),
        photoUrl,
        geoLat: geo?.lat,
        geoLng: geo?.lng,
      }),
    })
    setSubmitting(false)
    if (error) {
      toast({ title: 'Submission failed', description: error, variant: 'destructive' })
      return
    }
    setResult(data)
    toast({ title: 'Report submitted' })
  }

  const resetForm = () => {
    setWorkId(''); setReporterName(''); setContact(''); setDescription('')
    setPhotoFile(null); setPhotoUrl(null); setGeo(null); setResult(null); setFieldErrors({})
  }

  if (result) {
    const matchedFlags: string[] = Array.isArray(result.matchedFlags) ? result.matchedFlags : []
    const refId = result.reportId ?? result.id ?? result.referenceId
    return (
      <div className="space-y-4 max-w-xl">
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" /> Report submitted
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2 text-xs">
              <div className="text-muted-foreground">Reference ID</div>
              <div className="font-mono">{refId ?? 'Not available'}</div>
              <div className="text-muted-foreground">Status</div>
              <div><StatusBadge variant="pending" label="RECEIVED" /></div>
              <div className="text-muted-foreground">Matched indicators</div>
              <div>{matchedFlags.length}</div>
            </div>
            {result.crossReference && (
              <div>
                <div className="text-xs font-semibold mb-1">Cross-reference result</div>
                <p className="text-xs text-muted-foreground">{result.crossReference}</p>
              </div>
            )}
            {matchedFlags.length > 0 && (
              <div>
                <div className="text-xs font-semibold mb-1">Matched flags</div>
                <div className="flex flex-wrap gap-1">
                  {matchedFlags.map((f, i) => <Badge key={i} variant="outline" className="text-xs">{f}</Badge>)}
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={resetForm}>Submit another report</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Report a Suspicious Work"
        subtitle="Whistleblower portal — your report is automatically cross-referenced against system flags."
      />

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="pt-6 space-y-6">
            <FormSection step={1} title="Work identification">
              <div>
                <Label className="text-xs" htmlFor="workId">Work ID (if known)</Label>
                <Input id="workId" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="e.g., W00123" aria-invalid={!!fieldErrors.workId} />
                {fieldErrors.workId && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.workId}</p>}
              </div>
            </FormSection>

            <FormSection step={2} title="Issue description">
              <div>
                <Label className="text-xs" htmlFor="description">Describe what you observed</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Road work marked completed but no construction visible at site. Funds seem diverted."
                  className="min-h-[100px]"
                  aria-invalid={!!fieldErrors.description}
                />
                <div className="flex justify-between mt-1">
                  {fieldErrors.description ? <p className="text-[11px] text-red-600">{fieldErrors.description}</p> : <span />}
                  <span className="text-[11px] text-muted-foreground">{description.length}/2000</span>
                </div>
              </div>
            </FormSection>

            <FormSection step={3} title="Evidence">
              <Label className="text-xs">Photo (optional)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
                  <Camera className="w-4 h-4 mr-1" /> Attach
                </Button>
                {photoUrl && <span className="text-xs text-emerald-700">{photoFile?.name} selected</span>}
                <input id="photo-upload" type="file" accept={ACCEPTED_PHOTO_TYPES.join(',')} capture="environment" className="hidden" onChange={onPhoto} />
              </div>
              {photoUrl && (
                <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" /> Selected locally only — this file is not uploaded to a server by this form.
                </p>
              )}
            </FormSection>

            <FormSection step={4} title="Location">
              <Button variant="outline" size="sm" onClick={captureLocation}>
                <MapPin className="w-4 h-4 mr-1" /> Capture current location
              </Button>
              {geo && (
                <div className="text-xs text-emerald-700 mt-1.5 space-y-0.5">
                  <div className="font-mono">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</div>
                  <div className="text-muted-foreground">Captured {fmtDate(geo.capturedAt)}</div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1.5">Location is used to help associate the report with the reported work. It's optional and only sent if you capture it.</p>
            </FormSection>

            <FormSection step={5} title="Contact">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs" htmlFor="reporterName">Your name (optional)</Label>
                  <Input id="reporterName" value={reporterName} onChange={(e) => setReporterName(e.target.value)} placeholder="Leave blank to stay anonymous" />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="contact">Contact (optional)</Label>
                  <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="phone or email" aria-invalid={!!fieldErrors.contact} />
                  {fieldErrors.contact && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.contact}</p>}
                </div>
              </div>
            </FormSection>

            <Button className="bg-emerald-600 hover:bg-emerald-700 w-full" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting…</> : 'Submit Report'}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">How it works</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <p>1. You submit a report with an optional photo and location.</p>
              <p>2. The system cross-references your report against existing flags for the work ID you provide.</p>
              <p>3. If the work is already flagged by the analytical model, your report is automatically marked as "matched" and escalated for review.</p>
              <p>4. Reports without matching flags are still logged for manual review.</p>
              <p className="pt-2 border-t">Reports may be rate-limited to prevent abuse. Personal information in vendor records is masked by default.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function FormSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{step}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <div className="pl-7 space-y-2">{children}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// 4. Field Verification
// ══════════════════════════════════════════════════════════════════════════

export function FieldVerificationView() {
  const { toast } = useToast()
  const [workId, setWorkId] = useState('')
  const [work, setWork] = useState<any>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [geo, setGeo] = useState<{ lat: number; lng: number; capturedAt: string } | null>(null)
  const [matchesClaim, setMatchesClaim] = useState<boolean | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifications, setVerifications] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [lastResult, setLastResult] = useState<any | null>(null)

  const loadVerifications = async (id: string) => {
    const { data } = await fetchSafe(`/api/field-verification?workId=${encodeURIComponent(id)}`)
    setVerifications(Array.isArray(data?.verifications) ? data.verifications : [])
  }

  const loadWork = async () => {
    if (!workId.trim()) return
    setLoading(true)
    setLookupError(null)
    setWork(null)
    const { data, error } = await fetchSafe(`/api/works/${encodeURIComponent(workId.trim())}/risk`)
    if (error) {
      setLookupError(error)
      toast({ title: 'Work not found', description: error, variant: 'destructive' })
    } else {
      setWork(data)
      await loadVerifications(workId.trim())
    }
    setLoading(false)
  }

  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast({ title: 'Location not supported on this device', variant: 'destructive' })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, capturedAt: new Date().toISOString() }); toast({ title: 'Location captured' }) },
      () => toast({ title: 'Location permission denied', variant: 'destructive' })
    )
  }

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
      toast({ title: 'Unsupported file type', variant: 'destructive' })
      return
    }
    setPhotoFile(file)
    setPhotoUrl(`photo://${file.name}`)
  }

  const submit = async () => {
    if (matchesClaim === null) {
      toast({ title: 'Select whether the work matches the claim', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    const { data, error } = await fetchSafe('/api/field-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId: workId.trim(), photoUrl, geoLat: geo?.lat, geoLng: geo?.lng, matchesClaim, notes: notes.trim() || null }),
    })
    setSubmitting(false)
    if (error) {
      toast({ title: 'Failed to log verification', description: error, variant: 'destructive' })
      return
    }
    setLastResult({ ...data, matchesClaim, submittedAt: new Date().toISOString() })
    toast({ title: 'Verification logged', description: matchesClaim ? 'Work matches claim' : 'Mismatch logged to audit trail' })
    await loadVerifications(workId.trim())
    setMatchesClaim(null); setNotes(''); setPhotoFile(null); setPhotoUrl(null)
  }

  const riskIndicators: string[] = Array.isArray(work?.risk?.indicators) ? work.risk.indicators
    : Array.isArray(work?.risk?.flags) ? work.risk.flags : []

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Field Verification"
        subtitle="Mobile-friendly workflow for field auditors to verify flagged works."
      />
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-2.5 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">Field verification is an evidence record. It does not, by itself, establish fraud.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Step 1 — Look up work</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Work ID e.g., W00001" onKeyDown={(e) => e.key === 'Enter' && loadWork()} />
            <Button className="bg-emerald-600 hover:bg-emerald-700 shrink-0" onClick={loadWork} disabled={loading || !workId.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
            </Button>
          </div>
          {lookupError && <p className="text-xs text-red-600 mt-2">{lookupError}</p>}
        </CardContent>
      </Card>

      {work && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Step 2 — Work Details</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1.5">
              <DetailRow label="ID" value={work.workId} />
              <DetailRow label="Title" value={work.title} />
              <DetailRow label="Category" value={work.category} />
              <DetailRow label="State" value={work.stateName} />
              <DetailRow label="District" value={work.districtName} />
              <DetailRow label="Sanctioned" value={typeof work.fundSanctioned === 'number' ? `₹${work.fundSanctioned}L` : undefined} />
              <DetailRow label="Utilized" value={typeof work.fundUtilized === 'number' ? `₹${work.fundUtilized}L` : undefined} />
              <DetailRow label="Completion status" value={work.status ?? work.completionStatus} />
              <DetailRow label="Vendor" value={work.vendor?.name} />
              <div className="pt-2 border-t">
                <span className="text-muted-foreground">Risk score:</span>{' '}
                {work.risk?.riskTier ? (
                  <Badge style={{ background: work.risk.riskTier === 'critical' ? '#dc2626' : work.risk.riskTier === 'high' ? '#ea580c' : '#16a34a', color: 'white' }}>
                    {work.risk.riskTier}
                  </Badge>
                ) : <span className="text-muted-foreground">Not available</span>}
                {typeof work.risk?.ensembleScore === 'number' && <span className="ml-2 font-mono">{fmtPct(work.risk.ensembleScore, 0)}</span>}
              </div>
              <div>
                <span className="text-muted-foreground">Risk indicators:</span>{' '}
                {riskIndicators.length === 0 ? (
                  <span className="text-muted-foreground">Not available</span>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {riskIndicators.map((f, i) => <Badge key={i} variant="outline" className="text-[10px]">{f}</Badge>)}
                  </div>
                )}
              </div>
              {Array.isArray(work.fieldVerifications) && work.fieldVerifications.length > 0 && (
                <div className="pt-2 border-t">
                  <div className="font-semibold mb-1">Previous verifications</div>
                  {work.fieldVerifications.map((v: any, i: number) => (
                    <div key={i} className="text-[10px] flex items-center gap-1">
                      {v.matchesClaim ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <XCircle className="w-3 h-3 text-red-600" />}
                      {fmtDate(v.verifiedAt)} — {v.auditorName ?? 'Not available'}: {v.matchesClaim ? 'MATCH' : 'MISMATCH'}{v.notes && ` — ${v.notes}`}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Step 3–5 — Evidence &amp; Verification</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Photo</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('fv-photo')?.click()}>
                    <Camera className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  {photoUrl && <span className="text-xs text-emerald-700">{photoFile?.name} selected</span>}
                  <input id="fv-photo" type="file" accept={ACCEPTED_PHOTO_TYPES.join(',')} capture="environment" className="hidden" onChange={onPhoto} />
                </div>
                {photoUrl && <p className="text-[11px] text-amber-700 mt-1">Selected locally only — not uploaded to a server by this form.</p>}
              </div>
              <div>
                <Label className="text-xs">GPS Location</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={captureLocation}>
                    <MapPin className="w-4 h-4 mr-1" /> Capture
                  </Button>
                  {geo && <span className="text-xs text-emerald-700 font-mono">{geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}</span>}
                </div>
              </div>
              <div>
                <Label className="text-xs">Does the site match the claim?</Label>
                <div className="flex gap-2 mt-1">
                  <Button size="sm" variant={matchesClaim === true ? 'default' : 'outline'} className={matchesClaim === true ? 'bg-emerald-600 hover:bg-emerald-700' : ''} onClick={() => setMatchesClaim(true)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Matches
                  </Button>
                  <Button size="sm" variant={matchesClaim === false ? 'default' : 'outline'} className={matchesClaim === false ? 'bg-red-600 hover:bg-red-700' : ''} onClick={() => setMatchesClaim(false)}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Mismatch
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Observations / notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., Road surface missing; only sub-base visible at site." className="min-h-[60px]" />
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Log Verification
              </Button>
              {lastResult && (
                <div className="text-[11px] text-muted-foreground border-t pt-2 space-y-0.5">
                  <div>Last logged: {fmtDate(lastResult.submittedAt)}</div>
                  <div>Result: {lastResult.matchesClaim ? 'Match' : 'Mismatch'}</div>
                  <div>Audit status: {lastResult.status ?? lastResult.auditStatus ?? 'Recorded'}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return <div><span className="text-muted-foreground">{label}:</span> {value !== undefined && value !== null && value !== '' ? value : 'Not available'}</div>
}

// ══════════════════════════════════════════════════════════════════════════
// 5. System Health
// ══════════════════════════════════════════════════════════════════════════

function HealthStatusCard({ label, status, icon }: { label: string; status: BadgeVariant; icon: React.ReactNode }) {
  const dotColor: Record<string, string> = {
    healthy: 'bg-emerald-500', degraded: 'bg-amber-500', critical: 'bg-red-500',
    warning: 'bg-amber-500', error: 'bg-red-500', unknown: 'bg-slate-300',
  }
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-6 h-6 rounded bg-slate-100 text-slate-700 flex items-center justify-center">{icon}</div>
        <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor[status] ?? 'bg-slate-300'}`} />
        <span className="text-sm font-bold capitalize">{BADGE_TEXT[status]}</span>
      </div>
    </Card>
  )
}

export function SystemHealthView() {
  const [data, setData] = useState<any>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [forecast, setForecast] = useState<any>(null)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const { data: d, error } = await fetchSafe('/api/system/health')
      if (cancelled) return
      if (error) setHealthError(error)
      else { setData(d); setHealthError(null) }
      setLastChecked(new Date().toISOString())
    }
    ;(async () => {
      await refresh()
      const { data: f, error: fErr } = await fetchSafe('/api/forecast')
      if (cancelled) return
      if (fErr) setForecastError(fErr)
      else setForecast(f)
    })()
    const interval = setInterval(refresh, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!data && !healthError) return <LoadingBlock label="Loading system health…" />
  if (!data && healthError) return <ErrorState message={healthError} />

  const memMb = typeof data.memoryUsage?.rss === 'number' ? (data.memoryUsage.rss / 1024 / 1024).toFixed(1) : null

  const apiStatus: BadgeVariant = typeof data.apiLatencyP95 !== 'number' ? 'unknown'
    : data.apiLatencyP95 < 400 ? 'healthy' : data.apiLatencyP95 < 1200 ? 'degraded' : 'critical'
  const dbStatus: BadgeVariant = data.dbSize && typeof data.dbSize.approxRows === 'number' ? 'healthy' : 'unknown'
  const pipelineStatusRaw: string | undefined = data.pipeline?.status
  const riskEngineStatus: BadgeVariant = !pipelineStatusRaw ? 'unknown'
    : /error|fail/i.test(pipelineStatusRaw) ? 'critical'
    : /running|idle|ready|ok|complete/i.test(pipelineStatusRaw) ? 'healthy' : 'unknown'
  const overallStatus: BadgeVariant = [apiStatus, dbStatus, riskEngineStatus].includes('critical') ? 'critical'
    : [apiStatus, dbStatus, riskEngineStatus].includes('degraded') ? 'degraded'
    : [apiStatus, dbStatus, riskEngineStatus].every((s) => s === 'healthy') ? 'healthy' : 'unknown'

  const forecastChart = Array.isArray(forecast?.forecasts)
    ? forecast.forecasts.flatMap((f: any) => [
        ...(Array.isArray(f.history) ? f.history.map((h: any) => ({ date: (h.date ?? '').substring(0, 7), value: h.count })) : []),
        ...(Array.isArray(f.forecast) ? f.forecast.map((pt: any) => ({ date: (pt.date ?? '').substring(0, 7), value: pt.predicted })) : []),
      ]).slice(-24)
    : []

  return (
    <div className="space-y-4">
      <SectionHeader
        title="System Health"
        subtitle="Live operational metrics with analytical forecast trends."
        badge={healthError ? <StatusBadge variant="error" /> : <StatusBadge variant={overallStatus} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthStatusCard label="API" status={apiStatus} icon={<Clock className="w-3.5 h-3.5" />} />
        <HealthStatusCard label="Database" status={dbStatus} icon={<DatabaseIcon className="w-3.5 h-3.5" />} />
        <HealthStatusCard label="Risk Engine" status={riskEngineStatus} icon={<ShieldCheck className="w-3.5 h-3.5" />} />
        <HealthStatusCard label="System" status={overallStatus} icon={<Activity className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="API Latency (p95)" value={typeof data.apiLatencyP95 === 'number' ? `${data.apiLatencyP95.toFixed(1)}ms` : 'Not available'} icon={<Clock className="w-4 h-4" />} />
        <MetricCard label="Uptime" value={formatUptime(data.uptime)} icon={<Server className="w-4 h-4" />} />
        <MetricCard label="Memory (RSS)" value={memMb ? `${memMb} MB` : 'Not available'} icon={<Cpu className="w-4 h-4" />} />
        <MetricCard label="DB Rows" value={typeof data.dbSize?.approxRows === 'number' ? data.dbSize.approxRows.toLocaleString() : 'Not available'} icon={<HardDrive className="w-4 h-4" />} />
        <MetricCard label="Total Requests" value={typeof data.totalRequests === 'number' ? data.totalRequests.toLocaleString() : 'Not available'} icon={<Activity className="w-4 h-4" />} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline Status</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          <div>Status: <Badge variant="outline">{pipelineStatusRaw ?? 'Not available'}</Badge></div>
          <div>Last run: {data.pipeline?.lastRun ? fmtDate(data.pipeline.lastRun) : 'Never'}</div>
          <div>Works scored: {fmtNum(data.pipeline?.scored)}</div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">DB Tables (row counts)</CardTitle></CardHeader>
          <CardContent>
            {!data.dbSize?.tables || Object.keys(data.dbSize.tables).length === 0 ? (
              <EmptyState message="Table breakdown not available." />
            ) : (
              <Table>
                <TableBody>
                  {Object.entries(data.dbSize.tables).map(([k, v]: [string, any]) => (
                    <TableRow key={k}>
                      <TableCell className="text-xs">{k}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{typeof v === 'number' ? v.toLocaleString() : 'Not available'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Forecast — Aggregate Flag Trend</CardTitle>
            <CardDescription className="text-[11px]">Forecast / analytical projection, not a guaranteed prediction.</CardDescription>
          </CardHeader>
          <CardContent>
            {forecastError ? (
              <ErrorState message={forecastError} />
            ) : forecastChart.length === 0 ? (
              <EmptyState message="Forecast data not available." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={forecastChart}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="value" name="Flag count" stroke="#16a34a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground mt-2">Aggregated across states. Projection uses historical flag counts and trend extrapolation — treat as directional, not exact.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3 text-xs text-muted-foreground text-center">
          Timestamp: {fmtDate(data.timestamp)} • Last checked: {lastChecked ? fmtDate(lastChecked) : 'Not available'} • Auto-refreshing every 5s
          {healthError && <span className="text-red-600 block mt-1">Latest refresh failed: {healthError}</span>}
        </CardContent>
      </Card>
    </div>
  )
}