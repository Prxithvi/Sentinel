import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const runs = await db.modelRun.findMany({ orderBy: { trainedAt: 'desc' } });
  return NextResponse.json({
    runs: runs.map(r => ({
      id: r.id,
      modelName: r.modelName,
      version: r.version,
      trainedAt: r.trainedAt,
      metrics: JSON.parse(r.metricsJson),
      mlflowRunId: r.mlflowRunId,
      notes: r.notes,
    })),
  });
}
