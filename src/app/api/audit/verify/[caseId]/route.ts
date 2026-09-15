import { NextRequest, NextResponse } from 'next/server';
import { verifyChain } from '@/lib/audit';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const result = await verifyChain(caseId);
  return NextResponse.json(result);
}
