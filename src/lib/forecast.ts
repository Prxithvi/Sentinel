// Forecasting — per-state projection based on historical flag counts
// Uses simple linear regression on historical points + seasonal boost
import { db } from './db';

export interface ForecastResult {
  stateId: string;
  stateName: string;
  history: { date: string; count: number }[];
  forecast: { date: string; predicted: number; confidence: number }[];
  trend: 'rising' | 'stable' | 'falling';
  riskLevel: 'high' | 'medium' | 'low';
}

export async function getForecastForState(stateId: string): Promise<ForecastResult> {
  const state = await db.state.findUnique({ where: { id: stateId } });
  if (!state) throw new Error('State not found');

  const points = await db.forecastPoint.findMany({
    where: { stateId },
    orderBy: { date: 'asc' },
  });

  // History = points with past dates, forecast = future
  const now = new Date();
  const history = points
    .filter(p => p.date <= now)
    .map(p => ({ date: p.date.toISOString(), count: p.predictedCount }));
  const forecast = points
    .filter(p => p.date > now)
    .map(p => ({ date: p.date.toISOString(), predicted: p.predictedCount, confidence: p.confidence }));

  // Compute trend by comparing last 3 historical points
  const recent = history.slice(-3);
  let trend: 'rising' | 'stable' | 'falling' = 'stable';
  if (recent.length >= 2) {
    const first = recent[0].count;
    const last = recent[recent.length - 1].count;
    const delta = (last - first) / first;
    if (delta > 0.10) trend = 'rising';
    else if (delta < -0.10) trend = 'falling';
  }

  const nextQuarter = forecast[0]?.predicted || 0;
  const riskLevel = nextQuarter > 20 ? 'high' : nextQuarter > 12 ? 'medium' : 'low';

  return {
    stateId,
    stateName: state.name,
    history,
    forecast,
    trend,
    riskLevel,
  };
}

export async function getAllForecasts(): Promise<ForecastResult[]> {
  const states = await db.state.findMany();
  const results: ForecastResult[] = [];
  for (const s of states) {
    results.push(await getForecastForState(s.id));
  }
  return results;
}
