// Grounded investigator copilot — uses z-ai-web-dev-sdk LLM, strictly grounded in case data.
// Refuses/deflects questions outside the case's data; cites source fields.
import ZAI from 'z-ai-web-dev-sdk';
import { db } from './db';
import { getScoringConfig } from './scoring';

export interface CopilotSource {
  field: string;
  value: string;
}

export interface CopilotAnswer {
  answer: string;
  sources: CopilotSource[];
  refused: boolean;
}

const GROUNDING_SYSTEM = `You are MPLAD Sentinel's investigator copilot.
Your job: answer ONLY questions that can be answered from the structured case data provided in the context.
Rules:
1. NEVER invent numbers, vendor names, dates, or scores. If the answer is not in the context, say "I don't have that information in this case's data — please check the case file or run a new scoring pass."
2. Always cite the source field after the answer, in the form: [source: fieldName]
3. If the user asks a question that is clearly out of scope (e.g., about other cases, general policy questions, off-topic queries), politely decline: "I can only answer questions about this specific case's data."
4. Keep answers concise (2-4 sentences), investigator-facing, factual.
5. If asked about sensitive PII (PAN/bank account), say: "PII is masked by default. An admin must use the Reveal action."
6. Do NOT speculate about the user's intent — only respond to what is explicitly asked and answerable from the context.`;

export async function askCopilot(caseId: string, question: string): Promise<CopilotAnswer> {
  const caseRecord = await db.case.findUnique({
    where: { id: caseId },
    include: {
      work: {
        include: {
          vendor: true,
          payments: true,
          riskScores: { take: 1, orderBy: { scoredAt: 'desc' } },
        },
      },
      auditLog: { orderBy: { timestamp: 'asc' } },
    },
  });

  if (!caseRecord) {
    return {
      answer: "Case not found.",
      sources: [],
      refused: true,
    };
  }

  // Build context — only structured case data, masked
  const work = caseRecord.work;
  const vendor = work.vendor;
  const latestRisk = work.riskScores[0];
  const config = await getScoringConfig();

  const context = {
    case: {
      caseId: caseRecord.caseId,
      status: caseRecord.status,
      priority: caseRecord.priority,
      createdAt: caseRecord.createdAt.toISOString(),
      notes: caseRecord.notes,
      auditEntries: caseRecord.auditLog.length,
    },
    work: {
      workId: work.workId,
      title: work.title,
      description: work.description,
      category: work.category,
      fundSanctioned: work.fundSanctioned,
      fundUtilized: work.fundUtilized,
      utilizationRate: ((work.fundUtilized / Math.max(1, work.fundSanctioned)) * 100).toFixed(1) + '%',
      status: work.status,
      startDate: work.startDate?.toISOString(),
    },
    vendor: vendor ? {
      vendorId: vendor.vendorId,
      name: vendor.name,
      panMasked: vendor.pan.substring(0, 3) + 'XXXXX' + vendor.pan.substring(8),
      stateName: vendor.state ? undefined : 'unknown',
    } : null,
    payments: work.payments.map(p => ({
      amount: p.amount,
      paidAt: p.paidAt.toISOString(),
      instrument: p.instrument,
      reference: p.reference,
    })),
    risk: latestRisk ? {
      ruleScore: latestRisk.ruleScore,
      isoScore: latestRisk.isoScore,
      aeScore: latestRisk.aeScore,
      graphScore: latestRisk.graphScore,
      nlpScore: latestRisk.nlpScore,
      ensembleScore: latestRisk.ensembleScore,
      riskTier: latestRisk.riskTier,
      ruleFlags: JSON.parse(latestRisk.ruleFlags || '[]'),
      blacklistMatch: latestRisk.blacklistMatch,
      shap: JSON.parse(latestRisk.shapJson).map((s: { feature: string; contribution: number; direction: string }) => ({
        feature: s.feature,
        contribution: s.contribution.toFixed(3),
        direction: s.direction,
      })),
    } : null,
    config,
  };

  const userPrompt = `Case context (JSON):
${JSON.stringify(context, null, 2)}

Investigator question: ${question}

Answer strictly from the context above. If the question cannot be answered from this data, refuse politely.`;

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: GROUNDING_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 400,
    });
    const answer = completion.choices[0]?.message?.content || 'No answer generated.';

    // Extract source citations [source: fieldName] from the answer
    const sourceMatches = [...answer.matchAll(/\[source:\s*([^\]]+)\]/g)];
    const sources: CopilotSource[] = sourceMatches.map(m => ({
      field: m[1].trim(),
      value: extractFieldValue(context, m[1].trim()),
    }));

    const refused = /I don't have that information|I can only answer|please check the case file/i.test(answer);

    return { answer, sources, refused };
  } catch (e) {
    console.error('[copilot] error:', e);
    // Fallback answer built from raw data
    const fallback = buildFallback(context, question);
    return { answer: fallback.answer, sources: fallback.sources, refused: false };
  }
}

function extractFieldValue(context: Record<string, unknown>, field: string): string {
  const parts = field.split('.');
  let curr: unknown = context;
  for (const p of parts) {
    if (curr && typeof curr === 'object' && p in (curr as Record<string, unknown>)) {
      curr = (curr as Record<string, unknown>)[p];
    } else {
      return '(not found)';
    }
  }
  return typeof curr === 'string' ? curr : JSON.stringify(curr);
}

function buildFallback(context: Record<string, unknown>, question: string): { answer: string; sources: CopilotSource[] } {
  const q = question.toLowerCase();
  const work = context.work as Record<string, unknown>;
  const risk = context.risk as Record<string, unknown> | null;
  const vendor = context.vendor as Record<string, unknown> | null;

  if (/risk|score|tier|why/.test(q) && risk) {
    return {
      answer: `This case is rated ${risk.riskTier} (ensemble score ${(Number(risk.ensembleScore) * 100).toFixed(1)}%). Top contributors: rule=${(Number(risk.ruleScore) * 100).toFixed(0)}%, isolation forest=${(Number(risk.isoScore) * 100).toFixed(0)}%, graph=${(Number(risk.graphScore) * 100).toFixed(0)}%. [source: risk.riskTier] [source: risk.ensembleScore]`,
      sources: [
        { field: 'risk.riskTier', value: String(risk.riskTier) },
        { field: 'risk.ensembleScore', value: String(risk.ensembleScore) },
      ],
    };
  }
  if (/vendor|contractor/.test(q) && vendor) {
    return {
      answer: `The vendor for this work is ${vendor.name} (ID: ${vendor.vendorId}). PAN is masked: ${vendor.panMasked}. [source: vendor.name] [source: vendor.panMasked]`,
      sources: [
        { field: 'vendor.name', value: String(vendor.name) },
        { field: 'vendor.panMasked', value: String(vendor.panMasked) },
      ],
    };
  }
  if (/fund|amount|utili/.test(q)) {
    return {
      answer: `Work ${work.workId}: ₹${work.fundSanctioned}L sanctioned, ₹${work.fundUtilized}L utilized (${work.utilizationRate}). [source: work.fundSanctioned] [source: work.fundUtilized]`,
      sources: [
        { field: 'work.fundSanctioned', value: String(work.fundSanctioned) },
        { field: 'work.fundUtilized', value: String(work.fundUtilized) },
      ],
    };
  }
  return {
    answer: `I don't have enough information to answer that for this case. The case file shows: ${work.title}. [source: work.title]`,
    sources: [{ field: 'work.title', value: String(work.title) }],
  };
}
