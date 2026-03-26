"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Engineer } from "../types";

// ── Score bar ──────────────────────────────────────────────────
function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span
        className="w-14 text-[9px] uppercase tracking-wider shrink-0"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: "3px", background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full score-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="w-6 text-right text-[10px]"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
      >
        {pct}
      </span>
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────
function Sparkline({ data }: { data: { week: string; prCount: number }[] }) {
  const max = Math.max(...data.map((d) => d.prCount), 1);
  const W = 56;
  const H = 18;
  const step = W / (data.length - 1);

  const points = data
    .map((d, i) => `${i * step},${H - (d.prCount / max) * H}`)
    .join(" ");

  const area =
    `M 0,${H} ` +
    data
      .map((d, i) => `L ${i * step},${H - (d.prCount / max) * H}`)
      .join(" ") +
    ` L ${W},${H} Z`;

  return (
    <svg width={W} height={H} style={{ overflow: "visible", flexShrink: 0 }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkGrad)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />
    </svg>
  );
}

// ── Rank badge ─────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, { bg: string; color: string; shadow?: string }> =
    {
      1: {
        bg: "var(--accent)",
        color: "#fff",
        shadow: "0 0 12px rgba(249,115,22,0.5)",
      },
      2: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
      3: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
      4: { bg: "rgba(71,85,105,0.2)", color: "#64748b" },
      5: { bg: "rgba(71,85,105,0.2)", color: "#64748b" },
    };
  const s = styles[rank];
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{
        background: s.bg,
        color: s.color,
        boxShadow: s.shadow,
        fontFamily: "var(--font-dm-mono)",
      }}
    >
      {rank}
    </div>
  );
}

// ── Engineer card (top 5) ──────────────────────────────────────
function EngineerCard({
  engineer,
  rank,
  selected,
  onClick,
}: {
  engineer: Engineer;
  rank: number;
  selected: boolean;
  onClick: () => void;
}) {
  const borderColor =
    rank === 1
      ? "rgba(249,115,22,0.4)"
      : rank === 2
      ? "rgba(148,163,184,0.15)"
      : rank === 3
      ? "rgba(251,191,36,0.2)"
      : "rgba(255,255,255,0.05)";

  return (
    <button
      onClick={onClick}
      className="engineer-card w-full text-left rounded-lg p-3 border"
      style={{
        borderColor: selected ? "rgba(249,115,22,0.5)" : borderColor,
        background: selected
          ? "rgba(249,115,22,0.06)"
          : rank === 1
          ? "rgba(249,115,22,0.04)"
          : "var(--bg-card)",
        outline: "none",
      }}
    >
      {/* Top row: rank + avatar + name + sparkline + impact */}
      <div className="flex items-center gap-2.5 mb-2">
        <RankBadge rank={rank} />
        <Image
          src={engineer.avatar_url}
          alt={engineer.login}
          width={28}
          height={28}
          className="rounded-full"
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold text-white leading-none truncate"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {engineer.login}
          </div>
          <div
            className="text-[10px] mt-0.5 truncate"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            {engineer.prsMerged} PRs · {engineer.reviewsGiven} reviews given
          </div>
        </div>
        <Sparkline data={engineer.weeklyActivity} />
        <div className="text-right shrink-0">
          <div
            className="text-base font-bold leading-none"
            style={{
              color: rank === 1 ? "var(--accent)" : "var(--text-primary)",
              fontFamily: "var(--font-dm-mono)",
            }}
          >
            {(engineer.impactScore * 100).toFixed(1)}
          </div>
          <div
            className="text-[9px] uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            impact
          </div>
        </div>
      </div>

      {/* Summary */}
      {engineer.summary && (
        <p
          className="text-[10px] leading-relaxed mb-2 line-clamp-1"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-dm-mono)",
          }}
        >
          {engineer.summary}
        </p>
      )}

      {/* Score bars */}
      <div className="flex flex-col gap-1">
        <ScoreBar label="DORA" value={engineer.doraScore} color="var(--green)" />
        <ScoreBar
          label="PageRank"
          value={engineer.pageRankScore}
          color="var(--blue)"
        />
        <ScoreBar
          label="Impact"
          value={engineer.impactScore}
          color="var(--accent)"
        />
      </div>
    </button>
  );
}

// ── Sort types ─────────────────────────────────────────────────
type SortKey = "rank" | "impactScore" | "doraScore" | "pageRankScore" | "prsAuthored";
type SortDir = "asc" | "desc";

// ── Main panel ─────────────────────────────────────────────────
interface Props {
  engineers: Engineer[];
  selectedLogin: string | null;
  onSelectLogin: (login: string | null) => void;
}

export default function LeaderboardPanel({
  engineers,
  selectedLogin,
  onSelectLogin,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("impactScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const top5 = engineers.slice(0, 5);

  const sortedAll = useMemo(() => {
    const ranked = engineers.map((e, i) => ({ ...e, rank: i + 1 }));
    return [...ranked].sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "rank") {
        av = a.rank;
        bv = b.rank;
      } else if (sortKey === "prsAuthored") {
        av = a.prsAuthored;
        bv = b.prsAuthored;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [engineers, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return (
        <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>
          <ChevronDown size={10} />
        </span>
      );
    return sortDir === "desc" ? (
      <ChevronDown size={10} style={{ color: "var(--accent)" }} />
    ) : (
      <ChevronUp size={10} style={{ color: "var(--accent)" }} />
    );
  }

  const colBtn =
    "flex items-center gap-0.5 hover:text-white transition-colors cursor-pointer select-none";

  return (
    <div
      className="flex flex-col border-r"
      style={{
        width: "460px",
        flexShrink: 0,
        borderColor: "var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      {/* ── Top 5 section ─────────────────────────────── */}
      <div
        className="flex-none px-3 pt-3 pb-1"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <span
            className="text-[10px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            Top Performers
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            by impact score
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {top5.map((eng, i) => (
            <EngineerCard
              key={eng.login}
              engineer={eng}
              rank={i + 1}
              selected={selectedLogin === eng.login}
              onClick={() =>
                onSelectLogin(selectedLogin === eng.login ? null : eng.login)
              }
            />
          ))}
        </div>
      </div>

      {/* ── Full table section ─────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">
        <div
          className="flex-none px-3 py-2 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-[10px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            All Engineers
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            {engineers.length} total
          </span>
        </div>

        {/* Table header */}
        <div
          className="flex-none grid px-3 py-1.5 text-[10px] uppercase tracking-wider"
          style={{
            gridTemplateColumns: "28px 1fr 52px 52px 56px 36px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-dm-mono)",
            borderBottom: "1px solid var(--border)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <button className={colBtn} onClick={() => handleSort("rank")}>
            # <SortIcon col="rank" />
          </button>
          <span>Engineer</span>
          <button className={colBtn} onClick={() => handleSort("impactScore")}>
            Impact <SortIcon col="impactScore" />
          </button>
          <button className={colBtn} onClick={() => handleSort("doraScore")}>
            DORA <SortIcon col="doraScore" />
          </button>
          <button className={colBtn} onClick={() => handleSort("pageRankScore")}>
            PRank <SortIcon col="pageRankScore" />
          </button>
          <button className={colBtn} onClick={() => handleSort("prsAuthored")}>
            PRs <SortIcon col="prsAuthored" />
          </button>
        </div>

        {/* Table body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {sortedAll.map((eng) => {
            const isSelected = selectedLogin === eng.login;
            const isTop5 = eng.rank <= 5;
            return (
              <button
                key={eng.login}
                onClick={() =>
                  onSelectLogin(isSelected ? null : eng.login)
                }
                className={`table-row w-full text-left grid px-3 py-1.5 items-center ${
                  isSelected ? "selected" : ""
                }`}
                style={{
                  gridTemplateColumns: "28px 1fr 52px 52px 56px 36px",
                  borderBottom: "1px solid var(--border)",
                  outline: "none",
                }}
              >
                {/* Rank */}
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color: isTop5 ? "var(--accent)" : "var(--text-muted)",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  {eng.rank}
                </span>

                {/* Name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <Image
                    src={eng.avatar_url}
                    alt={eng.login}
                    width={18}
                    height={18}
                    className="rounded-full shrink-0"
                    style={{ opacity: 0.85 }}
                  />
                  <span
                    className="text-[11px] truncate"
                    style={{
                      color: isSelected ? "var(--accent)" : "var(--text-primary)",
                      fontFamily: "var(--font-syne)",
                      fontWeight: isTop5 ? 600 : 400,
                    }}
                  >
                    {eng.login}
                  </span>
                </div>

                {/* Impact */}
                <div className="flex items-center gap-1">
                  <div
                    className="h-1 rounded-full"
                    style={{
                      width: `${Math.round(eng.impactScore * 32)}px`,
                      background: "var(--accent)",
                      opacity: 0.7,
                    }}
                  />
                  <span
                    className="text-[10px] w-6 text-right"
                    style={{
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-dm-mono)",
                    }}
                  >
                    {(eng.impactScore * 100).toFixed(0)}
                  </span>
                </div>

                {/* DORA */}
                <span
                  className="text-[10px] text-right"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  {(eng.doraScore * 100).toFixed(0)}
                </span>

                {/* PageRank */}
                <span
                  className="text-[10px] text-right"
                  style={{
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  {(eng.pageRankScore * 100).toFixed(0)}
                </span>

                {/* PRs */}
                <span
                  className="text-[10px] text-right"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-dm-mono)",
                  }}
                >
                  {eng.prsAuthored}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
