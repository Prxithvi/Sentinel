import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const totalWorks = await db.work.count();
  const totalSanctioned = await db.work.aggregate({ _sum: { fundSanctioned: true } });
  const totalUtilized = await db.work.aggregate({ _sum: { fundUtilized: true } });
  const riskTierCounts = await db.riskScore.groupBy({ by: ['riskTier'], _count: { riskTier: true } });
  const summary: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of riskTierCounts) summary[c.riskTier] = c._count.riskTier;
  const openCases = await db.case.count({ where: { status: 'open' } });
  const resolvedCases = await db.case.count({ where: { status: { in: ['resolved', 'closed'] } } });
  const citizenReports = await db.citizenReport.count();
  const flaggedVendors = await db.vendor.count({
    where: { works: { some: { riskScores: { some: { riskTier: { in: ['critical', 'high'] } } } } } },
  });
  const totalSanctionedVal = totalSanctioned._sum.fundSanctioned || 0;
  const totalUtilizedVal = totalUtilized._sum.fundUtilized || 0;

  // Trend (last 12 months)
  const works = await db.work.findMany({
    select: { createdAt: true, riskScores: { take: 1, orderBy: { scoredAt: 'desc' }, select: { riskTier: true } } },
  });
  const trendMap = new Map<string, { critical: number; high: number; medium: number; low: number }>();
  for (const w of works) {
    const monthKey = w.createdAt.toISOString().substring(0, 7); // YYYY-MM
    if (!trendMap.has(monthKey)) trendMap.set(monthKey, { critical: 0, high: 0, medium: 0, low: 0 });
    const tier = w.riskScores[0]?.riskTier || 'low';
    trendMap.get(monthKey)![tier as 'critical' | 'high' | 'medium' | 'low']++;
  }
  const trend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, counts]) => ({ month, ...counts }));

  return NextResponse.json({
    totalWorks,
    totalSanctioned: totalSanctionedVal,
    totalUtilized: totalUtilizedVal,
    utilizationRate: totalSanctionedVal > 0 ? totalUtilizedVal / totalSanctionedVal : 0,
    criticalCount: summary.critical,
    highCount: summary.high,
    mediumCount: summary.medium,
    lowCount: summary.low,
    openCases,
    resolvedCases,
    citizenReports,
    flaggedVendors,
    trend,
  });
}
