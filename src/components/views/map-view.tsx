// India map view — state-wise choropleth using SVG (simplified)
'use client'
import { useState } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useLang } from '@/hooks/use-lang'
import { Loader2 } from 'lucide-react'

interface StateSummary {
  stateId: string; stateName: string; stateCode: string
  totalWorks: number; totalSanctioned: number; totalUtilized: number
  utilizationRate: number; criticalCount: number; highCount: number; transparencyScore: number
}

// Simplified India state coordinates (bounding-box based, not full GeoJSON)
// Each state is a clickable region with approximate position on a 600x600 SVG
const STATE_POSITIONS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'UP': { x: 280, y: 130, w: 100, h: 70 },
  'MH': { x: 200, y: 270, w: 90, h: 80 },
  'TN': { x: 270, y: 410, w: 70, h: 80 },
  'KA': { x: 220, y: 360, w: 80, h: 70 },
  'WB': { x: 420, y: 200, w: 50, h: 60 },
  'GJ': { x: 140, y: 230, w: 70, h: 60 },
  'RJ': { x: 200, y: 170, w: 80, h: 70 },
  'BR': { x: 400, y: 220, w: 50, h: 50 },
  'MP': { x: 270, y: 220, w: 70, h: 60 },
  'AP': { x: 310, y: 360, w: 60, h: 80 },
  'KL': { x: 220, y: 410, w: 50, h: 60 },
  'PB': { x: 270, y: 80, w: 50, h: 40 },
}

export function MapView({ onStateClick }: { onStateClick?: (stateId: string) => void }) {
  const { tr } = useLang()
  const [states, setStates] = useState<StateSummary[]>([])
  const [selected, setSelected] = useState<StateSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useAsyncEffect(async () => {
    const d = await fetch('/api/map').then(r => r.json())
    setStates(d.states || [])
    setLoading(false)
  }, [])

  const getColor = (util: number) => {
    if (util >= 0.85) return '#16a34a'
    if (util >= 0.7) return '#84cc16'
    if (util >= 0.5) return '#ca8a04'
    if (util >= 0.3) return '#ea580c'
    return '#dc2626'
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{tr('map_title')}</h1>
        <p className="text-sm text-muted-foreground">Color-coded by utilization rate. Click a state for details.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            {loading ? (
              <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <svg viewBox="0 0 600 540" className="w-full h-auto bg-slate-50 rounded">
                {/* Outline of India (very simplified) */}
                <path
                  d="M 100 100 L 200 60 L 280 50 L 350 60 L 450 90 L 480 150 L 470 200 L 460 250 L 440 320 L 410 380 L 350 440 L 290 480 L 240 460 L 200 420 L 180 360 L 150 300 L 130 240 L 100 180 Z"
                  fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4,2"
                />
                {states.map(s => {
                  const pos = STATE_POSITIONS[s.stateCode]
                  if (!pos) return null
                  const isSelected = selected?.stateId === s.stateId
                  return (
                    <g key={s.stateId} onClick={() => { setSelected(s); onStateClick?.(s.stateId) }}
                      className="cursor-pointer">
                      <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h}
                        fill={getColor(s.utilizationRate)}
                        fillOpacity={isSelected ? 1 : 0.7}
                        stroke={isSelected ? '#0f172a' : 'white'}
                        strokeWidth={isSelected ? 3 : 1}
                        rx={4} />
                      <text x={pos.x + pos.w / 2} y={pos.y + pos.h / 2 - 5}
                        textAnchor="middle" className="text-xs font-bold fill-white pointer-events-none">
                        {s.stateCode}
                      </text>
                      <text x={pos.x + pos.w / 2} y={pos.y + pos.h / 2 + 10}
                        textAnchor="middle" className="text-[9px] fill-white pointer-events-none">
                        {Math.round(s.utilizationRate * 100)}%
                      </text>
                    </g>
                  )
                })}
                {/* Legend */}
                <g transform="translate(20, 480)">
                  <text x="0" y="0" className="text-xs fill-slate-700 font-semibold">Utilization %</text>
                  <rect x="0" y="10" width="20" height="10" fill="#dc2626" />
                  <text x="25" y="20" className="text-[10px] fill-slate-700">&lt; 30%</text>
                  <rect x="80" y="10" width="20" height="10" fill="#ea580c" />
                  <text x="105" y="20" className="text-[10px] fill-slate-700">30-50%</text>
                  <rect x="160" y="10" width="20" height="10" fill="#ca8a04" />
                  <text x="185" y="20" className="text-[10px] fill-slate-700">50-70%</text>
                  <rect x="240" y="10" width="20" height="10" fill="#84cc16" />
                  <text x="265" y="20" className="text-[10px] fill-slate-700">70-85%</text>
                  <rect x="320" y="10" width="20" height="10" fill="#16a34a" />
                  <text x="345" y="20" className="text-[10px] fill-slate-700">&gt; 85%</text>
                </g>
              </svg>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">{selected ? selected.stateName : 'State-wise Summary'}</CardTitle></CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-3 text-sm">
                <Row label="Total Works" value={String(selected.totalWorks)} />
                <Row label="Funds Sanctioned" value={`₹${selected.totalSanctioned.toFixed(1)}L`} />
                <Row label="Funds Utilized" value={`₹${selected.totalUtilized.toFixed(1)}L`} />
                <Row label="Utilization Rate" value={`${(selected.utilizationRate * 100).toFixed(1)}%`} accent={selected.utilizationRate >= 0.7 ? 'emerald' : 'orange'} />
                <Row label="Critical Flags" value={String(selected.criticalCount)} accent="red" />
                <Row label="High Flags" value={String(selected.highCount)} accent="orange" />
                <Row label="Transparency Score" value={`${selected.transparencyScore}/100`} accent="emerald" />
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {states.map(s => (
                  <button key={s.stateId} onClick={() => setSelected(s)}
                    className="w-full text-left p-2 rounded border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.stateName}</span>
                      <Badge style={{ background: getColor(s.utilizationRate), color: 'white' }} className="text-xs">
                        {Math.round(s.utilizationRate * 100)}%
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{s.totalWorks} works • {s.criticalCount} critical</div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, accent = 'slate' }: { label: string; value: string; accent?: 'slate' | 'emerald' | 'orange' | 'red' }) {
  const colors = { slate: 'text-slate-900', emerald: 'text-emerald-700', orange: 'text-orange-700', red: 'text-red-700' }
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${colors[accent]}`}>{value}</span>
    </div>
  )
}
