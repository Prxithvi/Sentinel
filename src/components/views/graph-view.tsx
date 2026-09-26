// components/views/graph-view.tsx
'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Network, Search, ZoomIn, ZoomOut, RotateCcw, ShieldAlert } from 'lucide-react'
import { useLang } from '@/hooks/use-lang'

interface GraphNode {
  id: string; vendorId: string; name: string; group: number
  riskScore: number; degree: number; isRing: boolean; pan: string; stateName?: string
}
interface GraphLink { source: string; target: string; type: string; weight: number }
interface GraphCluster {
  clusterId: string; size: number; isRing: boolean; vendorNames: string[]; riskScore: number
}
interface GraphData { nodes: GraphNode[]; links: GraphLink[]; clusters: GraphCluster[]; rings: GraphCluster[] }

type PositionedNode = GraphNode & { x: number; y: number }
type PositionedLink = GraphLink & { x1: number; y1: number; x2: number; y2: number }
type Halo = { group: number; cx: number; cy: number; r: number; isRing: boolean; size: number }

const EDGE_META: Record<string, { color: string; label: string }> = {
  shared_pan: { color: '#DC2626', label: 'Shared PAN' },
  shared_bank: { color: '#D97706', label: 'Shared bank account' },
  co_located: { color: '#0891B2', label: 'Co-located address' },
  same_work: { color: '#7C3AED', label: 'Same MPLAD work' },
}

const CANVAS_W = 900
const CANVAS_H = 560

function riskColor(score: number, isRing: boolean) {
  if (isRing) return '#B91C1C'
  if (score >= 0.5) return '#D97706'
  return '#0F6B4C'
}

function phaseOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 1000) / 1000 * Math.PI * 2
}

function useForceLayout(data: GraphData | null) {
  return useMemo(() => {
    if (!data || data.nodes.length === 0) return { nodes: [] as PositionedNode[], links: [] as PositionedLink[], halos: [] as Halo[] }

    const cx = CANVAS_W / 2
    const cy = CANVAS_H / 2

    const clusters = new Map<number, GraphNode[]>()
    for (const n of data.nodes) {
      if (!clusters.has(n.group)) clusters.set(n.group, [])
      clusters.get(n.group)!.push(n)
    }
    const clusterArr = Array.from(clusters.entries())
    const clusterCount = Math.max(clusterArr.length, 1)

    const pos: Record<string, { x: number; y: number; vx: number; vy: number; homeX: number; homeY: number }> = {}
    clusterArr.forEach(([, nodes], ci) => {
      const angle = (ci / clusterCount) * 2 * Math.PI
      const sectorCx = cx + Math.cos(angle) * Math.min(CANVAS_W, CANVAS_H) * 0.3
      const sectorCy = cy + Math.sin(angle) * Math.min(CANVAS_W, CANVAS_H) * 0.3
      nodes.forEach((n, i) => {
        const a = (i / Math.max(nodes.length, 1)) * 2 * Math.PI
        const jitter = nodes.length > 1 ? 36 : 0
        const hx = sectorCx + Math.cos(a) * jitter
        const hy = sectorCy + Math.sin(a) * jitter
        pos[n.id] = { x: hx, y: hy, vx: 0, vy: 0, homeX: hx, homeY: hy }
      })
    })

    const ids = data.nodes.map((n) => n.id)
    const validLinks = data.links.filter((l) => pos[l.source] && pos[l.target])

    const REPULSION = 1100
    const SPRING_LEN = 70
    const SPRING_K = 0.02
    const CENTER_K = 0.0012
    const HOME_K = 0.018
    const DAMPING = 0.82
    const ITERATIONS = 220

    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < ids.length; i++) {
        const a = pos[ids[i]]
        for (let j = i + 1; j < ids.length; j++) {
          const b = pos[ids[j]]
          const dx = a.x - b.x
          const dy = a.y - b.y
          let distSq = dx * dx + dy * dy
          if (distSq < 1) distSq = 1
          const dist = Math.sqrt(distSq)
          const force = REPULSION / distSq
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          a.vx += fx; a.vy += fy
          b.vx -= fx; b.vy -= fy
        }
      }

      for (const l of validLinks) {
        const a = pos[l.source]
        const b = pos[l.target]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = SPRING_K * (dist - SPRING_LEN)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx += fx; a.vy += fy
        b.vx -= fx; b.vy -= fy
      }

      for (const id of ids) {
        const n = pos[id]
        n.vx += (cx - n.x) * CENTER_K
        n.vy += (cy - n.y) * CENTER_K
        n.vx += (n.homeX - n.x) * HOME_K
        n.vy += (n.homeY - n.y) * HOME_K
        n.vx *= DAMPING
        n.vy *= DAMPING
        n.x += n.vx
        n.y += n.vy
      }
    }

    const margin = 30
    const nodes: PositionedNode[] = data.nodes.map((n) => ({
      ...n,
      x: Math.min(Math.max(pos[n.id].x, margin), CANVAS_W - margin),
      y: Math.min(Math.max(pos[n.id].y, margin), CANVAS_H - margin),
    }))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links: PositionedLink[] = validLinks.map((l) => ({
      ...l,
      x1: byId.get(l.source)?.x ?? 0,
      y1: byId.get(l.source)?.y ?? 0,
      x2: byId.get(l.target)?.x ?? 0,
      y2: byId.get(l.target)?.y ?? 0,
    }))

    const halos: Halo[] = clusterArr
      .filter(([, ns]) => ns.length > 1)
      .map(([group, ns]) => {
        const pts = ns.map((n) => byId.get(n.id)!)
        const hcx = pts.reduce((s, p) => s + p.x, 0) / pts.length
        const hcy = pts.reduce((s, p) => s + p.y, 0) / pts.length
        const r = Math.max(...pts.map((p) => Math.hypot(p.x - hcx, p.y - hcy))) + 26
        return { group, cx: hcx, cy: hcy, r, isRing: ns.some((n) => n.isRing), size: ns.length }
      })

    return { nodes, links, halos }
  }, [data])
}

export function GraphView() {
  const { tr } = useLang()
  const [data, setData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hovered, setHovered] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [ringsOnly, setRingsOnly] = useState(false)
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    () => new Set(Object.keys(EDGE_META))
  )
  const [reducedMotion, setReducedMotion] = useState(false)
  const [tick, setTick] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; viewX: number; viewY: number }>({
    dragging: false, startX: 0, startY: 0, viewX: 0, viewY: 0,
  })

  useAsyncEffect(async () => {
    const res = await fetch('/api/graph').then((r) => r.json())
    setData(res)
  }, [])

  const { nodes, links, halos } = useForceLayout(data)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReducedMotion(reduced)
    if (reduced || nodes.length === 0) return

    let raf = 0
    const start = performance.now()
    const loop = (now: number) => {
      setTick((now - start) / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [nodes.length])

  const drift = useCallback(
    (n: PositionedNode) => {
      if (reducedMotion) return { x: n.x, y: n.y }
      const p = phaseOf(n.id)
      const amp = n.isRing ? 1.4 : 2.4
      return {
        x: n.x + Math.sin(tick * 0.55 + p) * amp,
        y: n.y + Math.cos(tick * 0.45 + p * 1.3) * amp,
      }
    },
    [tick, reducedMotion]
  )

  const matchedIds = useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    return new Set(nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id))
  }, [nodes, query])

  const toggleEdgeType = (type: string) => {
    setActiveEdgeTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const zoomBy = (factor: number) => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.5, v.k * factor)) }))
  const resetView = () => setView({ x: 0, y: 0, k: 1 })

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    zoomBy(e.deltaY > 0 ? 0.92 : 1.08)
  }
  const onMouseDown = (e: React.MouseEvent) => {
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.dragging) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setView((v) => ({ ...v, x: dragState.current.viewX + dx, y: dragState.current.viewY + dy }))
  }
  const endDrag = () => { dragState.current.dragging = false }

  const onNodeEnter = useCallback((n: GraphNode, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHovered({ node: n, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  const dimNode = (n: GraphNode) => {
    if (ringsOnly && !n.isRing) return true
    if (matchedIds && !matchedIds.has(n.id)) return true
    return false
  }

  const ringCount = data?.rings.length ?? 0
  const vendorCount = data?.nodes.length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight text-[var(--sentinel-navy)]">
            {tr('graph_title') || 'Vendor Network — Collusion Ring Detection'}
          </h1>
          <p className="text-sm text-[var(--sentinel-navy-muted)] mt-1 max-w-2xl">
            Contractor and vendor links surfaced from MPLAD works data — shared PAN, bank account,
            registered address or the same sanctioned work. Clusters flagged as likely rings are
            outlined in red.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--sentinel-navy-muted)] bg-white border border-[var(--sentinel-line)] rounded-full px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--sentinel-green-500)] animate-pulse-soft" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--sentinel-green-700)]" />
          </span>
          <span className="font-medium text-[var(--sentinel-navy)]">Live</span>
          <span className="text-[var(--sentinel-line)]">|</span>
          <span>{vendorCount} vendors</span>
          <span className="text-[var(--sentinel-line)]">•</span>
          <span className="text-red-700 font-medium">{ringCount} rings flagged</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3 border-[var(--sentinel-line)]">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--sentinel-navy-muted)]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vendor or contractor…"
                  className="pl-8 h-8 text-sm border-[var(--sentinel-line)] focus-visible:ring-[var(--sentinel-green-500)]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {Object.entries(EDGE_META).map(([type, meta]) => {
                  const active = activeEdgeTypes.has(type)
                  return (
                    <button
                      key={type}
                      onClick={() => toggleEdgeType(type)}
                      className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-colors"
                      style={{
                        borderColor: active ? meta.color : 'var(--sentinel-line)',
                        color: active ? meta.color : 'var(--sentinel-navy-muted)',
                        background: active ? `${meta.color}14` : 'transparent',
                      }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: meta.color, opacity: active ? 1 : 0.3 }} />
                      {meta.label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setRingsOnly((r) => !r)}
                  className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    ringsOnly
                      ? 'border-red-600 text-red-700 bg-red-50'
                      : 'border-[var(--sentinel-line)] text-[var(--sentinel-navy-muted)]'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3" /> Rings only
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0">
            {!data ? (
              <div className="flex items-center justify-center h-96">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--sentinel-green-700)]" />
              </div>
            ) : (
              <div
                ref={containerRef}
                className="relative rounded-lg border border-[var(--sentinel-line)] bg-[var(--sentinel-bg)] overflow-hidden"
              >
                <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90" onClick={() => zoomBy(1.15)}>
                    <ZoomIn className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90" onClick={() => zoomBy(0.87)}>
                    <ZoomOut className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 bg-white/90" onClick={resetView}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <svg
                  viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
                  className="w-full h-[520px] cursor-grab active:cursor-grabbing"
                  onWheel={onWheel}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onMouseUp={endDrag}
                  onMouseLeave={() => { endDrag(); setHovered(null) }}
                >
                  <g transform={`translate(${view.x}, ${view.y}) scale(${view.k})`}>
                    {halos.map((h) => (
                      <circle
                        key={h.group}
                        cx={h.cx}
                        cy={h.cy}
                        r={h.r}
                        fill={h.isRing ? 'rgba(185,28,28,0.05)' : 'rgba(15,107,76,0.05)'}
                        stroke={h.isRing ? 'rgba(185,28,28,0.16)' : 'rgba(15,107,76,0.14)'}
                        strokeWidth={1}
                      />
                    ))}

                    {links
                      .filter((l) => activeEdgeTypes.has(l.type))
                      .map((l, i) => {
                        const meta = EDGE_META[l.type]
                        const sourceRing = byIdIsRing(nodes, l.source)
                        const targetRing = byIdIsRing(nodes, l.target)
                        const faded =
                          (ringsOnly && !sourceRing && !targetRing) ||
                          (matchedIds && !matchedIds.has(l.source) && !matchedIds.has(l.target))
                        const isRingEdge = sourceRing && targetRing
                        return (
                          <line
                            key={i}
                            x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                            stroke={meta?.color || '#94a3b8'}
                            strokeWidth={Math.max(l.weight, 1) * 1.4}
                            strokeOpacity={faded ? 0.06 : 0.45}
                            strokeDasharray={isRingEdge && !reducedMotion ? '5 5' : undefined}
                            className={isRingEdge && !reducedMotion ? 'edge-flow' : undefined}
                          />
                        )
                      })}

                    {nodes.map((n) => {
                      const faded = dimNode(n)
                      const r = n.isRing ? 13 : Math.min(6 + n.degree * 1.3, 16)
                      const isSelected = selectedNode?.id === n.id
                      const showLabel = n.isRing || isSelected || hovered?.node.id === n.id
                      const { x, y } = drift(n)
                      const pulseR = n.isRing ? r + 5 + Math.sin(tick * 1.6 + phaseOf(n.id)) * 2 : 0
                      return (
                        <g
                          key={n.id}
                          transform={`translate(${x}, ${y})`}
                          className="cursor-pointer"
                          opacity={faded ? 0.18 : 1}
                          onClick={() => setSelectedNode(n)}
                          onMouseEnter={(e) => onNodeEnter(n, e)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          {n.isRing && (
                            <circle r={pulseR} fill="none" stroke="#B91C1C" strokeOpacity={0.25} strokeWidth={1.5} />
                          )}
                          <circle
                            r={r}
                            fill={riskColor(n.riskScore, n.isRing)}
                            stroke={isSelected ? 'var(--sentinel-navy)' : 'white'}
                            strokeWidth={isSelected ? 2.5 : 1}
                          />
                          {showLabel && (
                            <text
                              y={-r - 6}
                              textAnchor="middle"
                              className="fill-[var(--sentinel-navy)] font-medium pointer-events-none"
                              style={{ fontSize: 10 }}
                            >
                              {n.name.length > 18 ? `${n.name.slice(0, 18)}…` : n.name}
                            </text>
                          )}
                        </g>
                      )
                    })}
                  </g>
                </svg>

                {hovered && (
                  <div
                    className="absolute z-20 pointer-events-none rounded-lg border border-[var(--sentinel-line)] bg-white shadow-lg px-3 py-2 text-xs max-w-[220px]"
                    style={{
                      left: Math.min(hovered.x + 12, (containerRef.current?.clientWidth || 0) - 200),
                      top: Math.max(hovered.y - 10, 8),
                    }}
                  >
                    <div className="font-semibold text-[var(--sentinel-navy)]">{hovered.node.name}</div>
                    <div className="text-[var(--sentinel-navy-muted)] mt-0.5">
                      PAN {hovered.node.pan.slice(0, 3)}XXXXX{hovered.node.pan.slice(8)}
                    </div>
                    {hovered.node.stateName && (
                      <div className="text-[var(--sentinel-navy-muted)]">{hovered.node.stateName}</div>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-white text-[10px] font-medium"
                        style={{ background: riskColor(hovered.node.riskScore, hovered.node.isRing) }}
                      >
                        {(hovered.node.riskScore * 100).toFixed(0)}% risk
                      </span>
                      {hovered.node.isRing && (
                        <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-medium">
                          RING
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[var(--sentinel-line)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-[var(--sentinel-navy)]">
                <Network className="w-4 h-4 text-[var(--sentinel-green-700)]" /> Detected rings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.rings.length ? (
                <div className="space-y-3">
                  {[...data.rings]
                    .sort((a, b) => b.riskScore - a.riskScore)
                    .map((r) => (
                      <div key={r.clusterId} className="border-l-2 border-red-600 pl-2.5">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-600 text-white text-xs hover:bg-red-600">{r.clusterId}</Badge>
                          <span className="text-xs font-semibold text-[var(--sentinel-navy)]">Ring of {r.size}</span>
                        </div>
                        <div className="text-xs text-[var(--sentinel-navy-muted)] mt-1">
                          {r.vendorNames.map((n) => (n.length > 18 ? `${n.slice(0, 18)}…` : n)).join(' • ')}
                        </div>
                        <div className="text-xs text-red-700 font-medium mt-1">
                          Risk score: {(r.riskScore * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-xs text-[var(--sentinel-navy-muted)]">No rings detected</div>
              )}
            </CardContent>
          </Card>

          {selectedNode && (
            <Card className="border-[var(--sentinel-line)]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-[var(--sentinel-navy)]">Selected vendor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <Row label="ID" value={selectedNode.vendorId} />
                <Row label="Name" value={selectedNode.name} />
                <Row
                  label="PAN"
                  value={
                    <span className="font-mono">
                      {selectedNode.pan.substring(0, 3)}XXXXX{selectedNode.pan.substring(8)}
                    </span>
                  }
                />
                <Row label="State" value={selectedNode.stateName || '—'} />
                <Row label="Degree" value={String(selectedNode.degree)} />
                <Row
                  label="Ring"
                  value={
                    selectedNode.isRing ? (
                      <Badge className="bg-red-600 text-white hover:bg-red-600">YES</Badge>
                    ) : (
                      'No'
                    )
                  }
                />
                <Row
                  label="Risk"
                  value={
                    <Badge
                      style={{ background: riskColor(selectedNode.riskScore, selectedNode.isRing), color: 'white' }}
                    >
                      {(selectedNode.riskScore * 100).toFixed(0)}%
                    </Badge>
                  }
                />
              </CardContent>
            </Card>
          )}

          <Card className="border-[var(--sentinel-line)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[var(--sentinel-navy)]">Edge legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {Object.entries(EDGE_META).map(([k, meta]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-6 h-1 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[var(--sentinel-navy-muted)]">{meta.label}</span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-[var(--sentinel-line)] flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#B91C1C' }} />
                <span className="text-[var(--sentinel-navy-muted)]">Part of a detected ring (pulses)</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function byIdIsRing(nodes: PositionedNode[], id: string) {
  return nodes.find((n) => n.id === id)?.isRing ?? false
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--sentinel-navy-muted)]">{label}</span>
      <span className="text-[var(--sentinel-navy)] text-right">{value}</span>
    </div>
  )
}