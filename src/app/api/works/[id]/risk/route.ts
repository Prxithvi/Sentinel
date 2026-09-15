import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, maskVendor } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserFromToken(
    _req.cookies.get('mplad_token')?.value || _req.headers.get('authorization')?.replace('Bearer ', '')
  );

  const work = await db.work.findUnique({
    where: { id },
    include: {
      vendor: true,
      payments: { orderBy: { paidAt: 'asc' } },
      riskScores: { take: 1, orderBy: { scoredAt: 'desc' } },
      state: true,
      district: true,
      mpConstituency: true,
      citizenReports: true,
      fieldVerifications: { orderBy: { verifiedAt: 'desc' } },
    },
  });

  if (!work) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const risk = work.riskScores[0];
  const result = {
    id: work.id,
    workId: work.workId,
    title: work.title,
    description: work.description,
    category: work.category,
    fundSanctioned: work.fundSanctioned,
    fundUtilized: work.fundUtilized,
    utilizationRate: work.fundSanctioned > 0 ? work.fundUtilized / work.fundSanctioned : 0,
    status: work.status,
    startDate: work.startDate,
    endDate: work.endDate,
    stateName: work.state?.name,
    districtName: work.district?.name,
    mpName: work.mpConstituency?.mpName,
    vendor: work.vendor ? maskVendor({
      id: work.vendor.id,
      vendorId: work.vendor.vendorId,
      name: work.vendor.name,
      pan: work.vendor.pan,
      gst: work.vendor.gst,
      bankAccount: work.vendor.bankAccount,
      phone: work.vendor.phone,
      address: work.vendor.address,
    }, user?.role === 'admin') : null,
    payments: work.payments.map(p => ({
      amount: p.amount,
      paidAt: p.paidAt,
      instrument: p.instrument,
      reference: p.reference,
    })),
    risk: risk ? {
      ruleScore: risk.ruleScore,
      isoScore: risk.isoScore,
      aeScore: risk.aeScore,
      graphScore: risk.graphScore,
      nlpScore: risk.nlpScore,
      ensembleScore: risk.ensembleScore,
      riskTier: risk.riskTier,
      blacklistMatch: risk.blacklistMatch,
      ruleFlags: JSON.parse(risk.ruleFlags || '[]'),
      shap: JSON.parse(risk.shapJson || '[]'),
      scoredAt: risk.scoredAt,
    } : null,
    citizenReportsCount: work.citizenReports.length,
    fieldVerifications: work.fieldVerifications.map(fv => ({
      auditorName: fv.auditorName,
      verifiedAt: fv.verifiedAt,
      matchesClaim: fv.matchesClaim,
      notes: fv.notes,
    })),
  };

  return NextResponse.json(result);
}
