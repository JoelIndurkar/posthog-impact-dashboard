"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Engineer, GraphEdge, GraphNode } from "../types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center fade-in"
      style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)", fontSize: 11 }}
    >
      Initialising graph...
    </div>
  ),
});

/* ── Helpers ──────────────────────────────────────── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/* ── Node detail overlay ─────────────────────────── */
function NodeDetail({
  engineer,
  rank,
  connectedEdges,
  engineerMap,
  onClose,
}: {
  engineer: Engineer;
  rank: number;
  connectedEdges: { source: string; target: string; weight: number }[];
  engineerMap: Map<string, Engineer>;
  onClose: () => void;
}) {
  const reviewsGiven = connectedEdges
    .filter((e) => e.source === engineer.login)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  const reviewsReceived = connectedEdges
    .filter((e) => e.target === engineer.login)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  const eq = engineer.executionQuality;
  const mono = { fontFamily: "var(--font-dm-mono)" } as const;

  return (
    <div
      className="absolute top-3 right-3 z-20 rounded-xl detail-slide-in"
      style={{
        width: 280,
        background: "rgba(9, 12, 20, 0.97)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(249,115,22,0.2)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        maxHeight: "calc(100% - 24px)",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 p-3 pb-2">
        <Image
          src={engineer.avatar_url}
          alt={engineer.login}
          width={34}
          height={34}
          className="rounded-full"
          style={{ border: "2px solid rgba(249,115,22,0.35)" }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-white truncate" style={mono}>
            {engineer.login}
          </div>
          <div className="text-[10px]" style={{ color: "var(--accent)", ...mono }}>
            Rank #{rank} · Impact {(engineer.impactScore * 100).toFixed(1)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-colors text-xs"
          style={mono}
        >
          ✕
        </button>
      </div>

      {/* Formula — human readable */}
      <div
        className="mx-3 mb-2 rounded-lg px-2.5 py-1.5 text-[9px] leading-relaxed"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", ...mono }}
      >
        <span style={{ color: "#10b981" }}>Exec {Math.round(engineer.executionQualityScore * 100)}</span>
        <span style={{ color: "var(--text-muted)" }}> × 40% + </span>
        <span style={{ color: "#3b82f6" }}>Collab {Math.round(engineer.collaborationScore * 100)}</span>
        <span style={{ color: "var(--text-muted)" }}> × 30% + </span>
        <span style={{ color: "#a78bfa" }}>Health {Math.round(engineer.codeHealthScore * 100)}</span>
        <span style={{ color: "var(--text-muted)" }}> × 30% = </span>
        <span className="font-bold" style={{ color: "var(--accent)" }}>{(engineer.impactScore * 100).toFixed(1)}</span>
      </div>

      {/* 3 Pillars — readable */}
      <div className="mx-3 mb-2 flex flex-col gap-1.5">
        {/* Execution */}
        <div className="rounded-lg p-2" style={{ background: "rgba(16,185,129,0.05)" }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-medium" style={{ color: "#10b981", ...mono }}>Execution Quality</span>
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#10b981", ...mono }}>
              {Math.round(engineer.executionQualityScore * 100)}
            </span>
          </div>
          {[
            { label: "Merge pace", v: eq.mergeCadence },
            { label: "Lead time", v: eq.leadTime },
            { label: "Fail rate", v: eq.changeFailureRate },
            { label: "Recency", v: eq.recencyScore },
            { label: "PR complexity", v: eq.prEffortScore },
          ].map((m) => (
            <div key={m.label} className="flex justify-between text-[8.5px] py-px" style={mono}>
              <span style={{ color: "var(--text-muted)" }}>{m.label}</span>
              <span style={{ color: "#10b981" }}>{Math.round(m.v * 100)}</span>
            </div>
          ))}
        </div>

        {/* Collab + Health side by side */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg p-2" style={{ background: "rgba(59,130,246,0.05)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-medium" style={{ color: "#3b82f6", ...mono }}>Collaboration</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: "#3b82f6", ...mono }}>
                {Math.round(engineer.collaborationScore * 100)}
              </span>
            </div>
            <div className="text-[8.5px]" style={{ color: "var(--text-muted)", ...mono }}>
              <div>{engineer.reviewsGiven} reviews</div>
              <div>{engineer.avgCommentsPerReview.toFixed(1)} avg cmts</div>
            </div>
          </div>
          <div className="rounded-lg p-2" style={{ background: "rgba(167,139,250,0.05)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-medium" style={{ color: "#a78bfa", ...mono }}>Code Health</span>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: "#a78bfa", ...mono }}>
                {Math.round(engineer.codeHealthScore * 100)}
              </span>
            </div>
            <div className="text-[8.5px]" style={{ color: "var(--text-muted)", ...mono }}>
              <div>Churn {(engineer.churnRate * 100).toFixed(0)}%</div>
              <div>Reliab {(engineer.mergeReliability * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* Edge weight explanation */}
      {(reviewsGiven.length > 0 || reviewsReceived.length > 0) && (
        <div
          className="mx-3 mb-2 rounded-md px-2 py-1.5 text-[8.5px] leading-relaxed"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", ...mono }}
        >
          <span style={{ color: "var(--text-muted)" }}>
            Edge weight = review count × comment depth × reviewer{"'"}s execution score.{" "}
            Higher weight = more frequent, deeper reviews from stronger engineers.
          </span>
        </div>
      )}

      {/* Review connections */}
      {reviewsGiven.length > 0 && (
        <div className="mx-3 mb-2">
          <div className="text-[9px] font-medium mb-1" style={{ color: "var(--text-secondary)", ...mono }}>
            Reviewed these engineers{"'"} PRs
          </div>
          {reviewsGiven.map((e) => (
            <div key={e.target} className="flex items-center text-[10px] py-0.5" style={mono}>
              <span style={{ color: "var(--text-secondary)" }}>→ {e.target}</span>
              <span className="flex-1" />
              <span className="tabular-nums font-medium" style={{ color: "var(--accent)" }}>{e.weight.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
      {reviewsReceived.length > 0 && (
        <div className="mx-3 mb-3">
          <div className="text-[9px] font-medium mb-1" style={{ color: "var(--text-secondary)", ...mono }}>
            Got reviews from these engineers
          </div>
          {reviewsReceived.map((e) => (
            <div key={e.source} className="flex items-center text-[10px] py-0.5" style={mono}>
              <span style={{ color: "var(--text-secondary)" }}>← {e.source}</span>
              <span className="flex-1" />
              <span className="tabular-nums font-medium" style={{ color: "var(--accent)" }}>{e.weight.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Edge tooltip ────────────────────────────────── */
function EdgeTooltip({
  edge,
  engineerMap,
  pos,
}: {
  edge: { source: string; target: string; weight: number };
  engineerMap: Map<string, Engineer>;
  pos: { x: number; y: number };
}) {
  const reviewer = engineerMap.get(edge.source);
  const reviewerEQ = reviewer?.executionQualityScore ?? 0;

  return (
    <div
      className="absolute z-30 rounded-lg px-3 py-2 pointer-events-none"
      style={{
        left: pos.x + 14,
        top: pos.y - 10,
        background: "rgba(9,12,20,0.96)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(249,115,22,0.25)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        whiteSpace: "nowrap",
      }}
    >
      <div className="text-[10px] mb-1" style={{ fontFamily: "var(--font-dm-mono)" }}>
        <span style={{ color: "var(--accent)" }}>{edge.source}</span>
        <span style={{ color: "var(--text-secondary)" }}> reviewed </span>
        <span style={{ color: "var(--blue)" }}>{edge.target}</span>
      </div>
      <div className="text-[9px]" style={{ fontFamily: "var(--font-dm-mono)" }}>
        <span style={{ color: "var(--text-secondary)" }}>Edge weight: </span>
        <span className="font-bold" style={{ color: "var(--accent)" }}>{edge.weight.toFixed(1)}</span>
      </div>
      <div className="text-[8px] mt-0.5" style={{ fontFamily: "var(--font-dm-mono)", color: "var(--text-muted)" }}>
        = review count × comment depth × {reviewerEQ.toFixed(2)} EQ
      </div>
    </div>
  );
}

/* ── Main panel ──────────────────────────────────── */
interface Props {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  engineers: Engineer[];
  selectedLogin: string | null;
  onSelectLogin: (login: string | null) => void;
}

export default function GraphPanel({ graph, engineers, selectedLogin, onSelectLogin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: { source: string; target: string; weight: number };
    pos: { x: number; y: number };
  } | null>(null);

  const engineerMap = useMemo(() => new Map(engineers.map((e) => [e.login, e])), [engineers]);
  const engineerRankMap = useMemo(() => new Map(engineers.map((e, i) => [e.login, i + 1])), [engineers]);
  const top5 = useMemo(() => new Set(engineers.slice(0, 5).map((e) => e.login)), [engineers]);
  const top20 = useMemo(() => new Set(engineers.slice(0, 20).map((e) => e.login)), [engineers]);

  // Keep top 400 edges to reduce noise
  const graphData = useMemo(() => {
    const nodes = graph.nodes.map((n) => ({ id: n.id, impactScore: n.impactScore, doraScore: n.doraScore }));
    const links = [...graph.edges]
      .filter((e) => e.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 400)
      .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));
    return { nodes, links };
  }, [graph]);

  const linksByNode = useMemo(() => {
    const map = new Map<string, { neighbor: string; linkKey: string }[]>();
    graphData.links.forEach((link) => {
      const src = typeof link.source === "object" ? (link.source as any).id : link.source;
      const tgt = typeof link.target === "object" ? (link.target as any).id : link.target;
      const key = `${src}→${tgt}`;
      if (!map.has(src)) map.set(src, []);
      if (!map.has(tgt)) map.set(tgt, []);
      map.get(src)!.push({ neighbor: tgt, linkKey: key });
      map.get(tgt)!.push({ neighbor: src, linkKey: key });
    });
    return map;
  }, [graphData.links]);

  const selectedEdges = useMemo(() => {
    if (!selectedLogin) return [];
    return graphData.links
      .filter((l) => {
        const src = typeof l.source === "object" ? (l.source as any).id : l.source;
        const tgt = typeof l.target === "object" ? (l.target as any).id : l.target;
        return src === selectedLogin || tgt === selectedLogin;
      })
      .map((l) => ({
        source: typeof l.source === "object" ? (l.source as any).id : l.source,
        target: typeof l.target === "object" ? (l.target as any).id : l.target,
        weight: l.weight,
      }));
  }, [selectedLogin, graphData.links]);

  // Sync selection → highlights, center camera gently
  useEffect(() => {
    if (!selectedLogin) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
    } else {
      const neighbors = new Set<string>([selectedLogin]);
      const links = new Set<string>();
      (linksByNode.get(selectedLogin) || []).forEach(({ neighbor, linkKey }) => {
        neighbors.add(neighbor);
        links.add(linkKey);
      });
      setHighlightNodes(neighbors);
      setHighlightLinks(links);

      // Gentle zoom — 2x not 3.5x, so nodes stay usable
      if (graphRef.current) {
        const node = graphData.nodes.find((n) => n.id === selectedLogin);
        if (node && Number.isFinite((node as any).x)) {
          graphRef.current.centerAt((node as any).x, (node as any).y, 500);
          graphRef.current.zoom(2, 500);
        }
      }
    }
  }, [selectedLogin, linksByNode, graphData.nodes]);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Force tuning
  useEffect(() => {
    if (!graphRef.current) return;
    const charge = graphRef.current.d3Force("charge");
    if (charge) charge.strength(-80).distanceMax(350);
    const link = graphRef.current.d3Force("link");
    if (link) link.distance(50).strength(0.15);
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      setHoveredEdge(null);
      const id = node.id as string;
      onSelectLogin(selectedLogin === id ? null : id);
    },
    [selectedLogin, onSelectLogin]
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectLogin(null);
    setHoveredEdge(null);
  }, [onSelectLogin]);

  const handleLinkHover = useCallback((link: any, event?: MouseEvent) => {
    if (!link || !event || !containerRef.current) {
      setHoveredEdge(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setHoveredEdge(null);
      return;
    }
    const src = typeof link.source === "object" ? link.source.id : link.source;
    const tgt = typeof link.target === "object" ? link.target.id : link.target;
    setHoveredEdge({ edge: { source: src, target: tgt, weight: link.weight }, pos: { x, y } });
  }, []);

  /* ── Canvas rendering — KEY FIX: divide by globalScale for constant screen size ── */
  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as string;
      const x = node.x as number;
      const y = node.y as number;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      // Constant SCREEN-SPACE radius: 3–12px on screen regardless of zoom
      const screenR = lerp(3, 12, node.impactScore);
      const r = screenR / globalScale;

      const isSelected = id === selectedLogin;
      const isTop5 = top5.has(id);
      const isTop20 = top20.has(id);
      const hasHL = highlightNodes.size > 0;
      const dimmed = hasHL && !highlightNodes.has(id);

      let color: string;
      let alpha = 1;
      if (hasHL) {
        if (dimmed) {
          color = "#1a1f30";
          alpha = 0.3;
        } else if (isSelected) {
          color = "#f97316";
        } else if (isTop5) {
          color = "#fb923c";
        } else {
          color = "#60a5fa";
        }
      } else {
        if (isTop5) color = "#f97316";
        else if ((engineerRankMap.get(id) ?? 100) <= 10) color = "#3b82f6";
        else if ((engineerRankMap.get(id) ?? 100) <= 30) color = "#1d4ed8";
        else color = "#1e3a5f";
      }

      // Glow for selected node
      if (isSelected && Number.isFinite(r)) {
        const glowR = r * 3;
        const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
        grd.addColorStop(0, "rgba(249,115,22,0.3)");
        grd.addColorStop(1, "rgba(249,115,22,0)");
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Node circle
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2 / globalScale, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(249,115,22,0.6)";
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;

      // Labels: always show top20 names, others only when zoomed
      const showLabel = (!dimmed && isTop20) || (!dimmed && globalScale > 4);
      if (showLabel) {
        // Constant screen-size font
        const fontSize = (isTop5 ? 11 : 9) / globalScale;
        ctx.font = `${isTop5 ? "bold " : ""}${fontSize}px 'DM Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = dimmed
          ? "transparent"
          : isSelected
          ? "#f97316"
          : isTop5
          ? "rgba(255,210,170,0.85)"
          : "rgba(148,163,184,0.5)";
        ctx.fillText(id, x, y + r + 2 / globalScale);
      }
    },
    [selectedLogin, top5, top20, highlightNodes, engineerRankMap]
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const src = typeof link.source === "object" ? link.source : { x: 0, y: 0, id: link.source };
      const tgt = typeof link.target === "object" ? link.target : { x: 0, y: 0, id: link.target };
      if (!Number.isFinite(src.x) || !Number.isFinite(tgt.x)) return;

      const srcId = src.id as string;
      const tgtId = tgt.id as string;
      const key = `${srcId}→${tgtId}`;
      const isHL = highlightLinks.has(key);
      const hasHL = highlightNodes.size > 0;
      const w = link.weight as number;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      if (hasHL) {
        if (isHL) {
          ctx.strokeStyle = "rgba(249,115,22,0.35)";
          ctx.lineWidth = Math.min(2, Math.max(0.3, w / 3)) / globalScale;
        } else {
          ctx.strokeStyle = "rgba(15,20,35,0.15)";
          ctx.lineWidth = 0.3 / globalScale;
        }
      } else {
        ctx.strokeStyle = "rgba(100,116,139,0.06)";
        ctx.lineWidth = Math.min(1, Math.max(0.1, w / 5)) / globalScale;
      }
      ctx.stroke();

      // Edge labels: only top 8 heaviest highlighted edges when zoomed > 1.5x
      if (isHL && globalScale > 1.5 && w > 0.3) {
        const midX = (src.x + tgt.x) / 2;
        const midY = (src.y + tgt.y) / 2;
        const fontSize = 7 / globalScale;
        const label = w.toFixed(1);

        ctx.font = `${fontSize}px 'DM Mono', monospace`;
        const tw = ctx.measureText(label).width;
        const pad = 1.5 / globalScale;

        ctx.fillStyle = "rgba(6,8,16,0.85)";
        ctx.fillRect(midX - tw / 2 - pad, midY - fontSize / 2 - pad, tw + pad * 2, fontSize + pad * 2);

        ctx.fillStyle = "rgba(249,115,22,0.7)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, midX, midY);
      }
    },
    [highlightLinks, highlightNodes]
  );

  const selectedEngineer = selectedLogin ? engineerMap.get(selectedLogin) : null;
  const selectedRank = selectedLogin ? (engineerRankMap.get(selectedLogin) ?? 0) : 0;

  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ background: "var(--bg)" }}>
      {/* Header bar */}
      <div
        className="flex-none flex items-center justify-between px-4"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", height: 36 }}
      >
        <span
          className="text-[9px] uppercase tracking-[0.12em] font-semibold"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
        >
          Review Network
        </span>
        <div
          className="flex items-center gap-4 text-[9px]"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
        >
          {[
            { c: "var(--accent)", l: "Top 5" },
            { c: "#3b82f6", l: "Top 10" },
            { c: "#1d4ed8", l: "Top 30" },
            { c: "#1e3a5f", l: "Others" },
          ].map((d) => (
            <span key={d.l} className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.c }} />
              {d.l}
            </span>
          ))}
          <span style={{ opacity: 0.4, marginLeft: 4 }}>
            {graphData.nodes.length} nodes · {graphData.links.length} edges
          </span>
        </div>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, rgba(12,16,28,1) 0%, rgba(6,8,16,1) 70%)",
        }}
      >
        {dims.w > 0 && (
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={dims.w}
            height={dims.h}
            backgroundColor="transparent"
            nodeId="id"
            nodeVal={(n: any) => lerp(3, 12, n.impactScore)}
            nodeRelSize={1}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => "replace"}
            linkCanvasObject={linkCanvasObject}
            linkCanvasObjectMode={() => "replace"}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onLinkHover={handleLinkHover as any}
            cooldownTicks={150}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.45}
            enableNodeDrag
            enableZoomInteraction
            enablePanInteraction
          />
        )}

        {hoveredEdge && <EdgeTooltip edge={hoveredEdge.edge} engineerMap={engineerMap} pos={hoveredEdge.pos} />}

        {selectedEngineer && (
          <NodeDetail
            engineer={selectedEngineer}
            rank={selectedRank}
            connectedEdges={selectedEdges}
            engineerMap={engineerMap}
            onClose={() => onSelectLogin(null)}
          />
        )}

        {!selectedEngineer && !hoveredEdge && (
          <div
            className="absolute bottom-3 left-3 text-[9px] pointer-events-none fade-in"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)", animationDelay: "0.8s" }}
          >
            Click a node to explore · Hover edges to see the math
          </div>
        )}
      </div>
    </div>
  );
}
