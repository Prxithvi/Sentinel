import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const states = await db.state.findMany({
    include: {
      districts: true,
      vendors: true,
    },
  });

  const result = [];
  for (const s of states) {
    const works = await db.work.findMany({
      where: { stateId: s.id },
      include: {
        riskScores: { take: 1, orderBy: { scoredAt: 'desc' } },
      },
    });
    const totalWorks = works.length;
    const totalSanctioned = works.reduce((sum, w) => sum + w.fundSanctioned, 0);
    const totalUtilized = works.reduce((sum, w) => sum + w.fundUtilized, 0);
    const criticalCount = works.filter(w => w.riskScores[0]?.riskTier === 'critical').length;
    const highCount = works.filter(w => w.riskScores[0]?.riskTier === 'high').length;
    const flagged = criticalCount + highCount;
    const utilizationRate = totalSanctioned > 0 ? totalUtilized / totalSanctioned : 0;
    // Transparency score: combination of utilization, low flag rate, etc.
    const flagRate = totalWorks > 0 ? flagged / totalWorks : 0;
    const transparencyScore = Math.round(
      (utilizationRate * 50 + (1 - flagRate) * 30 + 20) // base 20 for having data
    );

    result.push({
      stateId: s.id,
      stateName: s.name,
      stateCode: s.code,
      totalWorks,
      totalSanctioned,
      totalUtilized,
      utilizationRate,
      criticalCount,
      highCount,
      transparencyScore,
    });
  }

  return NextResponse.json({ states: result });
}
