// components/IndiaMap.tsx
// Real India geography (760 districts, 36 states/UTs) — Google Maps–style zoom/pan,
// click-to-drill state -> district, animated transitions, MP/fund side panel.
//
// Install first:
//   npm install d3 topojson-client
//   npm install -D @types/d3 @types/topojson-client
//
// Data file: public/data/india-districts.topo.json (already included alongside this file —
// copy it into your Next.js `public/data/` folder).
//
// Optional API: if you have real per-district MP/fund data, expose it at
//   GET /api/map/district?state=<name>&district=<name>
// returning { mps: [{name, party, sanctioned, utilized}], works, critical } and this
// component will use it automatically. Until then it falls back to seeded demo data
// so the UI is fully interactive out of the box.

'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import * as topojson from 'topojson-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, ArrowLeft, X, Search } from 'lucide-react'

// ---------- types ----------

interface DistrictFeature {
  type: 'Feature'
  properties: { district: string; st_nm: string; st_code: string; dt_code: string }
  geometry: GeoJSON.Geometry
}

interface MpEntry {
  name: string
  party: string
  sanctioned: number
  utilized: number
}

interface DistrictStats {
  works: number
  sanctioned: number
  utilized: number
  utilizationRate: number
  critical: number
  mps: MpEntry[]
}

// ---------- deterministic demo data (swap for your real API) ----------

const SEATS_BY_STATE: Record<string, number> = {
  'Uttar Pradesh': 80, Maharashtra: 48, 'West Bengal': 42, Bihar: 40, 'Tamil Nadu': 39,
  'Madhya Pradesh': 29, Karnataka: 28, Gujarat: 26, Rajasthan: 25, 'Andhra Pradesh': 25,
  Odisha: 21, Kerala: 20, Telangana: 17, Jharkhand: 14, Assam: 14, Punjab: 13,
  Chhattisgarh: 11, Haryana: 10, Delhi: 7, 'Jammu and Kashmir': 5, Uttarakhand: 5,
  'Himachal Pradesh': 4, Tripura: 2, Meghalaya: 2, Manipur: 2, Nagaland: 1, Goa: 2,
  'Arunachal Pradesh': 2, Mizoram: 1, Sikkim: 1, Puducherry: 1, Chandigarh: 1,
  'Andaman and Nicobar Islands': 1, Lakshadweep: 1,
  'Dadra and Nagar Haveli and Daman and Diu': 2, Ladakh: 1,
}
const FIRST = ['Rajesh', 'Priya', 'Anil', 'Sunita', 'Vikram', 'Meena', 'Arjun', 'Kavita', 'Suresh', 'Deepa']
const LAST = ['Sharma', 'Patel', 'Reddy', 'Singh', 'Verma', 'Nair', 'Iyer', 'Gupta', 'Yadav', 'Rao']
const PARTY = ['INC', 'BJP', 'DMK', 'TMC', 'JD(U)', 'SP', 'BJD', 'RJD', 'AAP', 'NCP']

function seeded(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return () => {
    h = Math.imul(h ^ (h >>> 15), 1 | h)
    h ^= h + Math.imul(h ^ (h >>> 7), 61 | h)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
}

function demoStateUtilization(stateName: string): number {
  const r = seeded(stateName)
  return 0.35 + r() * 0.75
}

function demoDistrictStats(stateName: string, districtName: string): DistrictStats {
  const r = seeded(stateName + '::' + districtName)
  const seats = SEATS_BY_STATE[stateName] ?? 1
  const utilizationRate = 0.35 + r() * 0.7
  const sanctioned = Math.round((6 + r() * 10) * 10) / 10
  const utilized = Math.round(sanctioned * utilizationRate * 10) / 10
  const works = Math.round(8 + r() * 30)
  const critical = Math.round(r() * 4)
  const n = Math.max(1, Math.min(3, Math.ceil(seats / 12)))
  const mps: MpEntry[] = Array.from({ length: n }).map((_, i) => {
    const mr = seeded(stateName + districtName + i)
    const s = Math.round((4 + mr() * 5) * 10) / 10
    return {
      name: `${FIRST[Math.floor(mr() * FIRST.length)]} ${LAST[Math.floor(mr() * LAST.length)]}`,
      party: PARTY[Math.floor(mr() * PARTY.length)],
      sanctioned: s,
      utilized: Math.round(s * (0.4 + mr() * 0.55) * 10) / 10,
    }
  })
  return { works, sanctioned, utilized, utilizationRate, critical, mps }
}

async function fetchDistrictStats(stateName: string, districtName: string): Promise<DistrictStats> {
  try {
    const res = await fetch(
      `/api/map/district?state=${encodeURIComponent(stateName)}&district=${encodeURIComponent(districtName)}`,
    )
    if (res.ok) return await res.json()
  } catch {
    /* fall through to demo data */
  }
  return demoDistrictStats(stateName, districtName)
}

function colorFor(rate: number) {
  if (rate >= 0.85) return '#16a34a'
  if (rate >= 0.7) return '#84cc16'
  if (rate >= 0.5) return '#ca8a04'
  if (rate >= 0.3) return '#ea580c'
  return '#dc2626'
}

// ---------- component ----------

const WIDTH = 960
const HEIGHT = 860

export function IndiaMap() {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gRef = useRef<SVGGElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const projectionRef = useRef<d3.GeoProjection | null>(null)
  const pathRef = useRef<d3.GeoPath | null>(null)

  const [loading, setLoading] = useState(true)
  const [features, setFeatures] = useState<DistrictFeature[]>([])
  const [selectedState, setSelectedState] = useState<string | null>(null)
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictFeature | null>(null)
  const [stats, setStats] = useState<DistrictStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [query, setQuery] = useState('')

  // load real topojson once
  useEffect(() => {
    let cancelled = false
    fetch('/data/india-districts.topo.json')
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return
        const geo = topojson.feature(topo, topo.objects.districts) as unknown as {
          features: DistrictFeature[]
        }
        setFeatures(geo.features)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const stateNames = useMemo(
    () => Array.from(new Set(features.map((f) => f.properties.st_nm))).sort(),
    [features],
  )

  const suggestions = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return stateNames.filter((s) => s.toLowerCase().includes(q)).slice(0, 8)
  }, [query, stateNames])

  // draw map once features are ready
  useEffect(() => {
    if (!features.length || !svgRef.current || !gRef.current) return

    const svg = d3.select(svgRef.current)
    const g = d3.select(gRef.current)
    g.selectAll('*').remove()

    const collection = { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection
    const projection = d3.geoMercator().fitSize([WIDTH, HEIGHT], collection)
    const path = d3.geoPath().projection(projection)
    projectionRef.current = projection
    pathRef.current = path

    g.selectAll('path.district')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'district')
      .attr('d', path as any)
      .attr('fill', (d) => colorFor(demoStateUtilization(d.properties.st_nm)))
      .attr('stroke', '#0b1220')
      .attr('stroke-width', 0.4)
      .style('cursor', 'pointer')
      .style('transition', 'filter .15s, stroke-width .15s')
      .on('mouseenter', function () {
        d3.select(this).style('filter', 'brightness(1.2)').attr('stroke-width', 1)
      })
      .on('mouseleave', function (_ev, d) {
        const isSelected = selectedDistrict?.properties.dt_code === d.properties.dt_code
        d3.select(this)
          .style('filter', isSelected ? 'brightness(1.15)' : 'none')
          .attr('stroke-width', isSelected ? 1.4 : 0.4)
      })
      .on('click', (_ev, d) => handleDistrictClick(d))
      .append('title')
      .text((d) => `${d.properties.district}, ${d.properties.st_nm}`)

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 30])
      .on('zoom', (ev) => g.attr('transform', ev.transform.toString()))
    svg.call(zoom)
    zoomRef.current = zoom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features])

  const zoomToBounds = useCallback((bounds: [[number, number], [number, number]], pad = 0.85) => {
    if (!svgRef.current || !zoomRef.current) return
    const [[x0, y0], [x1, y1]] = bounds
    const dx = x1 - x0,
      dy = y1 - y0,
      cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2
    const scale = Math.max(1, Math.min(30, pad / Math.max(dx / WIDTH, dy / HEIGHT)))
    const translate: [number, number] = [WIDTH / 2 - scale * cx, HEIGHT / 2 - scale * cy]
    d3.select(svgRef.current)
      .transition()
      .duration(750)
      .ease(d3.easeCubicOut)
      .call(
        zoomRef.current.transform as any,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
      )
  }, [])

  const handleStateSelect = useCallback(
    (stateName: string) => {
      setSelectedState(stateName)
      setSelectedDistrict(null)
      setStats(null)
      const path = pathRef.current
      if (!path) return
      const stateFeatures = features.filter((f) => f.properties.st_nm === stateName)
      const collection = { type: 'FeatureCollection', features: stateFeatures } as GeoJSON.FeatureCollection
      zoomToBounds(path.bounds(collection as any) as [[number, number], [number, number]])
      d3.select(gRef.current)
        .selectAll<SVGPathElement, DistrictFeature>('path.district')
        .attr('fill-opacity', (d) => (d.properties.st_nm === stateName ? 1 : 0.25))
      setQuery('')
    },
    [features, zoomToBounds],
  )

  const handleDistrictClick = useCallback(
    async (d: DistrictFeature) => {
      setSelectedState(d.properties.st_nm)
      setSelectedDistrict(d)
      const path = pathRef.current
      if (path) zoomToBounds(path.bounds(d as any) as [[number, number], [number, number]], 0.6)
      d3.select(gRef.current)
        .selectAll<SVGPathElement, DistrictFeature>('path.district')
        .attr('fill-opacity', (f) => (f.properties.st_nm === d.properties.st_nm ? 1 : 0.25))
        .attr('stroke-width', (f) => (f.properties.dt_code === d.properties.dt_code ? 1.4 : 0.4))
      setStatsLoading(true)
      const s = await fetchDistrictStats(d.properties.st_nm, d.properties.district)
      setStats(s)
      setStatsLoading(false)
    },
    [zoomToBounds],
  )

  const resetView = useCallback(() => {
    setSelectedState(null)
    setSelectedDistrict(null)
    setStats(null)
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(650)
        .ease(d3.easeCubicOut)
        .call(zoomRef.current.transform as any, d3.zoomIdentity)
    }
    d3.select(gRef.current)
      .selectAll<SVGPathElement, DistrictFeature>('path.district')
      .attr('fill-opacity', 1)
      .attr('stroke-width', 0.4)
  }, [])

  const districtsInState = useMemo(
    () => (selectedState ? features.filter((f) => f.properties.st_nm === selectedState) : []),
    [features, selectedState],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">India Map</h1>
          <p className="text-sm text-muted-foreground">
            Real state &amp; district boundaries · click to zoom · drag to pan · scroll to zoom
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search state..."
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStateSelect(s)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 relative overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center h-[640px]">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <div className="relative bg-slate-50 dark:bg-slate-900">
                {selectedState && (
                  <button
                    onClick={resetView}
                    className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-md border bg-background/90 px-3 py-1.5 text-xs shadow-md"
                  >
                    <ArrowLeft className="w-3 h-3" /> All India
                  </button>
                )}
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  className="w-full h-[640px]"
                >
                  <g ref={gRef} />
                </svg>
                <div className="absolute bottom-3 left-3 rounded-md border bg-background/90 px-3 py-2 text-[11px] shadow-md">
                  <div className="mb-1 font-medium">Fund utilization</div>
                  <div className="flex h-2 w-40 overflow-hidden rounded">
                    {['#dc2626', '#ea580c', '#ca8a04', '#84cc16', '#16a34a'].map((c) => (
                      <span key={c} style={{ background: c, flex: 1 }} />
                    ))}
                  </div>
                  <div className="mt-1 flex w-40 justify-between text-muted-foreground">
                    <span>&lt;30%</span>
                    <span>50%</span>
                    <span>&gt;85%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">
              {selectedDistrict
                ? selectedDistrict.properties.district
                : selectedState ?? 'State-wise Summary'}
            </CardTitle>
            {(selectedState || selectedDistrict) && (
              <button onClick={resetView} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : selectedDistrict && stats ? (
              <div className="space-y-3 text-sm">
                <div className="text-xs text-muted-foreground">{selectedDistrict.properties.st_nm}</div>
                <Row label="Total Works" value={String(stats.works)} />
                <Row label="Sanctioned" value={`₹${stats.sanctioned} Cr`} />
                <Row label="Utilized" value={`₹${stats.utilized} Cr`} />
                <Row
                  label="Utilization"
                  value={`${Math.round(stats.utilizationRate * 100)}%`}
                  accent={stats.utilizationRate >= 0.7 ? 'emerald' : 'orange'}
                />
                <Row label="Critical Flags" value={String(stats.critical)} accent="red" />
                <div className="pt-2">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">MPLAD MPs</div>
                  <div className="space-y-2">
                    {stats.mps.map((mp) => (
                      <div key={mp.name} className="rounded-md border p-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{mp.name}</span>
                          <Badge variant="secondary">{mp.party}</Badge>
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span>₹{mp.sanctioned} Cr sanctioned</span>
                          <span>₹{mp.utilized} Cr utilized</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedState ? (
              <div className="max-h-[560px] space-y-2 overflow-y-auto">
                {districtsInState.map((f) => (
                  <button
                    key={f.properties.dt_code}
                    onClick={() => handleDistrictClick(f)}
                    className="w-full rounded border p-2 text-left text-sm transition hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  >
                    {f.properties.district}
                  </button>
                ))}
              </div>
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-y-auto">
                {stateNames.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStateSelect(s)}
                    className="w-full rounded border p-2 text-left text-sm transition hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s}</span>
                      <Badge style={{ background: colorFor(demoStateUtilization(s)), color: 'white' }}>
                        {Math.round(demoStateUtilization(s) * 100)}%
                      </Badge>
                    </div>
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

function Row({
  label,
  value,
  accent = 'slate',
}: {
  label: string
  value: string
  accent?: 'slate' | 'emerald' | 'orange' | 'red'
}) {
  const colors = {
    slate: 'text-slate-900 dark:text-slate-100',
    emerald: 'text-emerald-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  }
  return (
    <div className="flex items-center justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${colors[accent]}`}>{value}</span>
    </div>
  )
}