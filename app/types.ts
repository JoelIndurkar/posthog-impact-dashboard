export interface WeeklyActivity {
  week: string;
  prCount: number;
}

export interface ExecutionQualityMetrics {
  mergeCadence: number;
  leadTime: number;
  changeFailureRate: number;
  recencyScore: number;
  prEffortScore: number;
}

export interface DoraMetrics {
  mergeFrequency: number;
  leadTime: number;
  changeFailureRate: number;
  recencyScore: number;
}

export interface Engineer {
  login: string;
  avatar_url: string;
  // Pillar 1: Execution Quality
  executionQuality: ExecutionQualityMetrics;
  executionQualityScore: number;
  // Pillar 2: Collaboration
  collaborationScore: number;
  pageRankScore: number;
  // Pillar 3: Code Health
  churnRate: number;
  churnScore: number;
  mergeReliability: number;
  codeHealthScore: number;
  // Final
  impactScore: number;
  // Display metrics
  prEffortScore: number;
  avgCommentsPerReview: number;
  // Activity
  summary: string;
  reviewsGiven: number;
  reviewsReceived: number;
  prsAuthored: number;
  prsMerged: number;
  weeklyActivity: WeeklyActivity[];
  // Legacy compat for graph panel
  doraScore: number;
  dora: DoraMetrics;
}

export interface GraphNode {
  id: string;
  doraScore: number;
  impactScore: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface DashboardData {
  engineers: Engineer[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  metadata: {
    fetchedAt: string;
    totalPRs: number;
    totalEngineers: number;
    windowDays: number;
  };
}
