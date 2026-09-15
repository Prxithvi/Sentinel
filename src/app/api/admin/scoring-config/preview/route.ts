import { NextRequest, NextResponse } from 'next/server';
import { previewRescore, getScoringConfig } from '@/lib/scoring';
import { getUserFromToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const sampleSize = body.sampleSize || 50;
  // Use new config from body, fallback to current
  const current = await getScoringConfig();
  const newConfig = { ...current, ...body.config };
  const result = await previewRescore(sampleSize, newConfig);
  return NextResponse.json({ ...result, appliedConfig: newConfig });
}
