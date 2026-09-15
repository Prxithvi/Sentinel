import { NextRequest, NextResponse } from 'next/server';
import { askCopilot } from '@/lib/copilot';
import { getUserFromToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getUserFromToken(
    req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '')
  );
  if (!user || !['admin', 'analyst', 'auditor'].includes(user.role)) {
    return NextResponse.json({ error: 'Investigator access required' }, { status: 403 });
  }
  const { caseId, question } = await req.json();
  if (!caseId || !question) {
    return NextResponse.json({ error: 'caseId and question required' }, { status: 400 });
  }
  const result = await askCopilot(caseId, question);
  return NextResponse.json(result);
}
