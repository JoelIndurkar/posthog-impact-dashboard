"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  metadata: {
    fetchedAt: string;
    totalPRs: number;
    totalEngineers: number;
    windowDays: number;
  };
}

export default function Header({ metadata }: Props) {
  const [open, setOpen] = useState(false);

  const fetchedDate = new Date(metadata.fetchedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <header className="flex-none border-b" style={{ borderColor: "var(--border)" }}>
      {/* Main bar */}
      <div
        className="flex items-center justify-between px-5 h-13"
        style={{ background: "rgba(7,9,15,0.97)", height: "52px" }}
      >
        {/* Left: wordmark */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md text-white font-bold text-[11px] tracking-widest"
            style={{ background: "var(--accent)", fontFamily: "var(--font-dm-mono)" }}
          >
            PH
          </div>
          <div>
            <h1
              className="text-sm font-bold leading-none text-white tracking-tight"
              style={{ fontFamily: "var(--font-syne)" }}
            >
              PostHog Engineering Impact Dashboard
            </h1>
            <p
              className="text-[11px] leading-none mt-1"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
            >
              Analyzing 90 days of GitHub data using DORA metrics + Review
              Network PageRank
            </p>
          </div>
        </div>

        {/* Center: stats chips */}
        <div
          className="flex items-center gap-4 text-[11px]"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            <span className="text-white font-medium">
              {metadata.totalPRs.toLocaleString()}
            </span>{" "}
            PRs
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--blue)" }}
            />
            <span className="text-white font-medium">{metadata.totalEngineers}</span>{" "}
            engineers
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--green)" }}
            />
            <span className="text-white font-medium">{metadata.windowDays}d</span>{" "}
            window · {fetchedDate}
          </span>
        </div>

        {/* Right: methodology button */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] rounded px-2.5 py-1.5 transition-all"
          style={{
            color: open ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${open ? "rgba(249,115,22,0.35)" : "var(--border-strong)"}`,
            background: open ? "var(--accent-dim)" : "transparent",
            fontFamily: "var(--font-dm-mono)",
          }}
        >
          Methodology
          <ChevronDown
            size={11}
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.25s ease",
            }}
          />
        </button>
      </div>

      {/* Collapsible methodology */}
      <div
        className={`methodology-panel ${open ? "open" : "closed"}`}
        style={{ background: "rgba(249,115,22,0.03)", borderTop: open ? `1px solid var(--border)` : "none" }}
      >
        <p
          className="px-5 py-3 text-[11px] leading-relaxed max-w-5xl"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
        >
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>
            Impact Score
          </span>{" "}
          = Individual DORA Score{" "}
          <span style={{ color: "var(--text-primary)" }}>(60%)</span> + Review
          Network PageRank{" "}
          <span style={{ color: "var(--text-primary)" }}>(40%)</span>.{" "}
          <span style={{ color: "#a3e635" }}>DORA</span> combines four
          normalized sub-metrics:{" "}
          <span style={{ color: "var(--text-primary)" }}>Merge Frequency</span>{" "}
          (PR throughput, 30%),{" "}
          <span style={{ color: "var(--text-primary)" }}>Lead Time</span>{" "}
          (hours to merge — lower is better, 25%),{" "}
          <span style={{ color: "var(--text-primary)" }}>
            Change Failure Rate
          </span>{" "}
          (fraction of "revert" PRs, inverted, 25%), and{" "}
          <span style={{ color: "var(--text-primary)" }}>Recency</span>{" "}
          (exponential 0.85/week decay, 20%).{" "}
          <span style={{ color: "var(--blue)" }}>PageRank</span> runs on a
          directed review graph (reviewer → author) where edge weight = review
          count × reviewer&apos;s DORA score, rewarding engineers who attract
          high-quality code review.
        </p>
      </div>
    </header>
  );
}
