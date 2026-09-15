import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST() {
  try {
    // Dynamic import to avoid polluting routes
    const { runScoringPipeline } = await import('@/lib/scoring');
    const result = await runScoringPipeline();
    // Also rebuild the graph clusters
    const { buildVendorGraph } = await import('@/lib/graph');
    await buildVendorGraph();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  // Get latest scoring summary
  const counts = await db.riskScore.groupBy({
    by: ['riskTier'],
    _count: { riskTier: true },
  });
  const total = await db.work.count();
  const summary: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of counts) summary[c.riskTier] = c._count.riskTier;
  const lastScored = await db.riskScore.findFirst({ orderBy: { scoredAt: 'desc' } });
  return NextResponse.json({
    total,
    scored: counts.reduce((s, c) => s + c._count.riskTier, 0),
    summary,
    lastScoredAt: lastScored?.scoredAt || null,
  });
}
