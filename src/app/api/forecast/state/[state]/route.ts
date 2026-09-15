import { NextRequest, NextResponse } from 'next/server';
import { getForecastForState, getAllForecasts } from '@/lib/forecast';

export async function GET(req: NextRequest, { params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  // state can be either a stateId or a state code/name
  const { db } = await import('@/lib/db');
  const stateRec = await db.state.findFirst({
    where: { OR: [{ id: state }, { code: state }, { name: state }] },
  });
  if (!stateRec) return NextResponse.json({ error: 'State not found' }, { status: 404 });

  const forecast = await getForecastForState(stateRec.id);
  return NextResponse.json(forecast);
}
