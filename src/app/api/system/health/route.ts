import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Lightweight in-memory latency tracker
const latencySamples: number[] = [];
export function recordLatency(ms: number) {
  latencySamples.push(ms);
  if (latencySamples.length > 1000) latencySamples.shift();
}

const startTime = Date.now();

export async function GET() {
  // Compute p95 latency
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;

  // DB size — approximate by counting rows across tables
  const counts = {
    works: await db.work.count(),
    vendors: await db.vendor.count(),
    payments: await db.payment.count(),
    riskScores: await db.riskScore.count(),
    cases: await db.case.count(),
    citizenReports: await db.citizenReport.count(),
    auditEntries: await db.auditLogEntry.count(),
    blacklistEntries: await db.blacklistEntry.count(),
    graphEdges: await db.graphEdge.count(),
  };

  const totalRequests = latencySamples.length;

  // Pipeline status — last scoring run
  const lastScore = await db.riskScore.findFirst({ orderBy: { scoredAt: 'desc' } });
  const pipelineStatus = lastScore
    ? { status: 'idle', lastRun: lastScore.scoredAt, scored: counts.riskScores }
    : { status: 'never_run', lastRun: null, scored: 0 };

  const uptime = (Date.now() - startTime) / 1000;

  return NextResponse.json({
    apiLatencyP95: p95,
    apiLatencyAvg: totalRequests > 0 ? latencySamples.reduce((s, v) => s + v, 0) / totalRequests : 0,
    totalRequests,
    uptime,
    pipeline: pipelineStatus,
    dbSize: { approxRows: Object.values(counts).reduce((s, v) => s + v, 0), tables: counts },
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
}
