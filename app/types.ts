export interface WeeklyActivity {
  week: string;
  prCount: number;
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
  dora: DoraMetrics;
  doraScore: number;
  pageRankScore: number;
  impactScore: number;
  summary: string;
  reviewsGiven: number;
  reviewsReceived: number;
  prsAuthored: number;
  prsMerged: number;
  weeklyActivity: WeeklyActivity[];
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
