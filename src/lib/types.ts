// Shared types for MPLAD Sentinel

export type Role = 'admin' | 'analyst' | 'auditor' | 'citizen';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus = 'open' | 'investigating' | 'escalated' | 'resolved' | 'closed';

export interface ShapFeature {
  feature: string;
  value: number;
  contribution: number;
  direction: 'positive' | 'negative';
}

export interface RiskBreakdown {
  ruleScore: number;
  isoScore: number;
  aeScore: number;
  graphScore: number;
  nlpScore: number;
  ensembleScore: number;
  riskTier: RiskTier;
  shap: ShapFeature[];
  ruleFlags: string[];
  blacklistMatch: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  group: number;
  riskScore: number;
  degree: number;
  isRing: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  weight: number;
}

export interface KpiSummary {
  totalWorks: number;
  totalSanctioned: number;
  totalUtilized: number;
  utilizationRate: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  openCases: number;
  resolvedCases: number;
  citizenReports: number;
  flaggedVendors: number;
}

export interface StateMapSummary {
  stateId: string;
  stateName: string;
  stateCode: string;
  totalWorks: number;
  totalSanctioned: number;
  totalUtilized: number;
  utilizationRate: number;
  criticalCount: number;
  highCount: number;
  transparencyScore: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  type: 'mp' | 'district';
  stateName: string;
  totalWorks: number;
  utilizationRate: number;
  flagRate: number;
  resolutionRate: number;
  transparencyScore: number;
}

export interface CaseDetail {
  id: string;
  caseId: string;
  status: CaseStatus;
  priority: string;
  work: {
    workId: string;
    title: string;
    category: string;
    fundSanctioned: number;
    fundUtilized: number;
    vendorName: string;
    stateName: string;
  };
  risk: RiskBreakdown;
  auditLog: AuditLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorName: string;
  timestamp: string;
  prevHash: string;
  thisHash: string;
  payload?: string;
  verified: boolean;
}

export interface ScoringConfigType {
  isoWeight: number;
  aeWeight: number;
  graphWeight: number;
  nlpWeight: number;
  ruleWeight: number;
  criticalCutoff: number;
  highCutoff: number;
  mediumCutoff: number;
}
