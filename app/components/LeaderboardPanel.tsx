"use client";

import Image from "next/image";
import { Engineer } from "../types";

/* ── Score bar ─────────────────────────────────────── */
function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: "rgba(255,255,255,0.06)" }}>
      <div className="h-full rounded-full score-fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

/* ── Metric row ────────────────────────────────────── */
function MetricRow({ label, value, color }: { label: string; value: number; color: string }) {
  const score = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span
        className="w-[90px] shrink-0 text-[10px]"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
      >
        {label}
      </span>
      <div className="flex-1">
        <ScoreBar value={value} color={color} />
      </div>
      <span
        className="w-[26px] text-right text-[11px] font-semibold tabular-nums shrink-0"
        style={{ color, fontFamily: "var(--font-dm-mono)" }}
      >
        {score}
      </span>
    </div>
  );
}

/* ── Rank badge ────────────────────────────────────── */
function Rank({ rank }: { rank: number }) {
  const cfg: Record<number, { bg: string; fg: string; shadow?: string }> = {
    1: { bg: "var(--accent)", fg: "#fff", shadow: "0 0 14px rgba(249,115,22,0.4)" },
    2: { bg: "rgba(148,163,184,0.15)", fg: "#94a3b8" },
    3: { bg: "rgba(251,191,36,0.12)", fg: "#fbbf24" },
  };
  const c = cfg[rank] ?? { bg: "rgba(71,85,105,0.1)", fg: "#64748b" };
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
      style={{ background: c.bg, color: c.fg, boxShadow: c.shadow, fontFamily: "var(--font-dm-mono)" }}
    >
      {rank}
    </div>
  );
}

/* ── Pillar badge — compact for collapsed state ────── */
function PillarBadge({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[10px]" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}>
        {label}
      </span>
      <span
        className="text-[11px] font-bold tabular-nums"
        style={{ color, fontFamily: "var(--font-dm-mono)" }}
      >
        {Math.round(score * 100)}
      </span>
    </div>
  );
}

/* ── Pillar section — expanded detail ──────────────── */
function PillarSection({
  title,
  weight,
  score,
  color,
  bgColor,
  children,
}: {
  title: string;
  weight: string;
  score: number;
  color: string;
  bgColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: bgColor }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {title}
          </span>
          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
            {weight}
          </span>
        </div>
        <span
          className="text-[14px] font-bold tabular-nums"
          style={{ color, fontFamily: "var(--font-dm-mono)" }}
        >
          {Math.round(score * 100)}
        </span>
      </div>
      <ScoreBar value={score} color={color} />
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ── Engineer card ──────────────────────────────────── */
function Card({
  engineer: e,
  rank,
  expanded,
  onClick,
  delay,
}: {
  engineer: Engineer;
  rank: number;
  expanded: boolean;
  onClick: () => void;
  delay: number;
}) {
  const isFirst = rank === 1;
  const eq = e.executionQuality;

  return (
    <button
      onClick={onClick}
      className="engineer-card card-animate w-full text-left rounded-xl border"
      style={{
        animationDelay: `${delay}ms`,
        borderColor: expanded
          ? "rgba(249,115,22,0.45)"
          : isFirst
          ? "rgba(249,115,22,0.18)"
          : "var(--border)",
        background: expanded
          ? "rgba(249,115,22,0.04)"
          : isFirst
          ? "rgba(249,115,22,0.02)"
          : "var(--bg-card)",
        padding: expanded ? "14px 16px" : "12px 14px",
        outline: "none",
        transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* ── Row 1: Identity + Impact Score ──────────── */}
      <div className="flex items-center gap-3">
        <Rank rank={rank} />
        <Image
          src={e.avatar_url}
          alt={e.login}
          width={expanded ? 36 : 32}
          height={expanded ? 36 : 32}
          className="rounded-full shrink-0"
          style={{
            border: isFirst
              ? "2px solid rgba(249,115,22,0.4)"
              : "1.5px solid rgba(255,255,255,0.08)",
            transition: "all 0.2s ease",
          }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-bold text-white truncate"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            {e.login}
          </div>
          <div
            className="text-[11px] mt-0.5"
            style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
          >
            {e.prsMerged} PRs merged · {e.reviewsGiven} reviews
          </div>
        </div>
        <div className="text-right shrink-0 pl-2">
          <div
            className="text-2xl font-bold tabular-nums"
            style={{
              color: isFirst ? "var(--accent)" : "var(--text-primary)",
              fontFamily: "var(--font-dm-mono)",
              lineHeight: 1,
            }}
          >
            {(e.impactScore * 100).toFixed(1)}
          </div>
          <div
            className="text-[9px] uppercase tracking-widest mt-1"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            impact
          </div>
        </div>
      </div>

      {/* ── Row 2: Pillar summary (always visible) ──── */}
      <div className="flex items-center gap-4 mt-2.5 pl-10">
        <PillarBadge label="Execution" score={e.executionQualityScore} color="#10b981" />
        <PillarBadge label="Collab" score={e.collaborationScore} color="#3b82f6" />
        <PillarBadge label="Health" score={e.codeHealthScore} color="#a78bfa" />
      </div>

      {/* ── Expanded: Full breakdown ───────────────── */}
      {expanded && (
        <div
          className="mt-3 pt-3 flex flex-col gap-2"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            animation: "expandIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          {/* Formula */}
          <div
            className="rounded-lg px-3 py-2 text-[11px]"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontFamily: "var(--font-dm-mono)",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: "#10b981" }}>Exec {Math.round(e.executionQualityScore * 100)}</span>
            <span style={{ color: "var(--text-muted)" }}> × 40% </span>
            <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>+</span>
            <span style={{ color: "#3b82f6" }}> Collab {Math.round(e.collaborationScore * 100)}</span>
            <span style={{ color: "var(--text-muted)" }}> × 30% </span>
            <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>+</span>
            <span style={{ color: "#a78bfa" }}> Health {Math.round(e.codeHealthScore * 100)}</span>
            <span style={{ color: "var(--text-muted)" }}> × 30% </span>
            <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>=</span>
            <span className="font-bold" style={{ color: "var(--accent)" }}> {(e.impactScore * 100).toFixed(1)}</span>
          </div>

          {/* Three pillars */}
          <PillarSection
            title="Execution Quality"
            weight="40%"
            score={e.executionQualityScore}
            color="#10b981"
            bgColor="rgba(16,185,129,0.04)"
          >
            <MetricRow label="Merge pace" value={eq.mergeCadence} color="#10b981" />
            <MetricRow label="Lead time" value={eq.leadTime} color="#06b6d4" />
            <MetricRow label="Failure rate" value={eq.changeFailureRate} color="#8b5cf6" />
            <MetricRow label="Recency" value={eq.recencyScore} color="#f59e0b" />
            <MetricRow label="PR complexity" value={eq.prEffortScore} color="#ec4899" />
          </PillarSection>

          <PillarSection
            title="Collaboration"
            weight="30%"
            score={e.collaborationScore}
            color="#3b82f6"
            bgColor="rgba(59,130,246,0.04)"
          >
            <div
              className="flex flex-col gap-1 text-[10px]"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
            >
              <span>
                Review network rank (PageRank):{" "}
                <span className="font-semibold" style={{ color: "#3b82f6" }}>{Math.round(e.collaborationScore * 100)}</span>
                <span style={{ color: "var(--text-muted)" }}> / 100</span>
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {e.reviewsGiven} reviews given · {e.avgCommentsPerReview.toFixed(1)} avg comments per review
              </span>
              <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                Engineers who review more code from stronger peers rank higher
              </span>
            </div>
          </PillarSection>

          <PillarSection
            title="Code Health"
            weight="30%"
            score={e.codeHealthScore}
            color="#a78bfa"
            bgColor="rgba(167,139,250,0.04)"
          >
            <div
              className="flex flex-col gap-1 text-[10px]"
              style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
            >
              <span>
                Code churn:{" "}
                <span className="font-semibold" style={{ color: "#a78bfa" }}>{(e.churnRate * 100).toFixed(0)}%</span>
                <span style={{ color: "var(--text-muted)" }}> — lower means more consistent PR scope</span>
              </span>
              <span>
                Merge reliability:{" "}
                <span className="font-semibold" style={{ color: "#a78bfa" }}>{(e.mergeReliability * 100).toFixed(0)}%</span>
                <span style={{ color: "var(--text-muted)" }}> of PRs successfully shipped</span>
              </span>
            </div>
          </PillarSection>

          {/* Summary */}
          <p
            className="text-[10px] leading-relaxed pt-2 line-clamp-3"
            style={{
              color: "var(--text-secondary)",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              fontFamily: "var(--font-dm-mono)",
            }}
          >
            {e.summary}
          </p>
        </div>
      )}
    </button>
  );
}

/* ── Panel ──────────────────────────────────────────── */
interface Props {
  engineers: Engineer[];
  selectedLogin: string | null;
  onSelectLogin: (login: string | null) => void;
}

export default function LeaderboardPanel({ engineers, selectedLogin, onSelectLogin }: Props) {
  const top5 = engineers.slice(0, 5);

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        width: 500,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-panel)",
      }}
    >
      <div className="flex-none px-4 pt-3 pb-2">
        <div
          className="text-[11px] uppercase tracking-[0.1em] font-semibold"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-dm-mono)" }}
        >
          Top 5 Engineers by Impact
        </div>
        <p
          className="text-[10px] mt-1"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
        >
          Click a card to see the full scoring breakdown
        </p>
      </div>

      <div className="flex-1 px-3 pb-3 overflow-y-auto">
        <div className="flex flex-col gap-2.5">
          {top5.map((eng, i) => (
            <Card
              key={eng.login}
              engineer={eng}
              rank={i + 1}
              delay={i * 80}
              expanded={selectedLogin === eng.login}
              onClick={() => onSelectLogin(selectedLogin === eng.login ? null : eng.login)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
