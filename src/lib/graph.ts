// Graph engine — vendor network analysis and ring detection
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

// ----------------------------------------------------
// Union-Find
// ----------------------------------------------------

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
    let current = x;

    while (this.parent.get(current) !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }

    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);

    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA) || 0;
    const rankB = this.rank.get(rootB) || 0;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }
}

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

function normalize(value: string | null | undefined) {
  if (!value) return null;

  const cleaned = value.trim().toLowerCase();

  return cleaned.length > 0 ? cleaned : null;
}

// ----------------------------------------------------
// Cycle / Ring detection
// ----------------------------------------------------

function detectRing(
  nodeIds: Set<string>,
  edges: { from: string; to: string }[]
): boolean {
  if (nodeIds.size < 3) return false;

  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (
      nodeIds.has(edge.from) &&
      nodeIds.has(edge.to)
    ) {
      adjacency.get(edge.from)!.push(edge.to);
      adjacency.get(edge.to)!.push(edge.from);
    }
  }

  const visited = new Set<string>();

  function dfs(
    current: string,
    parent: string | null
  ): boolean {
    visited.add(current);

    for (const neighbor of adjacency.get(current) || []) {
      if (neighbor === parent) continue;

      if (visited.has(neighbor)) {
        return true;
      }

      if (dfs(neighbor, current)) {
        return true;
      }
    }

    return false;
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      if (dfs(id, null)) {
        return true;
      }
    }
  }

  return false;
}

// ----------------------------------------------------
// Build vendor graph
// ----------------------------------------------------

export async function buildVendorGraph(
  mpId?: string
): Promise<GraphData> {

  // --------------------------------------------------
  // 1. Get works in scope
  // --------------------------------------------------

  const works = mpId
    ? await db.work.findMany({
        where: { mpId },
        select: {
          id: true,
          vendorId: true,
        },
      })
    : await db.work.findMany({
        select: {
          id: true,
          vendorId: true,
        },
      });

  const vendorIds = Array.from(
    new Set(
      works
        .map((work) => work.vendorId)
        .filter(Boolean) as string[]
    )
  );

  // No vendors
  if (vendorIds.length === 0) {
    return {
      nodes: [],
      links: [],
      clusters: [],
    };
  }

  // --------------------------------------------------
  // 2. Get vendors
  // --------------------------------------------------

  const vendors = await db.vendor.findMany({
    where: {
      id: {
        in: vendorIds,
      },
    },

    include: {
      state: true,

      works: {
        select: {
          id: true,
        },
      },
    },
  });

  // --------------------------------------------------
  // 3. Get risk scores for vendor works
  // --------------------------------------------------

  const workIds = vendors.flatMap((vendor) =>
    vendor.works.map((work) => work.id)
  );

  const riskScores =
    workIds.length > 0
      ? await db.riskScore.findMany({
          where: {
            workId: {
              in: workIds,
            },
          },
          select: {
            workId: true,
            ensembleScore: true,
            riskTier: true,
          },
        })
      : [];

  // Map work -> risk score
  const riskByWork = new Map<
    string,
    number
  >();

  for (const risk of riskScores) {
    riskByWork.set(
      risk.workId,
      risk.ensembleScore || 0
    );
  }

  // --------------------------------------------------
  // 4. Calculate vendor risk
  // --------------------------------------------------

  const vendorRisk = new Map<string, number>();

  for (const vendor of vendors) {
    const scores = vendor.works
      .map((work) => riskByWork.get(work.id) || 0)
      .filter((score) => score > 0);

    const maxRisk =
      scores.length > 0
        ? Math.max(...scores)
        : 0;

    vendorRisk.set(vendor.id, maxRisk);
  }

  // --------------------------------------------------
  // 5. Build relationships from REAL vendor data
  // --------------------------------------------------

  const rawEdges: {
    from: string;
    to: string;
    type: string;
    weight: number;
  }[] = [];

  // Group vendors by PAN
  const panGroups = new Map<
    string,
    string[]
  >();

  // Group vendors by GST
  const gstGroups = new Map<
    string,
    string[]
  >();

  // Group vendors by bank
  const bankGroups = new Map<
    string,
    string[]
  >();

  for (const vendor of vendors) {
    const pan = normalize(vendor.pan);
    const gst = normalize(vendor.gst);
    const bank = normalize(vendor.bankAccount);

    if (pan) {
      const list = panGroups.get(pan) || [];
      list.push(vendor.id);
      panGroups.set(pan, list);
    }

    if (gst) {
      const list = gstGroups.get(gst) || [];
      list.push(vendor.id);
      gstGroups.set(gst, list);
    }

    if (bank) {
      const list = bankGroups.get(bank) || [];
      list.push(vendor.id);
      bankGroups.set(bank, list);
    }
  }

  // --------------------------------------------------
  // Helper to add grouped relationships
  // --------------------------------------------------

  function addGroupEdges(
    groups: Map<string, string[]>,
    type: string
  ) {
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          rawEdges.push({
            from: ids[i],
            to: ids[j],
            type,
            weight: 1,
          });
        }
      }
    }
  }

  addGroupEdges(
    panGroups,
    'shared_pan'
  );

  addGroupEdges(
    bankGroups,
    'shared_bank'
  );

  addGroupEdges(
    gstGroups,
    'shared_gst'
  );

  // --------------------------------------------------
  // 6. Merge duplicate relationships
  // --------------------------------------------------

  const edgeMap = new Map<
    string,
    GraphLinkData
  >();

  for (const edge of rawEdges) {
    const [a, b] = [
      edge.from,
      edge.to,
    ].sort();

    const key = `${a}-${b}`;

    const existing = edgeMap.get(key);

    if (!existing) {
      edgeMap.set(key, {
        source: a,
        target: b,
        type: edge.type,
        weight: 1,
      });
    } else {
      // Multiple relationships between the
      // same vendors increase relationship strength.
      existing.weight += 1;

      // Preserve all relationship types.
      if (!existing.type.includes(edge.type)) {
        existing.type += `,${edge.type}`;
      }
    }
  }

  const links = Array.from(
    edgeMap.values()
  );

  // --------------------------------------------------
  // 7. Calculate degree
  // --------------------------------------------------

  const degreeMap = new Map<
    string,
    number
  >();

  for (const vendor of vendors) {
    degreeMap.set(vendor.id, 0);
  }

  for (const edge of links) {
    degreeMap.set(
      edge.source,
      (degreeMap.get(edge.source) || 0) + 1
    );

    degreeMap.set(
      edge.target,
      (degreeMap.get(edge.target) || 0) + 1
    );
  }

  // --------------------------------------------------
  // 8. Connected components
  // --------------------------------------------------

  const uf = new UnionFind();

  for (const vendor of vendors) {
    uf.find(vendor.id);
  }

  for (const edge of links) {
    uf.union(
      edge.source,
      edge.target
    );
  }

  const componentMap = new Map<
    string,
    Set<string>
  >();

  for (const vendor of vendors) {
    const root = uf.find(vendor.id);

    if (!componentMap.has(root)) {
      componentMap.set(
        root,
        new Set()
      );
    }

    componentMap
      .get(root)!
      .add(vendor.id);
  }

  // --------------------------------------------------
  // 9. Build clusters
  // --------------------------------------------------

  const clusters: GraphClusterData[] = [];

  const componentIdMap = new Map<
    string,
    number
  >();

  const componentRingMap = new Map<
    string,
    boolean
  >();

  let clusterNumber = 0;

  for (const [
    root,
    ids,
  ] of componentMap.entries()) {

    clusterNumber++;

    const clusterId =
      'C' +
      String(clusterNumber).padStart(
        3,
        '0'
      );

    componentIdMap.set(
      root,
      clusterNumber
    );

    const componentEdges = links
      .filter(
        (edge) =>
          ids.has(edge.source) &&
          ids.has(edge.target)
      )
      .map((edge) => ({
        from: edge.source,
        to: edge.target,
      }));

    const ring = detectRing(
      ids,
      componentEdges
    );

    componentRingMap.set(
      root,
      ring
    );

    const componentVendors =
      vendors.filter((vendor) =>
        ids.has(vendor.id)
      );

    // IMPORTANT:
    // Risk is based on the actual highest
    // vendor/work risk score in the network.
    const componentRisk = Math.max(
      ...componentVendors.map(
        (vendor) =>
          vendorRisk.get(vendor.id) || 0
      ),
      0
    );

    // Only expose connected networks.
    if (ids.size >= 2) {
      clusters.push({
        clusterId,
        size: ids.size,
        isRing: ring,

        vendorNames:
          componentVendors.map(
            (vendor) => vendor.name
          ),

        riskScore: componentRisk,
      });
    }
  }

  // --------------------------------------------------
  // 10. Build nodes
  // --------------------------------------------------

  const nodes: GraphNodeData[] =
    vendors.map((vendor) => {

      const root = uf.find(
        vendor.id
      );

      const degree =
        degreeMap.get(
          vendor.id
        ) || 0;

      return {
        id: vendor.id,

        vendorId:
          vendor.vendorId,

        name:
          vendor.name,

        group:
          componentIdMap.get(
            root
          ) || 0,

        // REAL risk score from RiskScore
        riskScore:
          vendorRisk.get(
            vendor.id
          ) || 0,

        degree,

        isRing:
          componentRingMap.get(
            root
          ) || false,

        pan:
          vendor.pan,

        stateName:
          vendor.state?.name,
      };
    });

  // --------------------------------------------------
  // 11. Do NOT persist fabricated clusters
  // --------------------------------------------------
  //
  // The graph is calculated from the current
  // database data each time.
  //
  // This prevents stale GraphCluster records
  // from becoming the source of truth.
  //

  return {
    nodes,
    links,
    clusters,
  };
}

// ----------------------------------------------------
// Backwards-compatible ring cluster function
// ----------------------------------------------------

export async function getRingClusters(): Promise<
  GraphClusterData[]
> {
  const graph =
    await buildVendorGraph();

  return graph.clusters.filter(
    (cluster) =>
      cluster.isRing
  );
}