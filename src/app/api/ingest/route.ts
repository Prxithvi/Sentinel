import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// Bulk ingest with data quality layer (schema validation + range checks + duplicate detection)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entityType, records } = body as { entityType: string; records: Record<string, unknown>[] };

  if (!entityType || !Array.isArray(records)) {
    return NextResponse.json({ error: 'entityType and records[] required' }, { status: 400 });
  }

  const batchId = 'BATCH' + crypto.randomBytes(4).toString('hex');
  const totalRows = records.length;
  let validRows = 0;
  const rejected: { rowIndex: number; reason: string }[] = [];
  const seenKeys = new Set<string>(); // duplicate detection within batch

  // Schema validators
  const validators: Record<string, (rec: Record<string, unknown>, idx: number) => string | null> = {
    works: (rec, idx) => {
      if (!rec['workId']) return `row ${idx}: workId required`;
      if (!rec['title']) return `row ${idx}: title required`;
      const fs = Number(rec['fundSanctioned']);
      const fu = Number(rec['fundUtilized']);
      if (isNaN(fs) || fs < 0) return `row ${idx}: fundSanctioned must be non-negative number`;
      if (isNaN(fu) || fu < 0) return `row ${idx}: fundUtilized must be non-negative number`;
      if (fu > fs * 2) return `row ${idx}: fundUtilized > 2x fundSanctioned (suspicious)`;
      // Duplicate workId within batch
      const key = 'workId:' + rec['workId'];
      if (seenKeys.has(key)) return `row ${idx}: duplicate workId ${rec['workId']}`;
      seenKeys.add(key);
      return null;
    },
    vendors: (rec, idx) => {
      if (!rec['vendorId']) return `row ${idx}: vendorId required`;
      if (!rec['name']) return `row ${idx}: name required`;
      if (!rec['pan'] || String(rec['pan']).length !== 10) return `row ${idx}: pan must be 10 chars`;
      const key = 'vendorId:' + rec['vendorId'];
      if (seenKeys.has(key)) return `row ${idx}: duplicate vendorId`;
      seenKeys.add(key);
      return null;
    },
    payments: (rec, idx) => {
      if (!rec['workId']) return `row ${idx}: workId required`;
      const amt = Number(rec['amount']);
      if (isNaN(amt) || amt <= 0) return `row ${idx}: amount must be positive`;
      return null;
    },
  };

  const validator = validators[entityType];
  if (!validator) {
    return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 });
  }

  const validRecords: Record<string, unknown>[] = [];
  for (let i = 0; i < records.length; i++) {
    const err = validator(records[i], i);
    if (err) {
      rejected.push({ rowIndex: i, reason: err });
    } else {
      validRows++;
      validRecords.push(records[i]);
    }
  }

  // Optionally persist records (for demo, we just report)
  // Note: actual insert would go here. We avoid for demo to keep things simple.

  const qualityReport = {
    batchId,
    entityType,
    totalRows,
    validRows,
    rejectedRows: rejected.length,
    rejected,
    timestamp: new Date().toISOString(),
    checks: ['schema', 'range', 'duplicate_within_batch'],
  };

  await db.ingestionBatch.create({
    data: {
      batchId,
      entityType,
      totalRows,
      validRows,
      rejectedRows: rejected.length,
      qualityReport: JSON.stringify(qualityReport),
    },
  });

  return NextResponse.json(qualityReport);
}

export async function GET(req: NextRequest) {
  const batches = await db.ingestionBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  return NextResponse.json({
    batches: batches.map(b => ({
      ...b,
      qualityReport: JSON.parse(b.qualityReport),
    })),
  });
}
