import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Public endpoint — no auth required, aggregate-only data
export async function GET() {
  const totalWorks = await db.work.count();
  const totalSanctioned = await db.work.aggregate({ _sum: { fundSanctioned: true } });
  const totalUtilized = await db.work.aggregate({ _sum: { fundUtilized: true } });
  const states = await db.state.findMany();
  const stateStats: { stateName: string; totalWorks: number; utilizationRate: number; transparencyScore: number }[] = [];

  for (const s of states) {
    const works = await db.work.findMany({
      where: { stateId: s.id },
      include: { riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } },
    });
    const ts = works.reduce((sum, w) => sum + w.fundSanctioned, 0);
    const tu = works.reduce((sum, w) => sum + w.fundUtilized, 0);
    const flagged = works.filter(w => ['critical', 'high'].includes(w.riskScores[0]?.riskTier || '')).length;
    const utilizationRate = ts > 0 ? tu / ts : 0;
    const flagRate = works.length > 0 ? flagged / works.length : 0;
    const transparencyScore = Math.round(utilizationRate * 50 + (1 - flagRate) * 30 + 20);
    stateStats.push({ stateName: s.name, totalWorks: works.length, utilizationRate, transparencyScore });
  }

  const topPerforming = [...stateStats].sort((a, b) => b.transparencyScore - a.transparencyScore).slice(0, 5);
  const underperforming = [...stateStats].sort((a, b) => a.transparencyScore - b.transparencyScore).slice(0, 5);

  const districts = await db.district.findMany({ include: { state: true } });
  const districtStats = [];
  for (const d of districts) {
    const works = await db.work.findMany({
      where: { districtId: d.id },
      include: { riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } },
    });
    if (works.length === 0) continue;
    const ts = works.reduce((sum, w) => sum + w.fundSanctioned, 0);
    const tu = works.reduce((sum, w) => sum + w.fundUtilized, 0);
    const utilizationRate = ts > 0 ? tu / ts : 0;
    districtStats.push({
      districtName: d.name,
      stateName: d.state.name,
      totalWorks: works.length,
      utilizationRate,
    });
  }
  const topDistricts = [...districtStats].sort((a, b) => b.utilizationRate - a.utilizationRate).slice(0, 5);
  const lowDistricts = [...districtStats].sort((a, b) => a.utilizationRate - b.utilizationRate).slice(0, 5);

  return NextResponse.json({
    totalWorks,
    totalSanctioned: totalSanctioned._sum.fundSanctioned || 0,
    totalUtilized: totalUtilized._sum.fundUtilized || 0,
    overallUtilization: totalSanctioned._sum.fundSanctioned ? (totalUtilized._sum.fundUtilized || 0) / totalSanctioned._sum.fundSanctioned : 0,
    statesTracked: states.length,
    stateStats,
    topPerforming,
    underperforming,
    topDistricts,
    lowDistricts,
    lastUpdated: new Date().toISOString(),
    dataSource: 'MPLAD Sentinel — synthetic dataset (demo)',
  });
}
