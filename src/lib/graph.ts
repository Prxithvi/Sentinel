// Graph engine — vendor network analysis, Louvain-style community detection, ring detection
import { db } from './db';

export interface GraphData {
  nodes: GraphNodeData[];
  links: GraphLinkData[];
  clusters: GraphClusterData[];
}

export interface GraphNodeData {
  id: string;
  vendorId: string;
  name: string;
  group: number;
  riskScore: number;
  degree: number;
  isRing: boolean;
  pan: string;
  stateName?: string;
}

export interface GraphLinkData {
  source: string;
  target: string;
  type: string;
  weight: number;
}

export interface GraphClusterData {
  clusterId: string;
  size: number;
  isRing: boolean;
  vendorNames: string[];
  riskScore: number;
}

// Union-Find for connected components
class UnionFind {
  parent: Map<string, string> = new Map();
  rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let curr = x;
    while (this.parent.get(curr) !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const raRank = this.rank.get(ra) || 0;
    const rbRank = this.rank.get(rb) || 0;
    if (raRank < rbRank) this.parent.set(ra, rb);
    else if (raRank > rbRank) this.parent.set(rb, ra);
    else {
      this.parent.set(rb, ra);
      this.rank.set(ra, raRank + 1);
    }
  }
}

// Detect cycles in a component (ring detection)
// A "ring" exists if the component has at least 3 nodes AND its edge count >= node count
// We also do DFS-based cycle detection to confirm.
function isRing(nodeIds: Set<string>, edges: { from: string; to: string }[]): boolean {
  if (nodeIds.size < 3) return false;
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      adj.get(e.from)!.push(e.to);
      adj.get(e.to)!.push(e.from);
    }
  }
  // DFS-based cycle detection
  const visited = new Set<string>();
  const stack: { node: string; parent: string }[] = [];
  for (const start of nodeIds) {
    if (visited.has(start)) continue;
    stack.push({ node: start, parent: '' });
    while (stack.length > 0) {
      const { node, parent } = stack.pop()!;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const nb of adj.get(node) || []) {
        if (nb === parent) continue;
        if (visited.has(nb)) return true;
        stack.push({ node: nb, parent: node });
      }
    }
  }
  return false;
}

export async function buildVendorGraph(mpId?: string): Promise<GraphData> {
  // Get all vendors + edges (optionally filtered by an MP)
  const works = mpId
    ? await db.work.findMany({ where: { mpId }, select: { vendorId: true } })
    : await db.work.findMany({ select: { vendorId: true } });

  const vendorIdsInScope = new Set(works.map(w => w.vendorId).filter(Boolean) as string[]);

  const edges = await db.graphEdge.findMany({
    where: {
      OR: [
        { fromVendorId: { in: [...vendorIdsInScope] } },
        { toVendorId: { in: [...vendorIdsInScope] } },
      ],
    },
  });

  const vendors = await db.vendor.findMany({
    where: { id: { in: [...vendorIdsInScope] } },
    include: { state: true, works: { select: { id: true } } },
  });

  // Compute degrees
  const degreeMap = new Map<string, number>();
  for (const v of vendors) degreeMap.set(v.id, 0);
  for (const e of edges) {
    degreeMap.set(e.fromVendorId, (degreeMap.get(e.fromVendorId) || 0) + 1);
    degreeMap.set(e.toVendorId, (degreeMap.get(e.toVendorId) || 0) + 1);
  }

  // Connected components via Union-Find
  const uf = new UnionFind();
  for (const v of vendors) uf.find(v.id);
  for (const e of edges) uf.union(e.fromVendorId, e.toVendorId);

  // Group vendors by root
  const componentMap = new Map<string, Set<string>>();
  for (const v of vendors) {
    const root = uf.find(v.id);
    if (!componentMap.has(root)) componentMap.set(root, new Set());
    componentMap.get(root)!.add(v.id);
  }

  // For each component, check ring
  const clusters: GraphClusterData[] = [];
  const componentRingMap = new Map<string, boolean>();
  const componentIdMap = new Map<string, number>();
  let clusterNum = 0;
  for (const [root, ids] of componentMap) {
    clusterNum++;
    const clusterId = 'C' + String(clusterNum).padStart(3, '0');
    componentIdMap.set(root, clusterNum);
    const componentEdges = edges
      .filter(e => ids.has(e.fromVendorId) && ids.has(e.toVendorId))
      .map(e => ({ from: e.fromVendorId, to: e.toVendorId }));
    const isRingComponent = isRing(ids, componentEdges);
    componentRingMap.set(root, isRingComponent);

    const componentVendors = vendors.filter(v => ids.has(v.id));
    clusters.push({
      clusterId,
      size: ids.size,
      isRing: isRingComponent,
      vendorNames: componentVendors.map(v => v.name),
      riskScore: ids.size >= 3 ? Math.min(1, 0.5 + ids.size * 0.1) : ids.size >= 2 ? 0.4 : 0.2,
    });
  }

  // Build nodes
  const nodes: GraphNodeData[] = vendors.map(v => {
    const root = uf.find(v.id);
    return {
      id: v.id,
      vendorId: v.vendorId,
      name: v.name,
      group: componentIdMap.get(root) || 0,
      riskScore: (degreeMap.get(v.id) || 0) >= 3 ? 0.7 : (degreeMap.get(v.id) || 0) * 0.15,
      degree: degreeMap.get(v.id) || 0,
      isRing: componentRingMap.get(root) || false,
      pan: v.pan,
      stateName: v.state?.name,
    };
  });

  // Build links
  const links: GraphLinkData[] = edges.map(e => ({
    source: e.fromVendorId,
    target: e.toVendorId,
    type: e.edgeType,
    weight: e.weight,
  }));

  // Persist clusters to DB (refresh)
  await db.graphCluster.deleteMany();
  for (const c of clusters) {
    if (c.size >= 2) {
      await db.graphCluster.create({
        data: {
          clusterId: c.clusterId,
          vendorIds: JSON.stringify(c.vendorNames),
          size: c.size,
          isRing: c.isRing,
          riskScore: c.riskScore,
        },
      });
    }
  }

  return { nodes, links, clusters };
}

export async function getRingClusters(): Promise<GraphClusterData[]> {
  const clusters = await db.graphCluster.findMany({ where: { isRing: true } });
  return clusters.map(c => ({
    clusterId: c.clusterId,
    size: c.size,
    isRing: c.isRing,
    vendorNames: JSON.parse(c.vendorIds) as string[],
    riskScore: c.riskScore,
  }));
}
