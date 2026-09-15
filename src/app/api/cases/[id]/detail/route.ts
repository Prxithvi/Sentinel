import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, maskVendor } from '@/lib/auth';
import { verifyChain } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caseRecord = await db.case.findUnique({
    where: { id },
    include: {
      work: {
        include: {
          vendor: true,
          payments: { orderBy: { paidAt: 'asc' } },
          riskScores: { take: 1, orderBy: { scoredAt: 'desc' } },
          state: true,
          district: true,
          mpConstituency: true,
        },
      },
      auditLog: { orderBy: { timestamp: 'asc' } },
      notifications: { orderBy: { sentAt: 'desc' } },
    },
  });

  if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const verification = await verifyChain(id);

  return NextResponse.json({
    case: {
      id: caseRecord.id,
      caseId: caseRecord.caseId,
      status: caseRecord.status,
      priority: caseRecord.priority,
      notes: caseRecord.notes,
      createdAt: caseRecord.createdAt,
      updatedAt: caseRecord.updatedAt,
    },
    work: {
      id: caseRecord.work.id,
      workId: caseRecord.work.workId,
      title: caseRecord.work.title,
      description: caseRecord.work.description,
      category: caseRecord.work.category,
      fundSanctioned: caseRecord.work.fundSanctioned,
      fundUtilized: caseRecord.work.fundUtilized,
      utilizationRate: caseRecord.work.fundSanctioned > 0 ? caseRecord.work.fundUtilized / caseRecord.work.fundSanctioned : 0,
      status: caseRecord.work.status,
      startDate: caseRecord.work.startDate,
      stateName: caseRecord.work.state?.name,
      districtName: caseRecord.work.district?.name,
      mpName: caseRecord.work.mpConstituency?.mpName,
      vendor: caseRecord.work.vendor ? maskVendor({
        id: caseRecord.work.vendor.id,
        vendorId: caseRecord.work.vendor.vendorId,
        name: caseRecord.work.vendor.name,
        pan: caseRecord.work.vendor.pan,
        gst: caseRecord.work.vendor.gst,
        bankAccount: caseRecord.work.vendor.bankAccount,
        phone: caseRecord.work.vendor.phone,
        address: caseRecord.work.vendor.address,
      }, user.role === 'admin') : null,
      payments: caseRecord.work.payments.map(p => ({
        amount: p.amount,
        paidAt: p.paidAt,
        instrument: p.instrument,
        reference: p.reference,
      })),
      risk: caseRecord.work.riskScores[0] ? {
        ruleScore: caseRecord.work.riskScores[0].ruleScore,
        isoScore: caseRecord.work.riskScores[0].isoScore,
        aeScore: caseRecord.work.riskScores[0].aeScore,
        graphScore: caseRecord.work.riskScores[0].graphScore,
        nlpScore: caseRecord.work.riskScores[0].nlpScore,
        ensembleScore: caseRecord.work.riskScores[0].ensembleScore,
        riskTier: caseRecord.work.riskScores[0].riskTier,
        blacklistMatch: caseRecord.work.riskScores[0].blacklistMatch,
        ruleFlags: JSON.parse(caseRecord.work.riskScores[0].ruleFlags || '[]'),
        shap: JSON.parse(caseRecord.work.riskScores[0].shapJson || '[]'),
      } : null,
    },
    auditLog: verification.entries,
    auditChainValid: verification.valid,
    brokenAt: verification.brokenAt,
    notifications: caseRecord.notifications,
  });
}
