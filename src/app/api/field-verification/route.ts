import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  // Allow auditor/admin/analyst
  if (!user || !['auditor', 'admin', 'analyst'].includes(user.role)) {
    return NextResponse.json({ error: 'Auditor access required' }, { status: 403 });
  }

  const body = await req.json();
  const { workId, photoUrl, geoLat, geoLng, matchesClaim, notes } = body;

  const work = await db.work.findFirst({ where: { OR: [{ id: workId }, { workId }] } });
  if (!work) return NextResponse.json({ error: 'Work not found' }, { status: 404 });

  const verification = await db.fieldVerification.create({
    data: {
      workId: work.id,
      auditorId: user.id,
      auditorName: user.name,
      photoUrl: photoUrl || null,
      geoLat: geoLat ?? null,
      geoLng: geoLng ?? null,
      matchesClaim: matchesClaim ?? null,
      notes: notes || null,
    },
  });

  // If mismatch, log to audit if there's an open case
  const openCase = await db.case.findFirst({ where: { workId: work.id } });
  if (openCase && matchesClaim === false) {
    const { appendAuditEntry } = await import('@/lib/audit');
    await appendAuditEntry(openCase.id, 'field_verification_mismatch', user.id, user.name, {
      workId: work.workId,
      notes,
    });
  }

  return NextResponse.json({ verification });
}

export async function GET(req: NextRequest) {
  const workId = req.nextUrl.searchParams.get('workId');
  if (!workId) return NextResponse.json({ error: 'workId required' }, { status: 400 });
  const work = await db.work.findFirst({ where: { OR: [{ id: workId }, { workId }] } });
  if (!work) return NextResponse.json({ error: 'Work not found' }, { status: 404 });
  const verifications = await db.fieldVerification.findMany({
    where: { workId: work.id },
    orderBy: { verifiedAt: 'desc' },
  });
  return NextResponse.json({ verifications });
}
