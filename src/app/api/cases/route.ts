import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cases = await db.case.findMany({
    include: {
      work: { include: { vendor: true, state: true, district: true, riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } } },
      auditLog: { orderBy: { timestamp: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    cases: cases.map(c => ({
      id: c.id,
      caseId: c.caseId,
      status: c.status,
      priority: c.priority,
      createdAt: c.createdAt,
      workId: c.work.workId,
      workTitle: c.work.title,
      stateName: c.work.state?.name,
      districtName: c.work.district?.name,
      vendorName: c.work.vendor?.name,
      riskTier: c.work.riskScores[0]?.riskTier,
      ensembleScore: c.work.riskScores[0]?.ensembleScore,
      blacklistMatch: c.work.riskScores[0]?.blacklistMatch,
      auditCount: c.auditLog.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { workId, priority, notes } = await req.json();
  const work = await db.work.findUnique({ where: { id: workId } });
  if (!work) return NextResponse.json({ error: 'Work not found' }, { status: 404 });

  const caseId = 'CASE' + work.workId.substring(1);
  const newCase = await db.case.create({
    data: { caseId, workId, status: 'open', priority: priority || 'high', notes: notes || '' },
  });

  const { appendAuditEntry } = await import('@/lib/audit');
  await appendAuditEntry(newCase.id, 'case_created', user.id, user.name, { workId, priority });

  return NextResponse.json({ case: newCase });
}
