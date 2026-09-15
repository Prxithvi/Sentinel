// Graph view — vendor network with ring highlighting
'use client'
import { useState, useRef } from 'react'
import { useAsyncEffect } from '@/hooks/use-async-effect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Network } from 'lucide-react'
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

const EDGE_COLORS: Record<string, string> = {
  shared_pan: '#dc2626',
  shared_bank: '#ea580c',
  co_located: '#0891b2',
  same_work: '#7c3aed',
}

export function GraphView() {
  const { tr } = useLang()
  const [data, setData] = useState<GraphData | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useAsyncEffect(async () => {
    const data = await fetch('/api/graph').then(r => r.json())
    setData(data)
  }, [])

  // Compute layout — circular arrangement grouped by cluster
  const layout = (() => {
    if (!data) return { nodes: [], links: [] }
    const clusters = new Map<number, GraphNode[]>()
    for (const n of data.nodes) {
      if (!clusters.has(n.group)) clusters.set(n.group, [])
      clusters.get(n.group)!.push(n)
    }
    // Place each cluster in a different sector
    const W = 800, H = 500
    const cx = W / 2, cy = H / 2
    const positioned: Record<string, { x: number; y: number }> = {}
    const clusterArr = Array.from(clusters.entries())
    const clusterCount = clusterArr.length
    clusterArr.forEach(([, nodes], ci) => {
      const clusterAngle = (ci / clusterCount) * 2 * Math.PI
      const clusterRadius = nodes.length > 1 ? 60 : 0
      const clusterCx = cx + Math.cos(clusterAngle) * 150
      const clusterCy = cy + Math.sin(clusterAngle) * 150
      if (nodes.length === 1) {
        positioned[nodes[0].id] = { x: clusterCx, y: clusterCy }
      } else {
        nodes.forEach((n, i) => {
          const angle = (i / nodes.length) * 2 * Math.PI
          positioned[n.id] = {
            x: clusterCx + Math.cos(angle) * clusterRadius,
            y: clusterCy + Math.sin(angle) * clusterRadius,
          }
        })
      }
    })
    const links = data.links.map(l => ({
      ...l,
      x1: positioned[l.source]?.x || 0,
      y1: positioned[l.source]?.y || 0,
      x2: positioned[l.target]?.x || 0,
      y2: positioned[l.target]?.y || 0,
    }))
    return { nodes: data.nodes.map(n => ({ ...n, ...positioned[n.id] })), links }
  })()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{tr('graph_title')}</h1>
        <p className="text-sm text-muted-foreground">Vendor relationships via shared PAN / bank / co-location. Ring clusters highlighted in red.</p>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <Card className="lg:col-span-3">
          <CardContent className="p-4">
            {!data ? (
              <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <svg ref={svgRef} viewBox="0 0 800 500" className="w-full h-auto bg-slate-50 rounded">
                {/* Edges */}
                {layout.links.map((l, i) => (
                  <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                    stroke={EDGE_COLORS[l.type] || '#94a3b8'}
                    strokeWidth={l.weight * 2}
                    strokeOpacity={0.6} />
                ))}
                {/* Nodes */}
                {layout.nodes.map(n => (
                  <g key={n.id} transform={`translate(${n.x}, ${n.y})`}
                    className="cursor-pointer"
                    onClick={() => setSelectedNode(n)}>
                    <circle r={n.isRing ? 14 : 8 + n.degree * 1.5}
                      fill={n.isRing ? '#dc2626' : n.riskScore > 0.5 ? '#ea580c' : '#16a34a'}
                      stroke={selectedNode?.id === n.id ? '#0f172a' : 'white'}
                      strokeWidth={selectedNode?.id === n.id ? 3 : 1} />
                    <text y={-15} textAnchor="middle" className="text-[9px] fill-slate-700 pointer-events-none">
                      {n.name.substring(0, 12)}
                    </text>
                    {n.isRing && (
                      <text y={-25} textAnchor="middle" className="text-[8px] fill-red-600 font-bold pointer-events-none">RING</text>
                    )}
                  </g>
                ))}
              </svg>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Network className="w-4 h-4" /> Detected Rings</CardTitle></CardHeader>
            <CardContent>
              {data?.rings.length ? (
                <div className="space-y-3">
                  {data.rings.map(r => (
                    <div key={r.clusterId} className="border-l-2 border-red-500 pl-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-600 text-white text-xs">{r.clusterId}</Badge>
                        <span className="text-xs font-semibold">Ring of {r.size}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {r.vendorNames.map(n => n.substring(0, 18)).join(' • ')}
                      </div>
                      <div className="text-xs text-red-700 mt-1">Risk score: {(r.riskScore * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-xs text-muted-foreground">No rings detected</div>}
            </CardContent>
          </Card>

          {selectedNode && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Selected Vendor</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div><span className="text-muted-foreground">ID:</span> {selectedNode.vendorId}</div>
                <div><span className="text-muted-foreground">Name:</span> {selectedNode.name}</div>
                <div><span className="text-muted-foreground">PAN:</span> <span className="font-mono">{selectedNode.pan.substring(0, 3)}XXXXX{selectedNode.pan.substring(8)}</span></div>
                <div><span className="text-muted-foreground">State:</span> {selectedNode.stateName || '—'}</div>
                <div><span className="text-muted-foreground">Degree:</span> {selectedNode.degree}</div>
                <div><span className="text-muted-foreground">Ring:</span> {selectedNode.isRing ? <Badge className="bg-red-600 text-white ml-1">YES</Badge> : 'No'}</div>
                <div><span className="text-muted-foreground">Risk:</span> <Badge style={{ background: selectedNode.riskScore > 0.5 ? '#ea580c' : '#16a34a', color: 'white' }}>{(selectedNode.riskScore * 100).toFixed(0)}%</Badge></div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Edge Legend</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {Object.entries(EDGE_COLORS).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-6 h-1" style={{ background: v }} />
                  <span className="capitalize">{k.replace('_', ' ')}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
