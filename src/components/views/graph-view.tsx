'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import * as d3 from 'd3'
import {
  motion,
  useReducedMotion,
} from 'framer-motion'

import {
  AlertTriangle,
  Network,
  RotateCcw,
  Search,
  Users,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'
import { useLang } from '@/hooks/use-lang'

/* =========================================================
   TYPES
========================================================= */

interface GraphEvidence {
  sharedPan: boolean
  sharedBank: boolean
  sharedGst: boolean
  commonWorks: number
  relationshipReasons: string[]
}

interface GraphNode {
  id: string
  vendorId: string
  name: string
  group: number
  riskScore: number
  degree: number
  isRing: boolean
  pan: string
  stateName?: string
  projectCount: number
}

interface GraphLink {
  source: string
  target: string
  type: string
  weight: number
  evidence: GraphEvidence
}

interface GraphCluster {
  clusterId: string
  size: number
  isRing: boolean
  vendorNames: string[]
  vendorIds: string[]
  relationshipTypes: string[]
  relationshipCount: number
  riskScore: number
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
  clusters: GraphCluster[]
  rings: GraphCluster[]
  summary: {
    vendorCount: number
    relationshipCount: number
    networkCount: number
    suspiciousNetworkCount: number
    highRiskVendorCount: number
    criticalVendorCount: number
  }
}

/*
 * D3 simulation types.
 *
 * D3 changes link.source/link.target from string
 * into actual simulation nodes after the simulation
 * starts. These types tell TypeScript about that.
 */

type SimNode =
  GraphNode & d3.SimulationNodeDatum

interface SimLink
  extends d3.SimulationLinkDatum<SimNode> {
  type: string
  weight: number
  evidence: GraphEvidence
}

type RiskFilter =
  | 'all'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'

type NetworkFilter =
  | 'all'
  | 'suspicious'
  | 'normal'
  | 'isolated'

type RelationshipFilter =
  | 'all'
  | 'shared_pan'
  | 'shared_bank'
  | 'shared_gst'

/* =========================================================
   CONSTANTS
========================================================= */

const WIDTH = 1000
const HEIGHT = 620

const EDGE_COLORS = {
  shared_pan: '#dc2626',
  shared_bank: '#ea580c',
  shared_gst: '#7c3aed',
}

/* =========================================================
   HELPERS
========================================================= */

function riskLevel(
  score: number
): Exclude<RiskFilter, 'all'> {
  if (score >= 0.8) {
    return 'critical'
  }

  if (score >= 0.6) {
    return 'high'
  }

  if (score >= 0.4) {
    return 'medium'
  }

  return 'low'
}

function riskColor(
  score: number
) {
  if (score >= 0.8) {
    return '#dc2626'
  }

  if (score >= 0.6) {
    return '#ea580c'
  }

  if (score >= 0.4) {
    return '#ca8a04'
  }

  return '#16a34a'
}

function maskPan(
  pan: string
) {
  if (!pan) {
    return '—'
  }

  if (pan.length <= 6) {
    return '••••••'
  }

  return `${pan.slice(
    0,
    3
  )}••••••${pan.slice(-3)}`
}

/*
 * Convert a D3 endpoint back to its vendor ID.
 */
function endpointId(
  endpoint:
    | string
    | number
    | SimNode
) {
  if (
    typeof endpoint ===
    'object'
  ) {
    return endpoint.id
  }

  return String(endpoint)
}

/*
 * Convert a D3 simulation link back
 * into the normal API GraphLink format.
 */
function toGraphLink(
  link: SimLink
): GraphLink {
  return {
    source: endpointId(
      link.source
    ),
    target: endpointId(
      link.target
    ),
    type: link.type,
    weight: link.weight,
    evidence: link.evidence,
  }
}

function makeLinkKey(
  source: string,
  target: string
) {
  return [source, target]
    .sort()
    .join('::')
}

/* =========================================================
   MAIN GRAPH VIEW
========================================================= */

export function GraphView() {
  const { tr } = useLang()

  const reduceMotion =
    useReducedMotion()

  const svgRef =
    useRef<SVGSVGElement | null>(
      null
    )

  const zoomRef =
    useRef<
      d3.ZoomBehavior<
        SVGSVGElement,
        unknown
      > | null
    >(null)

  const simulationRef =
    useRef<
      d3.Simulation<
        SimNode,
        SimLink
      > | null
    >(null)

  const [data, setData] =
    useState<GraphData | null>(
      null
    )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(
      null
    )

  const [search, setSearch] =
    useState('')

  const [riskFilter, setRiskFilter] =
    useState<RiskFilter>('all')

  const [
    relationshipFilter,
    setRelationshipFilter,
  ] =
    useState<RelationshipFilter>(
      'all'
    )

  const [
    networkFilter,
    setNetworkFilter,
  ] =
    useState<NetworkFilter>('all')

  const [stateFilter, setStateFilter] =
    useState('all')

  const [
    selectedNode,
    setSelectedNode,
  ] =
    useState<GraphNode | null>(
      null
    )

  const [
    selectedLink,
    setSelectedLink,
  ] =
    useState<GraphLink | null>(
      null
    )

  const [
    hoveredNode,
    setHoveredNode,
  ] =
    useState<GraphNode | null>(
      null
    )

  const [zoomLevel, setZoomLevel] =
    useState(1)

  /* =======================================================
     LOAD GRAPH
  ======================================================= */

  const loadGraph =
    useCallback(async () => {
      try {
        setLoading(true)
        setError(null)

        const response =
          await fetch(
            '/api/graph',
            {
              cache: 'no-store',
            }
          )

        if (!response.ok) {
          throw new Error(
            'Unable to load vendor network.'
          )
        }

        const result =
          (await response.json()) as GraphData

        if (
          !result ||
          !Array.isArray(
            result.nodes
          ) ||
          !Array.isArray(
            result.links
          )
        ) {
          throw new Error(
            'Invalid graph response.'
          )
        }

        setData(result)
      } catch (err) {
        console.error(
          'Graph loading error:',
          err
        )

        setError(
          'Unable to load vendor network.'
        )
      } finally {
        setLoading(false)
      }
    }, [])

  useEffect(() => {
    void loadGraph()
  }, [loadGraph])

  /* =======================================================
     ESCAPE = CLEAR SELECTION
  ======================================================= */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (
        event.key === 'Escape'
      ) {
        setSelectedNode(null)
        setSelectedLink(null)
        setHoveredNode(null)
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown
    )

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      )
    }
  }, [])

  /* =======================================================
     STATES
  ======================================================= */

  const states = useMemo(() => {
    if (!data) {
      return []
    }

    return Array.from(
      new Set(
        data.nodes
          .map(
            (node) =>
              node.stateName
          )
          .filter(
            (
              state
            ): state is string =>
              Boolean(state)
          )
      )
    ).sort()
  }, [data])

  /* =======================================================
     FILTER NODES
  ======================================================= */

  const filteredNodes =
    useMemo(() => {
      if (!data) {
        return []
      }

      const query =
        search
          .trim()
          .toLowerCase()

      return data.nodes.filter(
        (node) => {
          const matchesSearch =
            !query ||
            node.name
              .toLowerCase()
              .includes(query) ||
            node.vendorId
              .toLowerCase()
              .includes(query)

          const matchesRisk =
            riskFilter === 'all' ||
            riskLevel(
              node.riskScore
            ) === riskFilter

          const matchesState =
            stateFilter === 'all' ||
            node.stateName ===
              stateFilter

          const isolated =
            node.degree === 0

          const suspicious =
            node.isRing ||
            node.riskScore >= 0.6

          const matchesNetwork =
            networkFilter ===
              'all' ||
            (networkFilter ===
              'suspicious' &&
              suspicious) ||
            (networkFilter ===
              'normal' &&
              !suspicious &&
              !isolated) ||
            (networkFilter ===
              'isolated' &&
              isolated)

          return (
            matchesSearch &&
            matchesRisk &&
            matchesState &&
            matchesNetwork
          )
        }
      )
    }, [
      data,
      search,
      riskFilter,
      stateFilter,
      networkFilter,
    ])

  const filteredNodeIds =
    useMemo(
      () =>
        new Set(
          filteredNodes.map(
            (node) => node.id
          )
        ),
      [filteredNodes]
    )

  /* =======================================================
     FILTER LINKS
  ======================================================= */

  const filteredLinks =
    useMemo(() => {
      if (!data) {
        return []
      }

      return data.links.filter(
        (link) => {
          if (
            !filteredNodeIds.has(
              link.source
            ) ||
            !filteredNodeIds.has(
              link.target
            )
          ) {
            return false
          }

          if (
            relationshipFilter ===
            'all'
          ) {
            return true
          }

          if (
            relationshipFilter ===
            'shared_pan'
          ) {
            return link.evidence
              .sharedPan
          }

          if (
            relationshipFilter ===
            'shared_bank'
          ) {
            return link.evidence
              .sharedBank
          }

          if (
            relationshipFilter ===
            'shared_gst'
          ) {
            return link.evidence
              .sharedGst
          }

          return true
        }
      )
    }, [
      data,
      filteredNodeIds,
      relationshipFilter,
    ])

  /* =======================================================
     SELECTED NODE NEIGHBOURS
  ======================================================= */

  const selectedNeighbourIds =
    useMemo(() => {
      const ids =
        new Set<string>()

      if (
        !selectedNode ||
        !data
      ) {
        return ids
      }

      ids.add(
        selectedNode.id
      )

      for (const link of data.links) {
        if (
          link.source ===
          selectedNode.id
        ) {
          ids.add(
            link.target
          )
        }

        if (
          link.target ===
          selectedNode.id
        ) {
          ids.add(
            link.source
          )
        }
      }

      return ids
    }, [selectedNode, data])

  /* =======================================================
     D3 GRAPH
  ======================================================= */

  useEffect(() => {
    const svgElement =
      svgRef.current

    if (
      !svgElement ||
      filteredNodes.length === 0
    ) {
      return
    }

    const svg =
      d3.select(
        svgElement
      )

    svg.selectAll('*').remove()

    const root =
      svg
        .append('g')
        .attr(
          'class',
          'graph-root'
        )

    const linkLayer =
      root
        .append('g')
        .attr(
          'class',
          'graph-links'
        )

    const nodeLayer =
      root
        .append('g')
        .attr(
          'class',
          'graph-nodes'
        )

    /* -----------------------------------------------
       Simulation data
    ------------------------------------------------ */

    const simulationNodes: SimNode[] =
      filteredNodes.map(
        (node) => ({
          ...node,
        })
      )

    const simulationLinks: SimLink[] =
      filteredLinks.map(
        (link) => ({
          source: link.source,
          target: link.target,
          type: link.type,
          weight: link.weight,
          evidence:
            link.evidence,
        })
      )

    /* -----------------------------------------------
       Force simulation
    ------------------------------------------------ */

    const simulation =
      d3
        .forceSimulation<SimNode>(
          simulationNodes
        )
        .force(
          'link',
          d3
            .forceLink<
              SimNode,
              SimLink
            >(
              simulationLinks
            )
            .id(
              (node) =>
                node.id
            )
            .distance(120)
            .strength(0.65)
        )
        .force(
          'charge',
          d3
            .forceManyBody()
            .strength(-330)
        )
        .force(
          'center',
          d3.forceCenter(
            WIDTH / 2,
            HEIGHT / 2
          )
        )
        .force(
          'collision',
          d3
            .forceCollide()
            .radius(30)
        )

    simulationRef.current =
      simulation

    if (reduceMotion) {
      simulation.alphaDecay(
        0.3
      )
    }

    /* -----------------------------------------------
       LINKS
    ------------------------------------------------ */

    const links =
      linkLayer
        .selectAll<
          SVGLineElement,
          SimLink
        >('line')
        .data(
          simulationLinks
        )
        .enter()
        .append('line')
        .attr(
          'stroke',
          (link) => {
            if (
              link.evidence
                .sharedPan
            ) {
              return EDGE_COLORS
                .shared_pan
            }

            if (
              link.evidence
                .sharedBank
            ) {
              return EDGE_COLORS
                .shared_bank
            }

            return EDGE_COLORS
              .shared_gst
          }
        )
        .attr(
          'stroke-width',
          (link) =>
            Math.min(
              3,
              1 +
                link.weight *
                  0.5
            )
        )
        .attr(
          'stroke-opacity',
          0.45
        )
        .attr(
          'cursor',
          'pointer'
        )

    /* -----------------------------------------------
       NODES
    ------------------------------------------------ */

    const nodes =
      nodeLayer
        .selectAll<
          SVGGElement,
          SimNode
        >('g')
        .data(
          simulationNodes
        )
        .enter()
        .append('g')
        .attr(
          'cursor',
          'pointer'
        )

    /* -----------------------------------------------
       NODE CIRCLES
    ------------------------------------------------ */

    nodes
      .append('circle')
      .attr(
        'r',
        (node) =>
          Math.min(
            18,
            8 +
              node.degree *
                1.3
          )
      )
      .attr(
        'fill',
        (node) =>
          riskColor(
            node.riskScore
          )
      )
      .attr(
        'stroke',
        (node) =>
          node.isRing
            ? '#991b1b'
            : '#ffffff'
      )
      .attr(
        'stroke-width',
        (node) =>
          node.isRing ? 3 : 2
      )

    /* -----------------------------------------------
       IMPORTANT NODE LABELS
    ------------------------------------------------ */

    nodes
      .filter(
        (node) =>
          node.isRing ||
          node.riskScore >=
            0.6 ||
          node.degree >= 3
      )
      .append('text')
      .text(
        (node) =>
          node.name.length >
          18
            ? `${node.name.slice(
                0,
                18
              )}…`
            : node.name
      )
      .attr(
        'x',
        20
      )
      .attr(
        'y',
        4
      )
      .attr(
        'font-size',
        11
      )
      .attr(
        'font-weight',
        500
      )
      .attr(
        'fill',
        'currentColor'
      )
      .attr(
        'pointer-events',
        'none'
      )

    /* -----------------------------------------------
       CYCLE LABEL
    ------------------------------------------------ */

    nodes
      .filter(
        (node) =>
          node.isRing
      )
      .append('text')
      .text('CYCLE')
      .attr(
        'x',
        0
      )
      .attr(
        'y',
        -22
      )
      .attr(
        'text-anchor',
        'middle'
      )
      .attr(
        'font-size',
        8
      )
      .attr(
        'font-weight',
        700
      )
      .attr(
        'fill',
        '#dc2626'
      )
      .attr(
        'pointer-events',
        'none'
      )

    /* -----------------------------------------------
       NODE CLICK
    ------------------------------------------------ */

    nodes.on(
      'click',
      (
        event,
        node
      ) => {
        event.stopPropagation()

        setSelectedNode(
          node
        )

        setSelectedLink(
          null
        )
      }
    )

    /* -----------------------------------------------
       NODE HOVER
    ------------------------------------------------ */

    nodes.on(
      'mouseenter',
      (_, node) => {
        setHoveredNode(
          node
        )
      }
    )

    nodes.on(
      'mouseleave',
      () => {
        setHoveredNode(
          null
        )
      }
    )

    /* -----------------------------------------------
       KEYBOARD NODE ACCESSIBILITY
    ------------------------------------------------ */

    nodes
      .attr(
        'tabindex',
        0
      )
      .attr(
        'role',
        'button'
      )
      .attr(
        'aria-label',
        (node) =>
          `${node.name}, risk ${Math.round(
            node.riskScore * 100
          )} percent, ${node.degree} connections`
      )

    nodes.on(
      'keydown',
      (
        event,
        node
      ) => {
        if (
          event.key ===
            'Enter' ||
          event.key ===
            ' '
        ) {
          event.preventDefault()

          setSelectedNode(
            node
          )

          setSelectedLink(
            null
          )
        }
      }
    )

    /* -----------------------------------------------
       LINK CLICK
    ------------------------------------------------ */

    links.on(
      'click',
      (
        event,
        link
      ) => {
        event.stopPropagation()

        setSelectedLink(
          toGraphLink(
            link
          )
        )

        setSelectedNode(
          null
        )
      }
    )

    /* -----------------------------------------------
       LINK HOVER
    ------------------------------------------------ */

    links.on(
      'mouseenter',
      function () {
        d3.select(this)
          .attr(
            'stroke-opacity',
            0.95
          )
          .attr(
            'stroke-width',
            3
          )
      }
    )

    links.on(
      'mouseleave',
      function (
        _event,
        link
      ) {
        const selected =
          selectedLink
            ? makeLinkKey(
                selectedLink.source,
                selectedLink.target
              ) ===
              makeLinkKey(
                endpointId(
                  link.source
                ),
                endpointId(
                  link.target
                )
              )
            : false

        d3.select(this)
          .attr(
            'stroke-opacity',
            selected
              ? 1
              : 0.45
          )
          .attr(
            'stroke-width',
            selected
              ? 4
              : Math.min(
                  3,
                  1 +
                    link.weight *
                      0.5
                )
          )
      }
    )

    /* -----------------------------------------------
       HIGHLIGHTING
    ------------------------------------------------ */

    const selectedLinkKey =
      selectedLink
        ? makeLinkKey(
            selectedLink.source,
            selectedLink.target
          )
        : null

    nodes.attr(
      'opacity',
      (node) => {
        if (!selectedNode) {
          return 1
        }

        return selectedNeighbourIds.has(
          node.id
        )
          ? 1
          : 0.14
      }
    )

    links
      .attr(
        'stroke-opacity',
        (link) => {
          const key =
            makeLinkKey(
              endpointId(
                link.source
              ),
              endpointId(
                link.target
              )
            )

          if (
            selectedLinkKey ===
            key
          ) {
            return 1
          }

          if (!selectedNode) {
            return 0.45
          }

          const source =
            endpointId(
              link.source
            )

          const target =
            endpointId(
              link.target
            )

          return source ===
              selectedNode.id ||
            target ===
              selectedNode.id
            ? 0.9
            : 0.08
        }
      )
      .attr(
        'stroke-width',
        (link) => {
          const key =
            makeLinkKey(
              endpointId(
                link.source
              ),
              endpointId(
                link.target
              )
            )

          return key ===
            selectedLinkKey
            ? 4
            : Math.min(
                3,
                1 +
                  link.weight *
                    0.5
              )
        }
      )

    /* -----------------------------------------------
       ZOOM
    ------------------------------------------------ */

    const zoom =
      d3
        .zoom<
          SVGSVGElement,
          unknown
        >()
        .scaleExtent([
          0.35,
          3,
        ])
        .on(
          'zoom',
          (event) => {
            root.attr(
              'transform',
              event.transform
            )

            setZoomLevel(
              event.transform.k
            )
          }
        )

    zoomRef.current =
      zoom

    svg.call(zoom)

    /* -----------------------------------------------
       BACKGROUND CLICK
    ------------------------------------------------ */

    svg.on(
      'click',
      () => {
        setSelectedNode(
          null
        )

        setSelectedLink(
          null
        )
      }
    )

    /* -----------------------------------------------
       DRAG
    ------------------------------------------------ */

    nodes.call(
      d3
        .drag<
          SVGGElement,
          SimNode
        >()
        .on(
          'start',
          (
            event,
            node
          ) => {
            if (
              !event.active
            ) {
              simulation
                .alphaTarget(
                  0.25
                )
                .restart()
            }

            node.fx =
              node.x

            node.fy =
              node.y
          }
        )
        .on(
          'drag',
          (
            event,
            node
          ) => {
            node.fx =
              event.x

            node.fy =
              event.y
          }
        )
        .on(
          'end',
          (
            event,
            node
          ) => {
            if (
              !event.active
            ) {
              simulation.alphaTarget(
                0
              )
            }

            node.fx =
              null

            node.fy =
              null
          }
        )
    )

    /* -----------------------------------------------
       TICK
    ------------------------------------------------ */

    simulation.on(
      'tick',
      () => {
        links
          .attr(
            'x1',
            (link) =>
              typeof link.source ===
              'object'
                ? link.source.x ??
                  0
                : 0
          )
          .attr(
            'y1',
            (link) =>
              typeof link.source ===
              'object'
                ? link.source.y ??
                  0
                : 0
          )
          .attr(
            'x2',
            (link) =>
              typeof link.target ===
              'object'
                ? link.target.x ??
                  0
                : 0
          )
          .attr(
            'y2',
            (link) =>
              typeof link.target ===
              'object'
                ? link.target.y ??
                  0
                : 0
          )

        nodes.attr(
          'transform',
          (node) =>
            `translate(${
              node.x ??
              WIDTH / 2
            },${
              node.y ??
              HEIGHT / 2
            })`
        )
      }
    )

    return () => {
      simulation.stop()

      simulationRef.current =
        null
    }
  }, [
    filteredNodes,
    filteredLinks,
    selectedNode,
    selectedLink,
    selectedNeighbourIds,
    reduceMotion,
  ])

  /* =======================================================
     ZOOM CONTROLS
  ======================================================= */

  const resetView =
    useCallback(() => {
      if (
        !svgRef.current ||
        !zoomRef.current
      ) {
        return
      }

      d3.select(
        svgRef.current
      )
        .transition()
        .duration(
          reduceMotion
            ? 0
            : 300
        )
        .call(
          zoomRef.current.transform,
          d3.zoomIdentity
        )
    }, [reduceMotion])

  const changeZoom =
    useCallback(
      (amount: number) => {
        if (
          !svgRef.current ||
          !zoomRef.current
        ) {
          return
        }

        d3.select(
          svgRef.current
        )
          .transition()
          .duration(
            reduceMotion
              ? 0
              : 200
          )
          .call(
            zoomRef.current.scaleBy,
            amount
          )
      },
      [reduceMotion]
    )

  /* =======================================================
     RESET FILTERS
  ======================================================= */

  const resetFilters =
    () => {
      setSearch('')
      setRiskFilter('all')
      setRelationshipFilter(
        'all'
      )
      setNetworkFilter(
        'all'
      )
      setStateFilter('all')

      setSelectedNode(
        null
      )

      setSelectedLink(
        null
      )
    }

  /* =======================================================
     NETWORK FOCUS
  ======================================================= */

  const focusNetwork =
    useCallback(
      (
        cluster: GraphCluster
      ) => {
        if (!data) {
          return
        }

        const firstNode =
          data.nodes.find(
            (node) =>
              cluster.vendorIds.includes(
                node.id
              )
          )

        if (!firstNode) {
          return
        }

        setSelectedNode(
          firstNode
        )

        setSelectedLink(
          null
        )

        setSearch('')
      },
      [data]
    )

  /* =======================================================
     LOADING STATE
  ======================================================= */

  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">
            Vendor Network
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Loading vendor relationships...
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            1,
            2,
            3,
            4,
          ].map(
            (item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-lg border bg-muted/40"
              />
            )
          )}
        </div>

        <div className="h-[560px] animate-pulse rounded-lg border bg-muted/30" />
      </div>
    )
  }

  /* =======================================================
     ERROR STATE
  ======================================================= */

  if (error) {
    return (
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <AlertTriangle className="mb-4 h-10 w-10 text-red-500" />

          <h2 className="font-semibold">
            Unable to load vendor network
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            {error}
          </p>

          <button
            onClick={() =>
              void loadGraph()
            }
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  /* =======================================================
     EMPTY STATE
  ======================================================= */

  if (data.nodes.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[420px] flex-col items-center justify-center text-center">
          <Network className="mb-4 h-10 w-10 text-muted-foreground" />

          <h2 className="font-semibold">
            No vendor relationships found
          </h2>

          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Relationships will appear when vendors
            share supported identifiers or other
            database relationships.
          </p>
        </CardContent>
      </Card>
    )
  }

  /* =======================================================
     MAIN UI
  ======================================================= */

  return (
    <div className="space-y-5">
      {/* HEADER */}

      <motion.div
        initial={
          reduceMotion
            ? false
            : {
                opacity: 0,
                y: 8,
              }
        }
        animate={{
          opacity: 1,
          y: 0,
        }}
      >
        <h1 className="text-2xl font-bold">
          Vendor Network
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Explore vendor relationships and
          identify networks that may require
          investigation.
        </p>
      </motion.div>

      {/* FILTERS */}

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search vendor name or ID..."
                className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                aria-label="Search vendors"
              />
            </div>

            <select
              value={riskFilter}
              onChange={(event) =>
                setRiskFilter(
                  event.target
                    .value as RiskFilter
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              aria-label="Risk filter"
            >
              <option value="all">
                All risks
              </option>

              <option value="low">
                Low
              </option>

              <option value="medium">
                Medium
              </option>

              <option value="high">
                High
              </option>

              <option value="critical">
                Critical
              </option>
            </select>

            <select
              value={
                relationshipFilter
              }
              onChange={(event) =>
                setRelationshipFilter(
                  event.target
                    .value as RelationshipFilter
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              aria-label="Relationship filter"
            >
              <option value="all">
                All relationships
              </option>

              <option value="shared_pan">
                Shared PAN
              </option>

              <option value="shared_bank">
                Shared Bank
              </option>

              <option value="shared_gst">
                Shared GST
              </option>
            </select>

            <select
              value={networkFilter}
              onChange={(event) =>
                setNetworkFilter(
                  event.target
                    .value as NetworkFilter
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              aria-label="Network filter"
            >
              <option value="all">
                All networks
              </option>

              <option value="suspicious">
                Networks of Interest
              </option>

              <option value="normal">
                Normal networks
              </option>

              <option value="isolated">
                Isolated vendors
              </option>
            </select>

            <select
              value={stateFilter}
              onChange={(event) =>
                setStateFilter(
                  event.target.value
                )
              }
              className="h-10 rounded-md border bg-background px-3 text-sm"
              aria-label="State filter"
            >
              <option value="all">
                All states
              </option>

              {states.map(
                (state) => (
                  <option
                    key={state}
                    value={state}
                  >
                    {state}
                  </option>
                )
              )}
            </select>

            <button
              onClick={
                resetFilters
              }
              className="flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
              title="Reset filters"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </CardContent>
      </Card>

      {/* SUMMARY */}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={
            <Users className="h-4 w-4" />
          }
          label="Vendors"
          value={
            filteredNodes.length
          }
        />

        <SummaryCard
          icon={
            <Network className="h-4 w-4" />
          }
          label="Relationships"
          value={
            filteredLinks.length
          }
        />

        <SummaryCard
          icon={
            <Network className="h-4 w-4" />
          }
          label="Networks"
          value={
            data.summary.networkCount
          }
        />

        <SummaryCard
          icon={
            <AlertTriangle className="h-4 w-4" />
          }
          label="Networks of Interest"
          value={
            data.summary
              .suspiciousNetworkCount
          }
        />
      </div>

      {/* GRAPH + PANEL */}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
        <Card className="overflow-hidden">
          <CardContent className="relative p-0">
            {/* ZOOM CONTROLS */}

            <div className="absolute left-3 top-3 z-10 rounded-md border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
              {Math.round(
                zoomLevel * 100
              )}
              %
            </div>

            <div className="absolute right-3 top-3 z-10 flex gap-1">
              <GraphButton
                label="Zoom in"
                onClick={() =>
                  changeZoom(1.2)
                }
              >
                <ZoomIn className="h-4 w-4" />
              </GraphButton>

              <GraphButton
                label="Zoom out"
                onClick={() =>
                  changeZoom(0.8)
                }
              >
                <ZoomOut className="h-4 w-4" />
              </GraphButton>

              <GraphButton
                label="Reset view"
                onClick={
                  resetView
                }
              >
                <RotateCcw className="h-4 w-4" />
              </GraphButton>
            </div>

            {filteredNodes.length ===
            0 ? (
              <div className="flex h-[560px] flex-col items-center justify-center text-center">
                <Search className="mb-3 h-8 w-8 text-muted-foreground" />

                <p className="font-medium">
                  No vendors match the filters
                </p>

                <button
                  onClick={
                    resetFilters
                  }
                  className="mt-3 text-sm text-primary underline"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-[560px] w-full bg-slate-50 dark:bg-slate-950"
                role="img"
                aria-label="Interactive vendor relationship graph"
              />
            )}

            {/* TOOLTIP */}

            {hoveredNode && (
              <div className="pointer-events-none absolute bottom-14 left-4 z-20 max-w-xs rounded-lg border bg-background/95 p-3 shadow-lg">
                <div className="font-semibold">
                  {hoveredNode.name}
                </div>

                <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                  <div>
                    Risk:{' '}
                    {Math.round(
                      hoveredNode.riskScore *
                        100
                    )}
                    %
                  </div>

                  <div>
                    Connections:{' '}
                    {
                      hoveredNode.degree
                    }
                  </div>

                  <div>
                    Projects:{' '}
                    {
                      hoveredNode.projectCount
                    }
                  </div>

                  <div>
                    State:{' '}
                    {hoveredNode.stateName ||
                      '—'}
                  </div>
                </div>
              </div>
            )}

            {/* LEGEND */}

            <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-xs text-muted-foreground">
              <Legend
                color={
                  EDGE_COLORS.shared_pan
                }
                label="Shared PAN"
              />

              <Legend
                color={
                  EDGE_COLORS.shared_bank
                }
                label="Shared Bank"
              />

              <Legend
                color={
                  EDGE_COLORS.shared_gst
                }
                label="Shared GST"
              />

              <Legend
                color="#16a34a"
                label="Low"
              />

              <Legend
                color="#ca8a04"
                label="Medium"
              />

              <Legend
                color="#ea580c"
                label="High"
              />

              <Legend
                color="#dc2626"
                label="Critical"
              />
            </div>
          </CardContent>
        </Card>

        {/* RIGHT PANEL */}

        <div className="space-y-4">
          {selectedNode ? (
            <VendorPanel
              node={selectedNode}
              links={
                data.links
              }
              nodes={
                data.nodes
              }
              onClose={() =>
                setSelectedNode(
                  null
                )
              }
            />
          ) : selectedLink ? (
            <RelationshipPanel
              link={selectedLink}
              nodes={
                data.nodes
              }
              onClose={() =>
                setSelectedLink(
                  null
                )
              }
            />
          ) : (
            <NetworksPanel
              clusters={
                data.clusters
              }
              onSelect={
                focusNetwork
              }
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Graph interpretation
              </CardTitle>
            </CardHeader>

            <CardContent className="text-xs leading-5 text-muted-foreground">
              A relationship represents evidence
              derived from available database records.
              A detected cycle or network is an
              investigation signal and does not by
              itself establish fraud or collusion.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 6,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            {icon}

            <span className="text-xs">
              {label}
            </span>
          </div>

          <div className="mt-2 text-2xl font-bold">
            {value}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* =========================================================
   GRAPH BUTTON
========================================================= */

function GraphButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md border bg-background p-2 shadow-sm hover:bg-muted"
    >
      {children}
    </button>
  )
}

/* =========================================================
   VENDOR PANEL
========================================================= */

function VendorPanel({
  node,
  links,
  nodes,
  onClose,
}: {
  node: GraphNode
  links: GraphLink[]
  nodes: GraphNode[]
  onClose: () => void
}) {
  const relationships =
    links.filter(
      (link) =>
        link.source === node.id ||
        link.target === node.id
    )

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 12,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-sm">
                {node.name}
              </CardTitle>

              <p className="mt-1 text-xs text-muted-foreground">
                {node.vendorId}
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="Close vendor details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Info
              label="Risk"
              value={
                <Badge
                  style={{
                    background:
                      riskColor(
                        node.riskScore
                      ),
                    color: 'white',
                  }}
                >
                  {Math.round(
                    node.riskScore *
                      100
                  )}
                  % ·{' '}
                  {riskLevel(
                    node.riskScore
                  )}
                </Badge>
              }
            />

            <Info
              label="State"
              value={
                node.stateName ||
                '—'
              }
            />

            <Info
              label="Projects"
              value={String(
                node.projectCount
              )}
            />

            <Info
              label="Connections"
              value={String(
                node.degree
              )}
            />
          </div>

          <div>
            <div className="mb-1 text-muted-foreground">
              PAN
            </div>

            <div className="font-mono">
              {maskPan(
                node.pan
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 font-medium">
              Relationship Evidence
            </div>

            {relationships.length ===
            0 ? (
              <p className="text-muted-foreground">
                No direct relationships.
              </p>
            ) : (
              <div className="space-y-2">
                {relationships.map(
                  (
                    link,
                    index
                  ) => {
                    const otherId =
                      link.source ===
                      node.id
                        ? link.target
                        : link.source

                    const other =
                      nodes.find(
                        (
                          item
                        ) =>
                          item.id ===
                          otherId
                      )

                    return (
                      <div
                        key={`${link.source}-${link.target}-${index}`}
                        className="rounded-md border p-2"
                      >
                        <div className="font-medium">
                          {link.evidence.relationshipReasons.join(
                            ' • '
                          )}
                        </div>

                        <div className="mt-1 text-muted-foreground">
                          Connected to:{' '}
                          {other?.name ||
                            otherId}
                        </div>
                      </div>
                    )
                  }
                )}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-muted-foreground">
              Network signal
            </div>

            {node.isRing ? (
              <Badge variant="destructive">
                Detected Cycle
              </Badge>
            ) : (
              <span>
                No cycle detected
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* =========================================================
   RELATIONSHIP PANEL
========================================================= */

function RelationshipPanel({
  link,
  nodes,
  onClose,
}: {
  link: GraphLink
  nodes: GraphNode[]
  onClose: () => void
}) {
  const source =
    nodes.find(
      (node) =>
        node.id === link.source
    )

  const target =
    nodes.find(
      (node) =>
        node.id === link.target
    )

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 12,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm">
              Relationship Evidence
            </CardTitle>

            <button
              onClick={onClose}
              className="rounded-md p-1 hover:bg-muted"
              aria-label="Close relationship details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-xs">
          <Info
            label="Vendor A"
            value={
              source?.name ||
              link.source
            }
          />

          <Info
            label="Vendor B"
            value={
              target?.name ||
              link.target
            }
          />

          <div>
            <div className="mb-2 text-muted-foreground">
              Why are they connected?
            </div>

            <div className="space-y-2">
              {link.evidence.relationshipReasons.map(
                (reason) => (
                  <div
                    key={reason}
                    className="rounded-md border p-2"
                  >
                    {reason}
                  </div>
                )
              )}
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 leading-5">
            This relationship is derived from
            available database records. It is an
            investigation signal, not proof of fraud.
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* =========================================================
   NETWORKS PANEL
========================================================= */

function NetworksPanel({
  clusters,
  onSelect,
}: {
  clusters: GraphCluster[]
  onSelect: (
    cluster: GraphCluster
  ) => void
}) {
  const networks =
    clusters
      .filter(
        (cluster) =>
          cluster.isRing ||
          cluster.riskScore >=
            0.6
      )
      .sort(
        (a, b) =>
          b.riskScore -
          a.riskScore
      )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Network className="h-4 w-4" />
          Networks of Interest
        </CardTitle>
      </CardHeader>

      <CardContent>
        {networks.length ===
        0 ? (
          <p className="text-xs text-muted-foreground">
            No networks currently meet the
            investigation threshold.
          </p>
        ) : (
          <div className="space-y-3">
            {networks.map(
              (network) => (
                <button
                  key={
                    network.clusterId
                  }
                  onClick={() =>
                    onSelect(
                      network
                    )
                  }
                  className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        network.isRing
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {
                        network.clusterId
                      }
                    </Badge>

                    {network.isRing && (
                      <span className="text-[10px] font-semibold text-red-600">
                        CYCLE
                      </span>
                    )}
                  </div>

                  <div className="mt-2 font-medium">
                    {network.size}{' '}
                    vendors
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground">
                    {
                      network.relationshipCount
                    }{' '}
                    relationships
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {network.relationshipTypes.map(
                      (type) => (
                        <Badge
                          key={type}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {type}
                        </Badge>
                      )
                    )}
                  </div>

                  <div className="mt-2 text-xs">
                    Network risk:{' '}
                    <strong>
                      {Math.round(
                        network.riskScore *
                          100
                      )}
                      %
                    </strong>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    {network.vendorNames
                      .slice(0, 3)
                      .join(' • ')}

                    {network
                      .vendorNames
                      .length >
                      3 &&
                      ' • …'}
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* =========================================================
   INFO
========================================================= */

function Info({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div>
      <div className="text-muted-foreground">
        {label}
      </div>

      <div className="mt-1 font-medium">
        {value}
      </div>
    </div>
  )
}

/* =========================================================
   LEGEND
========================================================= */

function Legend({
  color,
  label,
}: {
  color: string
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{
          background: color,
        }}
      />

      {label}
    </div>
  )
}