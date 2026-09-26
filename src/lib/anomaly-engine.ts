export type WorkForAnalysis = {
  id: string;
  workId: string;
  title: string;

  category?: string | null;
  sector?: string | null;
  subSector?: string | null;

  fundSanctioned: number;
  fundUtilized: number;

  physicalProgress?: number | null;
  financialProgress?: number | null;

  startDate?: Date | null;
  endDate?: Date | null;
  completionDate?: Date | null;

  status?: string | null;
};

export type Indicator = {
  code: string;
  category: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(a: Date, b: Date) {
  return Math.max(
    0,
    Math.ceil(
      Math.abs(b.getTime() - a.getTime()) /
        (1000 * 60 * 60 * 24)
    )
  );
}

export function analyzeWork(
  work: WorkForAnalysis,
  comparableWorks: WorkForAnalysis[]
) {
  const indicators: Indicator[] = [];

  /*
   * 1. Financial utilization anomaly
   */
  if (work.fundSanctioned > 0) {
    const utilization =
      (work.fundUtilized / work.fundSanctioned) * 100;

    if (utilization > 100) {
      indicators.push({
        code: "OVER_UTILIZATION",
        category: "FINANCIAL",
        severity: "HIGH",
        score: clamp(
          60 + (utilization - 100) * 2
        ),
        title: "Utilization exceeds sanctioned amount",
        explanation:
          "Reported expenditure is greater than the sanctioned amount and requires verification.",
        evidence: {
          sanctioned: work.fundSanctioned,
          utilized: work.fundUtilized,
          utilization,
        },
      });
    }
  }

  /*
   * 2. Financial vs physical progress mismatch
   */
  if (
    work.physicalProgress != null &&
    work.financialProgress != null
  ) {
    const difference =
      Math.abs(
        work.financialProgress -
          work.physicalProgress
      );

    if (difference >= 30) {
      indicators.push({
        code: "PROGRESS_MISMATCH",
        category: "PROGRESS",
        severity:
          difference >= 50
            ? "HIGH"
            : "MEDIUM",
        score: clamp(difference),
        title: "Financial and physical progress differ",
        explanation:
          "The reported financial and physical progress differ substantially.",
        evidence: {
          physicalProgress:
            work.physicalProgress,
          financialProgress:
            work.financialProgress,
          difference,
        },
      });
    }
  }

  /*
   * 3. Timeline anomaly
   */
  if (work.endDate) {
    const now = new Date();

    if (
      now > work.endDate &&
      work.status?.toLowerCase() !== "completed"
    ) {
      const delayDays = daysBetween(
        work.endDate,
        now
      );

      const score = clamp(
        Math.min(
          95,
          40 + delayDays / 10
        )
      );

      indicators.push({
        code: "TIMELINE_DELAY",
        category: "TIMELINE",
        severity:
          delayDays > 365
            ? "HIGH"
            : delayDays > 180
            ? "MEDIUM"
            : "LOW",
        score,
        title: "Work appears delayed",
        explanation:
          "The expected completion date has passed while the work is not recorded as completed.",
        evidence: {
          expectedCompletion:
            work.endDate.toISOString(),
          daysOverdue: delayDays,
          status: work.status,
        },
      });
    }
  }

  /*
   * 4. Cost anomaly against comparable works
   */
  const validComparable =
    comparableWorks.filter(
      (item) =>
        item.fundSanctioned > 0 &&
        item.id !== work.id
    );

  if (validComparable.length >= 5) {
    const costs = validComparable
      .map((item) => item.fundSanctioned)
      .sort((a, b) => a - b);

    const middle =
      Math.floor(costs.length / 2);

    const median =
      costs.length % 2 === 0
        ? (costs[middle - 1] +
            costs[middle]) /
          2
        : costs[middle];

    if (median > 0) {
      const ratio =
        work.fundSanctioned / median;

      if (ratio >= 2) {
        indicators.push({
          code: "COST_DEVIATION",
          category: "FINANCIAL",
          severity:
            ratio >= 3
              ? "HIGH"
              : "MEDIUM",
          score: clamp(
            50 + (ratio - 2) * 20
          ),
          title:
            "Sanctioned amount differs from comparable works",
          explanation:
            "The sanctioned amount is substantially above the median of the selected comparable works.",
          evidence: {
            sanctioned:
              work.fundSanctioned,
            comparableMedian: median,
            ratio,
            comparableCount:
              validComparable.length,
          },
        });
      }
    }
  }

  /*
   * 5. Simple status inconsistency
   */
  const status =
    work.status?.toLowerCase() || "";

  if (
    status.includes("completed") &&
    work.physicalProgress != null &&
    work.physicalProgress < 90
  ) {
    indicators.push({
      code: "STATUS_PROGRESS_MISMATCH",
      category: "STATUS",
      severity: "HIGH",
      score: 75,
      title:
        "Completion status conflicts with progress",
      explanation:
        "The work is marked completed while reported physical progress is below 90%.",
      evidence: {
        status: work.status,
        physicalProgress:
          work.physicalProgress,
      },
    });
  }

  /*
   * Final score
   */
  let score = 0;

  if (indicators.length > 0) {
    const weighted =
      indicators.reduce(
        (sum, indicator) =>
          sum + indicator.score,
        0
      ) / indicators.length;

    // More independent indicators = slightly higher confidence,
    // but cap the result.
    const multiplier =
      Math.min(
        1.25,
        1 + (indicators.length - 1) * 0.08
      );

    score = clamp(
      weighted * multiplier
    );
  }

  let riskTier = "LOW";

  if (score >= 80) {
    riskTier = "CRITICAL";
  } else if (score >= 60) {
    riskTier = "HIGH";
  } else if (score >= 40) {
    riskTier = "MEDIUM";
  }

  return {
    score: Number(score.toFixed(2)),
    riskTier,
    indicators,
  };
}