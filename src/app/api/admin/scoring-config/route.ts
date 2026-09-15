import { NextRequest, NextResponse } from 'next/server';
import { getScoringConfig, updateScoringConfig, previewRescore } from '@/lib/scoring';
import { getUserFromToken } from '@/lib/auth';

export async function GET() {
  const config = await getScoringConfig();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  await updateScoringConfig(body);
  return NextResponse.json({ ok: true, config: body });
}
