// Run seed + scoring in sequence
import { seedAll } from '../src/lib/seed';
import { runScoringPipeline } from '../src/lib/scoring';
import { buildVendorGraph } from '../src/lib/graph';

async function main() {
  console.log('════════ STEP 1: SEED DATA ════════');
  await seedAll();
  console.log('════════ STEP 2: RUN SCORING ════════');
  const result = await runScoringPipeline();
  console.log('Scoring result:', result);
  console.log('════════ STEP 3: BUILD GRAPH ════════');
  const graph = await buildVendorGraph();
  console.log(`Graph: ${graph.nodes.length} nodes, ${graph.links.length} edges, ${graph.clusters.length} clusters, ${graph.clusters.filter(c => c.isRing).length} rings`);
  console.log('════════ DONE ════════');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
