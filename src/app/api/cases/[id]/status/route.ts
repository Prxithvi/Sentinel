import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken } from '@/lib/auth';
import { appendAuditEntry } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { status, notes } = await req.json();
  const caseRecord = await db.case.findUnique({ where: { id } });
  if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  const prevStatus = caseRecord.status;
  const updated = await db.case.update({
    where: { id },
    data: {
      status: status || caseRecord.status,
      notes: notes ?? caseRecord.notes,
      updatedAt: new Date(),
    },
  });

  await appendAuditEntry(id, 'status_change', user.id, user.name, {
    from: prevStatus,
    to: status || prevStatus,
    notes,
  });

  // If escalated, fire a notification
  if (status === 'escalated') {
    const { sendNotification } = await import('@/lib/notifications');
    await sendNotification({
      caseId: id,
      channel: 'email',
      recipient: 'director-investigations@mplad.gov.in',
      subject: `[ESCALATED] ${caseRecord.caseId}`,
      body: `Case ${caseRecord.caseId} was escalated by ${user.name}. New status: ${status}.`,
    });
  }

  return NextResponse.json({ case: updated });
}
