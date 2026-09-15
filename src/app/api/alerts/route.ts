import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, maskVendor } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const tier = req.nextUrl.searchParams.get('tier');
  const state = req.nextUrl.searchParams.get('state');
  const district = req.nextUrl.searchParams.get('district');
  const limit = Number(req.nextUrl.searchParams.get('limit') || 100);

  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );

  const where: Record<string, unknown> = {};
  if (tier) where['riskTier'] = tier;

  const works = await db.work.findMany({
    where: where,
    include: {
      vendor: true,
      riskScores: { take: 1, orderBy: { scoredAt: 'desc' } },
      state: true,
      district: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  let filtered = works;
  if (state) filtered = filtered.filter(w => w.state?.name === state);
  if (district) filtered = filtered.filter(w => w.district?.name === district);

  const result = filtered.map(w => ({
    id: w.id,
    workId: w.workId,
    title: w.title,
    category: w.category,
    fundSanctioned: w.fundSanctioned,
    fundUtilized: w.fundUtilized,
    utilizationRate: w.fundSanctioned > 0 ? w.fundUtilized / w.fundSanctioned : 0,
    status: w.status,
    stateName: w.state?.name,
    districtName: w.district?.name,
    vendor: w.vendor ? maskVendor({
      vendorId: w.vendor.vendorId,
      name: w.vendor.name,
      pan: w.vendor.pan,
      gst: w.vendor.gst,
      bankAccount: w.vendor.bankAccount,
      phone: w.vendor.phone,
    }, user?.role === 'admin') : null,
    risk: w.riskScores[0] ? {
      ensembleScore: w.riskScores[0].ensembleScore,
      riskTier: w.riskScores[0].riskTier,
      blacklistMatch: w.riskScores[0].blacklistMatch,
      ruleFlags: JSON.parse(w.riskScores[0].ruleFlags || '[]'),
    } : null,
  }));

  return NextResponse.json({ works: result, count: result.length });
}
