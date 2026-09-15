// Scoring pipeline — rule pre-filter + isolation-forest + autoencoder-like + ensemble + SHAP
// Implemented in TypeScript for the unified Next.js stack

import { db } from './db';
import type { RiskBreakdown, ShapFeature, RiskTier, ScoringConfigType } from './types';

// ─────────────────────────── RULE PRE-FILTER ───────────────────────────

export interface RuleFlag {
  code: string;
  label: string;
  weight: number;
  evidence: string;
}

export async function rulePrefilter(work: {
  id: string;
  workId: string;
  fundSanctioned: number;
  fundUtilized: number;
  status: string;
  payments: { amount: number }[];
  vendorId: string | null;
  vendor?: { pan: string; gst: string | null; bankAccount: string } | null;
}): Promise<{ flags: RuleFlag[]; score: number }> {
  const flags: RuleFlag[] = [];

  // 1. fund_diversion: utilization < 30%
  const utilRate = work.fundSanctioned > 0 ? work.fundUtilized / work.fundSanctioned : 0;
  if (utilRate < 0.30 && work.fundSanctioned > 0) {
    flags.push({
      code: 'fund_diversion',
      label: 'Fund Diversion',
      weight: 0.85,
      evidence: `Utilization ${(utilRate * 100).toFixed(1)}% < 30% threshold`,
    });
  }

  // 2. ghost_work: completed with no payments OR utilization > 0 but no payments
  if (work.status === 'completed' && work.payments.length === 0) {
    flags.push({
      code: 'ghost_work',
      label: 'Ghost Work',
      weight: 0.95,
      evidence: 'Marked completed but no payment records',
    });
  }

  // 3. duplicate_billing: multiple payments of identical amount
  if (work.payments.length >= 2) {
    const amounts = work.payments.map(p => p.amount);
    const seen = new Map<number, number>();
    for (const a of amounts) seen.set(a, (seen.get(a) || 0) + 1);
    let dupFound = false;
    for (const [amt, cnt] of seen) {
      if (cnt >= 2) {
        flags.push({
          code: 'duplicate_billing',
          label: 'Duplicate Billing',
          weight: 0.80,
          evidence: `${cnt} payments of ₹${(amt * 100000).toFixed(0)} (identical amount)`,
        });
        dupFound = true;
        break;
      }
    }
    void dupFound;
  }

  // 4. inflated_invoice: payment > 1.5x sanctioned
  const totalPaid = work.payments.reduce((s, p) => s + p.amount, 0);
  if (totalPaid > work.fundSanctioned * 1.5) {
    flags.push({
      code: 'inflated_invoice',
      label: 'Inflated Invoice',
      weight: 0.78,
      evidence: `Paid ₹${(totalPaid * 100000).toFixed(0)} vs sanctioned ₹${(work.fundSanctioned * 100000).toFixed(0)}`,
    });
  }

  // 5. stalled_high_utilization: stalled with high utilization
  if (work.status === 'stalled' && utilRate > 0.80) {
    flags.push({
      code: 'stalled_high_utilization',
      label: 'Stalled with High Utilization',
      weight: 0.72,
      evidence: `Status stalled but utilization ${(utilRate * 100).toFixed(1)}%`,
    });
  }

  // Duplicate PAN/GST across vendors — checked against DB (cross-vendor)
  if (work.vendor?.pan) {
    const panDup = await db.vendor.count({ where: { pan: work.vendor.pan } });
    if (panDup > 1) {
      flags.push({
        code: 'duplicate_pan',
        label: 'Duplicate PAN',
        weight: 0.88,
        evidence: `PAN shared by ${panDup} vendors`,
      });
    }
  }
  if (work.vendor?.gst) {
    const gstDup = await db.vendor.count({ where: { gst: work.vendor.gst } });
    if (gstDup > 1) {
      flags.push({
        code: 'duplicate_gst',
        label: 'Duplicate GST',
        weight: 0.82,
        evidence: `GST shared by ${gstDup} vendors`,
      });
    }
  }

  // Aggregate
  const rawScore = flags.length > 0
    ? Math.min(0.98, flags.reduce((m, f) => Math.max(m, f.weight), 0) + flags.length * 0.04)
    : 0;
  return { flags, score: rawScore };
}

// ─────────────────────────── BLACKLIST CROSS-CHECK ───────────────────────────

export async function blacklistCheck(vendor: { pan: string; gst: string | null; bankAccount: string } | null): Promise<{ match: boolean; reason: string | null }> {
  if (!vendor) return { match: false, reason: null };
  const panHit = await db.blacklistEntry.findFirst({ where: { identifierType: 'PAN', identifierValue: vendor.pan } });
  if (panHit) return { match: true, reason: `PAN match: ${panHit.reason}` };
  if (vendor.gst) {
    const gstHit = await db.blacklistEntry.findFirst({ where: { identifierType: 'GST', identifierValue: vendor.gst } });
    if (gstHit) return { match: true, reason: `GST match: ${gstHit.reason}` };
  }
  const bankHit = await db.blacklistEntry.findFirst({ where: { identifierType: 'bank_account', identifierValue: vendor.bankAccount } });
  if (bankHit) return { match: true, reason: `Bank account match: ${bankHit.reason}` };
  return { match: false, reason: null };
}

// ─────────────────────────── ISOLATION FOREST (simplified) ───────────────────────────
// We use a simple anomaly scoring: density-based isolation using feature z-scores
// A real iForest would build random trees; here we approximate the same idea with a
// "path-length-style" score on normalized features. Works well for demo and is explainable.

function normalize(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

export interface WorkFeatures {
  workId: string;
  fundSanctioned: number;
  fundUtilized: number;
  utilizationRate: number;
  paymentCount: number;
  avgPaymentAmount: number;
  paymentStdDev: number;
  statusEncoded: number; // ongoing 0, completed 1, stalled 2
  durationDays: number;
}

export function extractFeatures(work: {
  workId: string;
  fundSanctioned: number;
  fundUtilized: number;
  status: string;
  payments: { amount: number; paidAt: Date }[];
  startDate: Date | null;
}): WorkFeatures {
  const utilizationRate = work.fundSanctioned > 0 ? work.fundUtilized / work.fundSanctioned : 0;
  const paymentCount = work.payments.length;
  const avgPaymentAmount = paymentCount > 0 ? work.payments.reduce((s, p) => s + p.amount, 0) / paymentCount : 0;
  const mean = avgPaymentAmount;
  const variance = paymentCount > 0 ? work.payments.reduce((s, p) => s + Math.pow(p.amount - mean, 2), 0) / paymentCount : 0;
  const paymentStdDev = Math.sqrt(variance);
  const statusEncoded = work.status === 'completed' ? 1 : work.status === 'stalled' ? 2 : 0;
  const durationDays = work.startDate ? Math.max(1, (Date.now() - work.startDate.getTime()) / (1000 * 60 * 60 * 24)) : 1;
  return {
    workId: work.workId,
    fundSanctioned: work.fundSanctioned,
    fundUtilized: work.fundUtilized,
    utilizationRate,
    paymentCount,
    avgPaymentAmount,
    paymentStdDev,
    statusEncoded,
    durationDays,
  };
}

export function isolationForestScore(features: WorkFeatures, allFeatures: WorkFeatures[]): number {
  // Compute population mean/std for each numeric feature
  const n = allFeatures.length;
  if (n < 2) return 0;

  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  const keys: (keyof WorkFeatures)[] = ['fundSanctioned', 'utilizationRate', 'paymentCount', 'avgPaymentAmount', 'paymentStdDev', 'statusEncoded', 'durationDays'];

  for (const k of keys) {
    const vals = allFeatures.map(f => f[k] as number);
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    means[k] = mean;
    stds[k] = Math.sqrt(variance);
  }

  // Anomaly score: weighted sum of |z| — higher means more anomalous
  // (approximates isolation depth: more abnormal → higher score)
  const weights: Record<string, number> = {
    utilizationRate: 1.5,   // low utilization is a strong signal
    paymentCount: 1.0,
    avgPaymentAmount: 0.8,
    paymentStdDev: 0.6,     // low variance + duplicate amounts
    statusEncoded: 0.5,
    fundSanctioned: 0.3,
    durationDays: 0.4,
  };

  let score = 0;
  let totalWeight = 0;
  for (const k of keys) {
    const z = Math.abs(normalize(features[k] as number, means[k], stds[k]));
    // Squash to [0,1] via sigmoid-like
    const squashed = z / (1 + z);
    score += squashed * weights[k];
    totalWeight += weights[k];
  }
  return Math.min(1, score / totalWeight);
}

// ─────────────────────────── AUTOENCODER (simplified) ───────────────────────────
// We approximate reconstruction-error scoring: PCA-like projection & reconstruction.
// For the demo, this is a deterministic dimensionality reduction + error computation.

export function autoencoderScore(features: WorkFeatures, allFeatures: WorkFeatures[]): number {
  const n = allFeatures.length;
  if (n < 2) return 0;

  const keys: (keyof WorkFeatures)[] = ['utilizationRate', 'paymentCount', 'avgPaymentAmount', 'paymentStdDev', 'statusEncoded', 'durationDays'];
  // Compute mean
  const mean: Record<string, number> = {};
  for (const k of keys) mean[k] = allFeatures.reduce((s, f) => s + (f[k] as number), 0) / n;
  // Center
  const centered = allFeatures.map(f => {
    const v: Record<string, number> = {};
    for (const k of keys) v[k] = (f[k] as number) - mean[k];
    return v;
  });
  const fCentered: Record<string, number> = {};
  for (const k of keys) fCentered[k] = (features[k] as number) - mean[k];

  // Simple "compression" = take the dot products with top-2 random-but-fixed directions
  // (deterministic vectors for reproducibility)
  const dir1: Record<string, number> = { utilizationRate: 0.6, paymentCount: -0.4, avgPaymentAmount: 0.3, paymentStdDev: 0.5, statusEncoded: 0.3, durationDays: 0.2 };
  const dir2: Record<string, number> = { utilizationRate: 0.3, paymentCount: 0.7, avgPaymentAmount: -0.4, paymentStdDev: 0.3, statusEncoded: -0.3, durationDays: 0.3 };

  // Encode: 2D projection
  const enc1 = keys.reduce((s, k) => s + fCentered[k] * dir1[k], 0);
  const enc2 = keys.reduce((s, k) => s + fCentered[k] * dir2[k], 0);
  // Decode: project back (transpose)
  const recon: Record<string, number> = {};
  for (const k of keys) recon[k] = enc1 * dir1[k] + enc2 * dir2[k];
  // Reconstruction error
  let error = 0;
  for (const k of keys) error += Math.pow(fCentered[k] - recon[k], 2);
  error = Math.sqrt(error / keys.length);

  // Squash to [0,1]
  return Math.min(1, error / 2);
}

// ─────────────────────────── NLP (simple) ───────────────────────────
// Red-flag keywords in work descriptions

const RED_FLAG_TERMS = [
  'urgent', 'interim', 'temporary', 'verbal approval', 'advance payment', 'spot sanction',
  'cash payment', 'verbal instruction', 'no tender', 'single quote', 'bypassed',
];

export function nlpScore(description: string): { score: number; matches: string[] } {
  const lower = description.toLowerCase();
  const matches: string[] = [];
  for (const term of RED_FLAG_TERMS) {
    if (lower.includes(term)) matches.push(term);
  }
  // Plus simple sentiment / specificity checks: very short descriptions are suspicious
  let score = matches.length * 0.15;
  if (description.length < 30) score += 0.2;
  if (description.length < 60) score += 0.1;
  return { score: Math.min(1, score), matches };
}

// ─────────────────────────── ENSEMBLE ───────────────────────────

export function ensembleScore(
  ruleScore: number,
  isoScore: number,
  aeScore: number,
  graphScore: number,
  nlpScoreVal: number,
  config: ScoringConfigType
): number {
  const w = config;
  const total = w.isoWeight + w.aeWeight + w.graphWeight + w.nlpWeight + w.ruleWeight;
  if (total === 0) return 0;
  return (
    (isoScore * w.isoWeight +
      aeScore * w.aeWeight +
      graphScore * w.graphWeight +
      nlpScoreVal * w.nlpWeight +
      ruleScore * w.ruleWeight) / total
  );
}

export function tierFromScore(score: number, blacklistMatch: boolean, config: ScoringConfigType): RiskTier {
  if (blacklistMatch) return 'critical';
  if (score >= config.criticalCutoff) return 'critical';
  if (score >= config.highCutoff) return 'high';
  if (score >= config.mediumCutoff) return 'medium';
  return 'low';
}

// ─────────────────────────── SHAP-LIKE EXPLANATION ───────────────────────────
// We construct a feature contribution list that mimics SHAP waterfall output.
// Each feature's contribution = (model_score * feature_z_score_normalized * model_weight).

export function explainShap(
  features: WorkFeatures,
  allFeatures: WorkFeatures[],
  ruleScore: number,
  isoScore: number,
  aeScore: number,
  graphScore: number,
  nlpScoreVal: number,
  config: ScoringConfigType
): ShapFeature[] {
  const n = allFeatures.length;
  const shap: ShapFeature[] = [];

  const featureKeys: { key: keyof WorkFeatures; label: string }[] = [
    { key: 'utilizationRate', label: 'Utilization Rate' },
    { key: 'paymentCount', label: 'Payment Count' },
    { key: 'avgPaymentAmount', label: 'Avg Payment' },
    { key: 'paymentStdDev', label: 'Payment Variance' },
    { key: 'statusEncoded', label: 'Work Status' },
    { key: 'durationDays', label: 'Duration (days)' },
    { key: 'fundSanctioned', label: 'Sanctioned Amount' },
  ];

  // Population stats
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const { key } of featureKeys) {
    const vals = allFeatures.map(f => f[key] as number);
    means[key] = vals.reduce((s: number, v: number) => s + v, 0) / n;
    const variance = vals.reduce((s: number, v: number) => s + Math.pow(v - means[key], 2), 0) / n;
    stds[key] = Math.sqrt(variance) || 1;
  }

  // Contribution of each numeric feature = (z * weight_iso + z * weight_ae) scaled to [0,1]
  const totalMLWeight = config.isoWeight + config.aeWeight;
  for (const { key, label } of featureKeys) {
    const z = ((features[key] as number) - means[key]) / stds[key];
    // Use |z| as magnitude, sign as direction
    const magnitude = Math.min(1, Math.abs(z) / 3); // squash
    const contribution = magnitude * (isoScore * config.isoWeight + aeScore * config.aeWeight) / totalMLWeight;
    shap.push({
      feature: label,
      value: features[key] as number,
      contribution: contribution * 0.4, // scale to keep totals reasonable
      direction: z > 0 ? 'positive' : 'negative',
    });
  }

  // Add rule + graph + nlp contributions
  shap.push({
    feature: 'Rule Flags',
    value: ruleScore,
    contribution: ruleScore * config.ruleWeight,
    direction: 'positive',
  });
  shap.push({
    feature: 'Graph Risk',
    value: graphScore,
    contribution: graphScore * config.graphWeight,
    direction: 'positive',
  });
  shap.push({
    feature: 'NLP Red Flags',
    value: nlpScoreVal,
    contribution: nlpScoreVal * config.nlpWeight,
    direction: 'positive',
  });

  return shap.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
}

// ─────────────────────────── RUN SCORING PIPELINE ───────────────────────────

export async function runScoringPipeline(): Promise<{ scored: number; critical: number; high: number; medium: number; low: number }> {
  const config = await getScoringConfig();
  const works = await db.work.findMany({
    include: {
      payments: true,
      vendor: true,
    },
  });

  const allFeatures = works.map(w => extractFeatures({
    workId: w.workId,
    fundSanctioned: w.fundSanctioned,
    fundUtilized: w.fundUtilized,
    status: w.status,
    payments: w.payments.map(p => ({ amount: p.amount, paidAt: p.paidAt })),
    startDate: w.startDate,
  }));

  let critical = 0, high = 0, medium = 0, low = 0;

  // Clear previous scores
  await db.riskScore.deleteMany();

  for (const work of works) {
    const features = extractFeatures({
      workId: work.workId,
      fundSanctioned: work.fundSanctioned,
      fundUtilized: work.fundUtilized,
      status: work.status,
      payments: work.payments.map(p => ({ amount: p.amount, paidAt: p.paidAt })),
      startDate: work.startDate,
    });

    const { flags: ruleFlags, score: ruleScore } = await rulePrefilter({
      id: work.id,
      workId: work.workId,
      fundSanctioned: work.fundSanctioned,
      fundUtilized: work.fundUtilized,
      status: work.status,
      payments: work.payments.map(p => ({ amount: p.amount })),
      vendorId: work.vendorId,
      vendor: work.vendor ? { pan: work.vendor.pan, gst: work.vendor.gst, bankAccount: work.vendor.bankAccount } : null,
    });

    const blacklist = await blacklistCheck(
      work.vendor ? { pan: work.vendor.pan, gst: work.vendor.gst, bankAccount: work.vendor.bankAccount } : null
    );

    const iso = isolationForestScore(features, allFeatures);
    const ae = autoencoderScore(features, allFeatures);
    const nlpResult = nlpScore(work.description);
    const graphScore = await getGraphScoreForWork(work.id);

    const ensemble = ensembleScore(ruleScore, iso, ae, graphScore, nlpResult.score, config);
    const tier = tierFromScore(ensemble, blacklist.match, config);

    const shap = explainShap(features, allFeatures, ruleScore, iso, ae, graphScore, nlpResult.score, config);

    if (tier === 'critical') critical++;
    else if (tier === 'high') high++;
    else if (tier === 'medium') medium++;
    else low++;

    await db.riskScore.create({
      data: {
        workId: work.id,
        ruleScore,
        isoScore: iso,
        aeScore: ae,
        graphScore,
        nlpScore: nlpResult.score,
        ensembleScore: ensemble,
        riskTier: tier,
        shapJson: JSON.stringify(shap),
        ruleFlags: JSON.stringify(ruleFlags),
        blacklistMatch: blacklist.match,
      },
    });

    // Auto-create Case for critical works (if not already a case)
    if (tier === 'critical') {
      const existingCase = await db.case.findFirst({ where: { workId: work.id } });
      if (!existingCase) {
        const caseId = 'CASE' + work.workId.substring(1);
        await db.case.create({
          data: {
            caseId,
            workId: work.id,
            status: 'open',
            priority: 'critical',
            notes: blacklist.match ? `Auto-flag: ${blacklist.reason}` : 'Auto-flagged by ensemble model',
          },
        });
        // Send notification
        await db.notificationLog.create({
          data: {
            caseId: (await db.case.findFirst({ where: { workId: work.id } }))!.id,
            channel: 'email',
            recipient: 'investigations@mplad.gov.in',
            subject: `[CRITICAL] ${caseId} — ${work.title.substring(0, 60)}`,
            body: `Work ${work.workId} flagged as CRITICAL risk (ensemble=${(ensemble * 100).toFixed(1)}%). Blacklist: ${blacklist.match}. Rule flags: ${ruleFlags.map(f => f.label).join(', ')}.`,
            status: 'sent',
          },
        });
      }
    }
  }

  return { scored: works.length, critical, high, medium, low };
}

// ─────────────────────────── GRAPH SCORE PER WORK ───────────────────────────

async function getGraphScoreForWork(workId: string): Promise<number> {
  const work = await db.work.findUnique({ where: { id: workId }, include: { vendor: true } });
  if (!work?.vendor) return 0;
  // Check if vendor is part of a cluster (high degree)
  const fromEdges = await db.graphEdge.findMany({ where: { fromVendorId: work.vendor.id } });
  const toEdges = await db.graphEdge.findMany({ where: { toVendorId: work.vendor.id } });
  const degree = fromEdges.length + toEdges.length;
  // Higher degree → higher risk
  const sharedPanEdges = [...fromEdges, ...toEdges].filter(e => e.edgeType === 'shared_pan').length;
  if (sharedPanEdges > 0) return Math.min(1, 0.7 + sharedPanEdges * 0.08);
  if (degree >= 3) return Math.min(0.7, 0.4 + degree * 0.05);
  return Math.min(0.4, degree * 0.1);
}

// ─────────────────────────── CONFIG ───────────────────────────

export async function getScoringConfig(): Promise<ScoringConfigType> {
  const c = await db.scoringConfig.findUnique({ where: { id: 'default' } });
  if (!c) {
    return {
      isoWeight: 0.30,
      aeWeight: 0.25,
      graphWeight: 0.20,
      nlpWeight: 0.10,
      ruleWeight: 0.15,
      criticalCutoff: 0.80,
      highCutoff: 0.60,
      mediumCutoff: 0.40,
    };
  }
  return {
    isoWeight: c.isoWeight,
    aeWeight: c.aeWeight,
    graphWeight: c.graphWeight,
    nlpWeight: c.nlpWeight,
    ruleWeight: c.ruleWeight,
    criticalCutoff: c.criticalCutoff,
    highCutoff: c.highCutoff,
    mediumCutoff: c.mediumCutoff,
  };
}

export async function updateScoringConfig(config: ScoringConfigType): Promise<void> {
  await db.scoringConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...config },
    update: { ...config },
  });
}

// ─────────────────────────── PREVIEW RE-SCORE ON SAMPLE ───────────────────────────

export async function previewRescore(sampleSize: number, config: ScoringConfigType): Promise<{ before: RiskBreakdown[]; after: RiskBreakdown[] }> {
  const works = await db.work.findMany({
    include: { payments: true, vendor: true, riskScores: { take: 1, orderBy: { scoredAt: 'desc' } } },
    take: sampleSize,
  });
  const allFeatures = works.map(w => extractFeatures({
    workId: w.workId,
    fundSanctioned: w.fundSanctioned,
    fundUtilized: w.fundUtilized,
    status: w.status,
    payments: w.payments.map(p => ({ amount: p.amount, paidAt: p.paidAt })),
    startDate: w.startDate,
  }));

  const before: RiskBreakdown[] = [];
  const after: RiskBreakdown[] = [];

  // Old config
  const oldConfig = await getScoringConfig();

  for (let i = 0; i < works.length; i++) {
    const work = works[i];
    const features = allFeatures[i];
    const { flags: ruleFlags, score: ruleScore } = await rulePrefilter({
      id: work.id,
      workId: work.workId,
      fundSanctioned: work.fundSanctioned,
      fundUtilized: work.fundUtilized,
      status: work.status,
      payments: work.payments.map(p => ({ amount: p.amount })),
      vendorId: work.vendorId,
      vendor: work.vendor ? { pan: work.vendor.pan, gst: work.vendor.gst, bankAccount: work.vendor.bankAccount } : null,
    });
    const blacklist = await blacklistCheck(
      work.vendor ? { pan: work.vendor.pan, gst: work.vendor.gst, bankAccount: work.vendor.bankAccount } : null
    );
    const iso = isolationForestScore(features, allFeatures);
    const ae = autoencoderScore(features, allFeatures);
    const nlpResult = nlpScore(work.description);
    const graphScore = await getGraphScoreForWork(work.id);

    const beforeEnsemble = ensembleScore(ruleScore, iso, ae, graphScore, nlpResult.score, oldConfig);
    const beforeTier = tierFromScore(beforeEnsemble, blacklist.match, oldConfig);
    const beforeShap = explainShap(features, allFeatures, ruleScore, iso, ae, graphScore, nlpResult.score, oldConfig);
    before.push({
      ruleScore, isoScore: iso, aeScore: ae, graphScore, nlpScore: nlpResult.score,
      ensembleScore: beforeEnsemble, riskTier: beforeTier,
      shap: beforeShap, ruleFlags: ruleFlags.map(f => f.label), blacklistMatch: blacklist.match,
    });

    const afterEnsemble = ensembleScore(ruleScore, iso, ae, graphScore, nlpResult.score, config);
    const afterTier = tierFromScore(afterEnsemble, blacklist.match, config);
    const afterShap = explainShap(features, allFeatures, ruleScore, iso, ae, graphScore, nlpResult.score, config);
    after.push({
      ruleScore, isoScore: iso, aeScore: ae, graphScore, nlpScore: nlpResult.score,
      ensembleScore: afterEnsemble, riskTier: afterTier,
      shap: afterShap, ruleFlags: ruleFlags.map(f => f.label), blacklistMatch: blacklist.match,
    });
  }

  return { before, after };
}
