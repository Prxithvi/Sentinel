import { NextRequest, NextResponse } from 'next/server';
import { buildVendorGraph, getRingClusters } from '@/lib/graph';

export async function GET(req: NextRequest) {
  const mpId = req.nextUrl.searchParams.get('mp_id') || undefined;
  const graph = await buildVendorGraph(mpId);
  const rings = await getRingClusters();
  return NextResponse.json({ ...graph, rings });
}
