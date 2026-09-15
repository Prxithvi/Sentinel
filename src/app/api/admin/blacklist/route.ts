import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getUserFromToken, maskPAN, maskBank } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || !['admin', 'analyst'].includes(user.role)) {
    return NextResponse.json({ error: 'Admin/analyst only' }, { status: 403 });
  }
  const entries = await db.blacklistEntry.findMany({ include: { vendor: true } });
  return NextResponse.json({
    entries: entries.map(e => ({
      id: e.id,
      identifierType: e.identifierType,
      identifierMasked: e.identifierMasked || (e.identifierType === 'PAN' ? maskPAN(e.identifierValue) : e.identifierType === 'bank_account' ? maskBank(e.identifierValue) : e.identifierValue.substring(0, 4) + 'XXX'),
      identifierValue: user.role === 'admin' ? e.identifierValue : undefined,
      reason: e.reason,
      source: e.source,
      vendorName: e.vendor?.name,
      addedAt: e.addedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const { identifierType, identifierValue, reason, source } = body;
  if (!identifierType || !identifierValue) {
    return NextResponse.json({ error: 'identifierType and identifierValue required' }, { status: 400 });
  }
  const masked = identifierType === 'PAN' ? maskPAN(identifierValue) : identifierType === 'bank_account' ? maskBank(identifierValue) : identifierValue.substring(0, 4) + 'XXX';
  const entry = await db.blacklistEntry.create({
    data: {
      identifierType,
      identifierValue,
      identifierMasked: masked,
      reason: reason || 'Manually added',
      source: source || 'manual_admin',
    },
  });
  return NextResponse.json({ entry });
}
