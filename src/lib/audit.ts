// Audit hash-chain module — tamper-evident log of all case actions
import crypto from 'crypto';
import { db } from './db';

export function computeHash(prevHash: string, action: string, actorId: string, timestamp: string, payload?: string): string {
  const data = `${prevHash}|${action}|${actorId}|${timestamp}|${payload || ''}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

const GENESIS_HASH = '0'.repeat(64);

export async function appendAuditEntry(caseId: string, action: string, actorId: string, actorName: string, payload?: Record<string, unknown>) {
  // Get last entry for this case
  const entries = await db.auditLogEntry.findMany({
    where: { caseId },
    orderBy: { timestamp: 'asc' },
  });
  const prevHash = entries.length > 0 ? entries[entries.length - 1].thisHash : GENESIS_HASH;
  const timestamp = new Date().toISOString();
  const payloadStr = payload ? JSON.stringify(payload) : undefined;
  const thisHash = computeHash(prevHash, action, actorId, timestamp, payloadStr);

  return db.auditLogEntry.create({
    data: {
      caseId,
      action,
      actorId,
      actorName,
      prevHash,
      thisHash,
      payload: payloadStr,
      timestamp: new Date(timestamp),
    },
  });
}

export interface VerifyResult {
  caseId: string;
  valid: boolean;
  entries: {
    id: string;
    action: string;
    actorName: string;
    timestamp: string;
    prevHash: string;
    thisHash: string;
    recomputedHash: string;
    valid: boolean;
  }[];
  brokenAt?: string; // entry id where the chain broke
}

export async function verifyChain(caseId: string): Promise<VerifyResult> {
  const entries = await db.auditLogEntry.findMany({
    where: { caseId },
    orderBy: { timestamp: 'asc' },
  });

  let prevHash = GENESIS_HASH;
  let chainValid = true;
  let brokenAt: string | undefined;
  const result = [];

  for (const e of entries) {
    // First check: prevHash must equal the previous entry's thisHash
    const prevHashMatches = e.prevHash === prevHash;
    // Recompute hash
    const recomputed = computeHash(e.prevHash, e.action, e.actorId, e.timestamp.toISOString(), e.payload || undefined);
    const hashMatches = recomputed === e.thisHash;
    const entryValid = prevHashMatches && hashMatches;
    if (!entryValid && chainValid) {
      chainValid = false;
      brokenAt = e.id;
    }
    result.push({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      timestamp: e.timestamp.toISOString(),
      prevHash: e.prevHash,
      thisHash: e.thisHash,
      recomputedHash: recomputed,
      valid: entryValid,
    });
    prevHash = e.thisHash;
  }

  return {
    caseId,
    valid: chainValid,
    entries: result,
    brokenAt,
  };
}

// Tamper-test helper (for demo): alter one entry in DB to show chain breaks
export async function tamperEntry(entryId: string): Promise<void> {
  const entry = await db.auditLogEntry.findUnique({ where: { id: entryId } });
  if (!entry) return;
  await db.auditLogEntry.update({
    where: { id: entryId },
    data: { action: entry.action + ' [tampered]' },
  });
}
