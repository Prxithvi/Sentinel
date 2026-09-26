import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Indicator = {
  code: string;
  category: string;
  severity: string;
  evidence: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function getRiskTier(score: number) {
  if (score >= 0.8) return "CRITICAL";
  if (score >= 0.6) return "HIGH";
  if (score >= 0.4) return "MEDIUM";
  return "LOW";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const workId =
      typeof body?.workId === "string" ? body.workId.trim() : "";

    if (!workId) {
      return NextResponse.json(
        {
          success: false,
          error: "workId is required",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // Find the work using the public Work ID
    // ---------------------------------------------------------

    const work = await prisma.work.findUnique({
      where: {
        workId,
      },
      include: {
        payments: true,
        vendor: true,
      },
    });

    if (!work) {
      return NextResponse.json(
        {
          success: false,
          error: "Work not found",
          workId,
        },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // Basic deterministic risk analysis
    // ---------------------------------------------------------

    const indicators: Indicator[] = [];

    const sanctioned = Number(work.fundSanctioned) || 0;
    const utilized = Number(work.fundUtilized) || 0;

    const utilizationRatio =
      sanctioned > 0 ? utilized / sanctioned : 0;

    // Rule 1: utilization exceeds sanctioned amount
    if (utilizationRatio > 1) {
      indicators.push({
        code: "UTILIZATION_OVER_SANCTION",
        category: "financial",
        severity: "critical",
        evidence: `Utilized amount is ${(utilizationRatio * 100).toFixed(
          1
        )}% of the sanctioned amount.`,
      });
    } else if (utilizationRatio > 0.9) {
      indicators.push({
        code: "HIGH_UTILIZATION",
        category: "financial",
        severity: "medium",
        evidence: `Utilization is ${(utilizationRatio * 100).toFixed(
          1
        )}% of the sanctioned amount.`,
      });
    }

    // Rule 2: no vendor
    if (!work.vendorId) {
      indicators.push({
        code: "MISSING_VENDOR",
        category: "vendor",
        severity: "medium",
        evidence: "No vendor is associated with this work.",
      });
    }

    // Rule 3: payment mismatch
    const totalPayments = work.payments.reduce(
      (sum, payment) => sum + (Number(payment.amount) || 0),
      0
    );

    if (totalPayments > sanctioned && sanctioned > 0) {
      indicators.push({
        code: "PAYMENTS_OVER_SANCTION",
        category: "financial",
        severity: "critical",
        evidence: `Recorded payments exceed the sanctioned amount.`,
      });
    }

    // Rule 4: utilization/payment mismatch
    if (
      totalPayments > 0 &&
      utilized > 0 &&
      Math.abs(totalPayments - utilized) / utilized > 0.25
    ) {
      indicators.push({
        code: "PAYMENT_UTILIZATION_MISMATCH",
        category: "financial",
        severity: "medium",
        evidence:
          "Recorded payments differ materially from reported utilization.",
      });
    }

    // ---------------------------------------------------------
    // Rule score
    // ---------------------------------------------------------

    let ruleScore = 0;

    for (const indicator of indicators) {
      if (indicator.severity === "critical") {
        ruleScore += 0.4;
      } else if (indicator.severity === "medium") {
        ruleScore += 0.2;
      } else {
        ruleScore += 0.1;
      }
    }

    ruleScore = clamp(ruleScore);

    // ---------------------------------------------------------
    // Simple anomaly score based on financial utilization
    // ---------------------------------------------------------

    let aeScore = 0;

    if (utilizationRatio > 1) {
      aeScore = 0.95;
    } else if (utilizationRatio > 0.9) {
      aeScore = 0.7;
    } else if (utilizationRatio > 0.8) {
      aeScore = 0.4;
    }

    // ---------------------------------------------------------
    // Placeholder component scores
    //
    // These remain 0 until graph / NLP / isolation models
    // are actually connected.
    // ---------------------------------------------------------

    const isoScore = 0;
    const graphScore = 0;
    const nlpScore = 0;

    // ---------------------------------------------------------
    // Ensemble score
    //
    // Same weights as ScoringConfig in your Prisma schema:
    // rule 15%
    // isolation 30%
    // anomaly engine 25%
    // graph 20%
    // NLP 10%
    // ---------------------------------------------------------

    const ensembleScore = clamp(
      ruleScore * 0.15 +
        isoScore * 0.3 +
        aeScore * 0.25 +
        graphScore * 0.2 +
        nlpScore * 0.1
    );

    const riskTier = getRiskTier(ensembleScore);

    // ---------------------------------------------------------
    // Explainability data
    // ---------------------------------------------------------

    const shapJson = JSON.stringify({
      ruleScore,
      isoScore,
      aeScore,
      graphScore,
      nlpScore,
      ensembleScore,
      utilizationRatio,
      totalPayments,
      indicators,
    });

    const ruleFlags =
      indicators.length > 0
        ? JSON.stringify(indicators.map((item) => item.code))
        : JSON.stringify([]);

    // ---------------------------------------------------------
    // Save RiskScore
    //
    // IMPORTANT:
    // RiskScore.workId references Work.id, NOT Work.workId.
    // ---------------------------------------------------------

    const riskScore = await prisma.riskScore.create({
      data: {
        workId: work.id,

        ruleScore,
        isoScore,
        aeScore,
        graphScore,
        nlpScore,

        ensembleScore,
        riskTier,

        shapJson,
        ruleFlags,

        blacklistMatch: false,
      },
    });

    // ---------------------------------------------------------
    // Response
    // ---------------------------------------------------------

    return NextResponse.json({
      success: true,

      work: {
        id: work.id,
        workId: work.workId,
        title: work.title,
        category: work.category,
      },

      riskScore: {
        id: riskScore.id,
        ruleScore: riskScore.ruleScore,
        isoScore: riskScore.isoScore,
        aeScore: riskScore.aeScore,
        graphScore: riskScore.graphScore,
        nlpScore: riskScore.nlpScore,
        ensembleScore: riskScore.ensembleScore,
        riskTier: riskScore.riskTier,
        blacklistMatch: riskScore.blacklistMatch,
      },

      analysis: {
        utilizationRatio,
        totalPayments,
        indicators,
      },
    });
  } catch (error) {
    console.error("AI ANALYSIS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to analyze work",
        details:
          error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}