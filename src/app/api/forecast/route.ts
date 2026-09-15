import { NextResponse } from 'next/server';
import { getAllForecasts } from '@/lib/forecast';

export async function GET() {
  const forecasts = await getAllForecasts();
  return NextResponse.json({ forecasts });
}
