import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, maskVendor } from '@/lib/auth';
import { appendAuditEntry } from '@/lib/audit';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required to reveal PII' }, { status: 403 });
  }

  const caseRecord = await db.case.findUnique({
    where: { id },
    include: { work: { include: { vendor: true } } },
  });
  if (!caseRecord) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  await appendAuditEntry(id, 'reveal_pii', user.id, user.name, {
    workId: caseRecord.workId,
    vendorId: caseRecord.work.vendorId,
  });

  // Return unmasked vendor
  const v = caseRecord.work.vendor;
  if (!v) return NextResponse.json({ vendor: null });

  return NextResponse.json({
    vendor: {
      id: v.id,
      vendorId: v.vendorId,
      name: v.name,
      pan: v.pan,
      gst: v.gst,
      bankAccount: v.bankAccount,
      phone: v.phone,
      address: v.address,
      _masked: maskVendor({ pan: v.pan, gst: v.gst, bankAccount: v.bankAccount, phone: v.phone }, false),
    },
    auditLogged: true,
  });
}
