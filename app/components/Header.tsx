"use client";

import { useState } from "react";
import Image from "next/image";
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
    <header className="flex-none" style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{ background: "rgba(6,8,16,0.98)" }}
      >
        {/* Left: wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <Image
            src="https://github.com/PostHog.png"
            alt="PostHog"
            width={28}
            height={28}
            className="rounded-md shrink-0"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
          />
          <div className="shrink-0">
            <h1
              className="text-[14px] font-medium text-white whitespace-nowrap"
              style={{ fontFamily: "var(--font-dm-mono)", letterSpacing: "-0.01em" }}
            >
              PostHog Engineering Impact Dashboard
            </h1>
            <p
              className="text-[10px] whitespace-nowrap"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)", lineHeight: "1em" }}
            >
              90-day analysis: Execution Quality + Collaboration + Code Health
            </p>
          </div>
        </div>

        {/* Center: stats */}
        <div
          className="flex items-center gap-5 text-[10px]"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
        >
          {[
            { color: "var(--accent)", value: metadata.totalPRs.toLocaleString(), label: "PRs" },
            { color: "var(--blue)", value: String(metadata.totalEngineers), label: "engineers" },
            { color: "var(--green)", value: `${metadata.windowDays}d`, label: `window · ${fetchedDate}` },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-white font-medium">{s.value}</span> {s.label}
            </span>
          ))}
        </div>

        {/* Right: methodology toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[10px] rounded-md px-3 py-1.5 transition-all"
          style={{
            color: open ? "var(--accent)" : "var(--text-secondary)",
            border: `1px solid ${open ? "rgba(249,115,22,0.3)" : "var(--border-strong)"}`,
            background: open ? "var(--accent-dim)" : "transparent",
            fontFamily: "var(--font-dm-mono)",
          }}
        >
          Methodology
          <ChevronDown
            size={10}
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.25s ease",
            }}
          />
        </button>
      </div>

      {/* Methodology panel */}
      <div
        className={`methodology-panel ${open ? "open" : "closed"}`}
        style={{ background: "rgba(249,115,22,0.02)", borderTop: open ? "1px solid var(--border)" : "none" }}
      >
        <div
          className="px-6 py-3 max-w-7xl"
          style={{ fontFamily: "var(--font-dm-mono)" }}
        >
          {/* Definition */}
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
            <span className="font-semibold text-white">Impact</span> = an engineer{"'"}s ability to
            ship reliable code, elevate teammates through reviews, and maintain a healthy codebase.
            We measure what matters for sustained engineering output, not just volume.
          </p>

          {/* 3 pillars */}
          <div className="flex gap-6">
            {[
              {
                color: "#10b981",
                title: "Execution Quality",
                weight: "40%",
                why: "Can they ship reliably?",
                body: "Merge pace, lead time, revert rate, recency, and PR complexity (files touched × log of lines changed).",
              },
              {
                color: "#3b82f6",
                title: "Collaboration",
                weight: "30%",
                why: "Do they make others better?",
                body: "PageRank on the review graph — deeper reviews from stronger engineers carry more weight.",
              },
              {
                color: "#a78bfa",
                title: "Code Health",
                weight: "30%",
                why: "Are they building forward?",
                body: "Code churn (scope consistency) and merge reliability (% of PRs that actually ship).",
              },
            ].map((p) => (
              <div key={p.title} className="flex-1">
                <div className="text-[11px] font-semibold mb-0.5" style={{ color: p.color }}>
                  {p.title}{" "}
                  <span className="font-normal" style={{ opacity: 0.5 }}>
                    {p.weight}
                  </span>
                </div>
                <div className="text-[10px] font-medium mb-0.5" style={{ color: "var(--text-secondary)" }}>
                  {p.why}
                </div>
                <p className="text-[9px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
