import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Public endpoint — rate-limited in production; we accept all reports here for demo
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { workId, reporterName, contact, description, photoUrl, geoLat, geoLng } = body;

  if (!description || description.length < 5) {
    return NextResponse.json({ error: 'Description too short' }, { status: 400 });
  }

  // If workId provided, cross-reference against existing flags
  let matchedFlags: string[] = [];
  if (workId) {
    const work = await db.work.findFirst({
      where: { OR: [{ id: workId }, { workId }] },
      include: { riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } },
    });
    if (work) {
      const risk = work.riskScores[0];
      if (risk) {
        const flags = JSON.parse(risk.ruleFlags || '[]') as { code: string; label: string }[];
        matchedFlags = flags.map(f => f.label);
        if (risk.blacklistMatch) matchedFlags.push('Blacklist Match');
        if (risk.riskTier === 'critical' || risk.riskTier === 'high') {
          matchedFlags.push(`System risk: ${risk.riskTier.toUpperCase()}`);
        }
      }
    }
  }

  const report = await db.citizenReport.create({
    data: {
      workId: workId || null,
      reporterName: reporterName || null,
      contact: contact || null,
      description,
      photoUrl: photoUrl || null,
      geoLat: geoLat ?? null,
      geoLng: geoLng ?? null,
      status: matchedFlags.length > 0 ? 'matched' : 'submitted',
      matchedFlags: JSON.stringify(matchedFlags),
    },
  });

  return NextResponse.json({
    report,
    matchedFlags,
    crossReference: matchedFlags.length > 0
      ? `Your report matches ${matchedFlags.length} existing system flag(s): ${matchedFlags.join(', ')}`
      : 'No matching system flags found. Report logged for review.',
  });
}

export async function GET(req: NextRequest) {
  const workId = req.nextUrl.searchParams.get('workId');
  if (!workId) return NextResponse.json({ error: 'workId required' }, { status: 400 });

  const reports = await db.citizenReport.findMany({
    where: { OR: [{ workId }, { work: { workId } }] },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ reports });
}
