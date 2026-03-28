"use client";

import { useState } from "react";
import { DashboardData } from "../types";
import Header from "./Header";
import LeaderboardPanel from "./LeaderboardPanel";
import GraphPanel from "./GraphPanel";

interface Props {
  data: DashboardData;
}

export default function Dashboard({ data }: Props) {
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      <Header metadata={data.metadata} />
      <div className="flex flex-1 min-h-0">
        <LeaderboardPanel
          engineers={data.engineers}
          selectedLogin={selectedLogin}
          onSelectLogin={setSelectedLogin}
        />
        <GraphPanel
          graph={data.graph}
          engineers={data.engineers}
          selectedLogin={selectedLogin}
          onSelectLogin={setSelectedLogin}
        />
      </div>
    </div>
  );
}
