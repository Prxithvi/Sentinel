import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  // MP-level leaderboard
  const mps = await db.mpConstituency.findMany({ include: { state: true } });
  const mpEntries = [];
  for (const mp of mps) {
    const works = await db.work.findMany({
      where: { mpConstituencyId: mp.id },
      include: { riskScores: { take: 1, orderBy: { scoredAt: 'desc' } }, cases: true },
    });
    if (works.length === 0) continue;
    const ts = works.reduce((s, w) => s + w.fundSanctioned, 0);
    const tu = works.reduce((s, w) => s + w.fundUtilized, 0);
    const utilizationRate = ts > 0 ? tu / ts : 0;
    const flagged = works.filter(w => ['critical', 'high'].includes(w.riskScores[0]?.riskTier || '')).length;
    const flagRate = works.length > 0 ? flagged / works.length : 0;
    const totalCases = works.reduce((s, w) => s + w.cases.length, 0);
    const resolvedCases = works.reduce((s, w) => s + w.cases.filter(c => c.status === 'resolved' || c.status === 'closed').length, 0);
    const resolutionRate = totalCases > 0 ? resolvedCases / totalCases : 0;
    const transparencyScore = Math.round(utilizationRate * 40 + (1 - flagRate) * 30 + resolutionRate * 30);
    mpEntries.push({
      name: mp.mpName,
      type: 'mp' as const,
      constituency: mp.name,
      stateName: mp.state.name,
      party: mp.party,
      totalWorks: works.length,
      utilizationRate,
      flagRate,
      resolutionRate,
      transparencyScore,
    });
  }
  mpEntries.sort((a, b) => b.transparencyScore - a.transparencyScore);
  const mpRanked = mpEntries.map((e, i) => ({ rank: i + 1, ...e }));

  // District leaderboard
  const districts = await db.district.findMany({ include: { state: true } });
  const districtEntries = [];
  for (const d of districts) {
    const works = await db.work.findMany({
      where: { districtId: d.id },
      include: { riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } },
    });
    if (works.length === 0) continue;
    const ts = works.reduce((s, w) => s + w.fundSanctioned, 0);
    const tu = works.reduce((s, w) => s + w.fundUtilized, 0);
    const utilizationRate = ts > 0 ? tu / ts : 0;
    const flagged = works.filter(w => ['critical', 'high'].includes(w.riskScores[0]?.riskTier || '')).length;
    const flagRate = works.length > 0 ? flagged / works.length : 0;
    const transparencyScore = Math.round(utilizationRate * 60 + (1 - flagRate) * 40);
    districtEntries.push({
      name: d.name,
      type: 'district' as const,
      stateName: d.state.name,
      totalWorks: works.length,
      utilizationRate,
      flagRate,
      resolutionRate: 0,
      transparencyScore,
    });
  }
  districtEntries.sort((a, b) => b.transparencyScore - a.transparencyScore);
  const districtRanked = districtEntries.map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ mpLeaderboard: mpRanked, districtLeaderboard: districtRanked });
}
