"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Engineer, GraphEdge, GraphNode } from "../types";

/* ── Dynamically import to avoid SSR (canvas APIs) ─────────── */
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)", fontSize: 12 }}
    >
      Initialising graph…
    </div>
  ),
});

/* ── Helpers ─────────────────────────────────────────────────── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function nodeRadius(impactScore: number) {
  return lerp(4, 14, impactScore);
}

/* ── Node info overlay ───────────────────────────────────────── */
function NodeOverlay({
  engineer,
  rank,
  onClose,
}: {
  engineer: Engineer;
  rank: number;
  onClose: () => void;
}) {
  return (
    <div
      className="node-overlay absolute bottom-4 left-4 rounded-xl p-4 w-64 z-10"
      style={{ pointerEvents: "auto" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Image
          src={engineer.avatar_url}
          alt={engineer.login}
          width={40}
          height={40}
          className="rounded-full"
          style={{ border: "2px solid rgba(249,115,22,0.4)" }}
        />
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-bold text-white truncate"
            style={{ fontFamily: "var(--font-syne)" }}
          >
            {engineer.login}
          </div>
          <div
            className="text-[10px]"
            style={{ color: "var(--accent)", fontFamily: "var(--font-dm-mono)" }}
          >
            Rank #{rank}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors text-base leading-none"
          style={{ fontFamily: "var(--font-dm-mono)" }}
        >
          ✕
        </button>
      </div>

      {/* Score trio */}
      <div
        className="grid grid-cols-3 gap-2 mb-3 rounded-lg p-2"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        {[
          { label: "Impact", value: engineer.impactScore, color: "var(--accent)" },
          { label: "DORA", value: engineer.doraScore, color: "var(--green)" },
          { label: "PageRank", value: engineer.pageRankScore, color: "var(--blue)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div
              className="text-base font-bold leading-none"
              style={{ color, fontFamily: "var(--font-dm-mono)" }}
            >
              {(value * 100).toFixed(0)}
            </div>
            <div
              className="text-[9px] uppercase tracking-wider mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {[
          { label: "PRs Merged", value: engineer.prsMerged },
          { label: "PRs Authored", value: engineer.prsAuthored },
          { label: "Reviews Given", value: engineer.reviewsGiven },
          { label: "Reviews Recv'd", value: engineer.reviewsReceived },
        ].map(({ label, value }) => (
          <div key={label}>
            <div
              className="text-xs font-semibold text-white"
              style={{ fontFamily: "var(--font-dm-mono)" }}
            >
              {value}
            </div>
            <div
              className="text-[9px]"
              style={{ color: "var(--text-muted)" }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {engineer.summary && (
        <p
          className="text-[10px] leading-relaxed mt-3 pt-3"
          style={{
            color: "var(--text-muted)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontFamily: "var(--font-dm-mono)",
          }}
        >
          {engineer.summary}
        </p>
      )}
    </div>
  );
}

/* ── Main graph panel ────────────────────────────────────────── */
interface Props {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  engineers: Engineer[];
  selectedLogin: string | null;
  onSelectLogin: (login: string | null) => void;
}

export default function GraphPanel({
  graph,
  engineers,
  selectedLogin,
  onSelectLogin,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [hoveredLogin, setHoveredLogin] = useState<string | null>(null);

  /* ── Engineer lookup maps ────────────────────────── */
  const engineerMap = useMemo(
    () => new Map(engineers.map((e) => [e.login, e])),
    [engineers]
  );
  const engineerRankMap = useMemo(
    () => new Map(engineers.map((e, i) => [e.login, i + 1])),
    [engineers]
  );
  const top5 = useMemo(() => new Set(engineers.slice(0, 5).map((e) => e.login)), [engineers]);
  const top20 = useMemo(() => new Set(engineers.slice(0, 20).map((e) => e.login)), [engineers]);

  /* ── Build graph data ────────────────────────────── */
  const graphData = useMemo(() => {
    const nodes = graph.nodes.map((n) => ({
      id: n.id,
      impactScore: n.impactScore,
      doraScore: n.doraScore,
    }));

    // Filter edges with weight > 0, cap at top 800 heaviest for readability
    const links = [...graph.edges]
      .filter((e) => e.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 800)
      .map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      }));

    return { nodes, links };
  }, [graph]);

  /* ── Link lookup for highlighting ────────────────── */
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

  /* ── Respond to external selectedLogin (from table) ─ */
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

      // zoom to node
      if (graphRef.current) {
        const node = graphData.nodes.find((n) => n.id === selectedLogin);
        if (node) {
          graphRef.current.centerAt(
            (node as any).x,
            (node as any).y,
            600
          );
          graphRef.current.zoom(3, 600);
        }
      }
    }
  }, [selectedLogin, linksByNode, graphData.nodes]);

  /* ── Resize observer ─────────────────────────────── */
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

  /* ── Force simulation tuning ─────────────────────── */
  useEffect(() => {
    if (!graphRef.current) return;
    const charge = graphRef.current.d3Force("charge");
    if (charge) charge.strength(-120);
    const link = graphRef.current.d3Force("link");
    if (link) link.distance(60).strength(0.3);
    const collision = graphRef.current.d3Force("collide");
    if (collision) collision?.radius?.((n: any) => nodeRadius(n.impactScore) + 4);
  }, []);

  /* ── Callbacks ───────────────────────────────────── */
  const handleNodeClick = useCallback(
    (node: any) => {
      const id = node.id as string;
      if (selectedLogin === id) {
        onSelectLogin(null);
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
        return;
      }
      onSelectLogin(id);
      const neighbors = new Set<string>([id]);
      const links = new Set<string>();
      (linksByNode.get(id) || []).forEach(({ neighbor, linkKey }) => {
        neighbors.add(neighbor);
        links.add(linkKey);
      });
      setHighlightNodes(neighbors);
      setHighlightLinks(links);
    },
    [selectedLogin, onSelectLogin, linksByNode]
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectLogin(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, [onSelectLogin]);

  const handleNodeHover = useCallback((node: any) => {
    setHoveredLogin(node ? (node.id as string) : null);
  }, []);

  /* ── Visual callbacks ────────────────────────────── */
  const nodeColor = useCallback(
    (node: any): string => {
      const id = node.id as string;
      const hasHighlight = highlightNodes.size > 0;

      if (hasHighlight) {
        if (!highlightNodes.has(id)) return "rgba(20,25,40,0.4)";
        if (id === selectedLogin) return "#f97316";
        return top5.has(id) ? "#fb923c" : "#60a5fa";
      }

      if (top5.has(id)) return "#f97316";
      const rank = engineerRankMap.get(id) ?? 100;
      if (rank <= 10) return "#3b82f6";
      if (rank <= 30) return "#1d4ed8";
      return "#1e3a5f";
    },
    [highlightNodes, selectedLogin, top5, engineerRankMap]
  );

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id as string;
      const r = nodeRadius(node.impactScore);
      const x = node.x as number;
      const y = node.y as number;

      // Positions are undefined for the first few simulation frames — skip.
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const color = nodeColor(node);
      const isSelected = id === selectedLogin;
      const isTop5 = top5.has(id);
      const isTop20 = top20.has(id);
      const hasHighlight = highlightNodes.size > 0;
      const dimmed = hasHighlight && !highlightNodes.has(id);

      // Glow for selected / top5
      if ((isSelected || (isTop5 && !dimmed)) && !dimmed) {
        const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
        grd.addColorStop(0, isSelected ? "rgba(249,115,22,0.4)" : "rgba(249,115,22,0.2)");
        grd.addColorStop(1, "rgba(249,115,22,0)");
        ctx.beginPath();
        ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Border ring for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Label (top 20 always; others only when zoomed in enough)
      const showLabel = isTop20 || globalScale > 2.5;
      if (showLabel && !dimmed) {
        const fontSize = Math.max(9, 10 / globalScale);
        ctx.font = `${fontSize}px 'DM Mono', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSelected
          ? "#f97316"
          : isTop5
          ? "rgba(255,200,150,0.9)"
          : "rgba(148,163,184,0.7)";
        ctx.fillText(id, x, y + r + 2);
      }
    },
    [nodeColor, selectedLogin, top5, top20, highlightNodes]
  );

  const linkColor = useCallback(
    (link: any): string => {
      if (highlightNodes.size === 0) return "rgba(100,116,139,0.12)";
      const src = typeof link.source === "object" ? link.source.id : link.source;
      const tgt = typeof link.target === "object" ? link.target.id : link.target;
      const key = `${src}→${tgt}`;
      if (highlightLinks.has(key)) return "rgba(249,115,22,0.5)";
      return "rgba(20,25,40,0.15)";
    },
    [highlightNodes, highlightLinks]
  );

  const linkWidth = useCallback((link: any): number => {
    const w = (link as any).weight as number;
    return Math.min(4, Math.max(0.3, w / 25));
  }, []);

  /* ── Overlay data ────────────────────────────────── */
  const overlayLogin = selectedLogin || hoveredLogin;
  const overlayEngineer = overlayLogin ? engineerMap.get(overlayLogin) : null;
  const overlayRank = overlayLogin ? (engineerRankMap.get(overlayLogin) ?? 0) : 0;

  /* ── Legend ──────────────────────────────────────── */
  const LegendItem = ({
    color,
    label,
  }: {
    color: string;
    label: string;
  }) => (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  );

  return (
    <div
      className="flex flex-col flex-1 min-w-0"
      style={{ background: "var(--bg)" }}
    >
      {/* Panel header */}
      <div
        className="flex-none flex items-center justify-between px-4 py-2"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          height: "36px",
        }}
      >
        <span
          className="text-[10px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
        >
          Review Network
        </span>
        <div
          className="flex items-center gap-4 text-[10px]"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
        >
          <LegendItem color="var(--accent)" label="Top 5" />
          <LegendItem color="#3b82f6" label="Top 10" />
          <LegendItem color="#1d4ed8" label="Top 30" />
          <LegendItem color="#1e3a5f" label="Others" />
          <span
            className="ml-2 px-2 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}
          >
            {graph.nodes.length} nodes · {Math.min(800, graph.edges.filter((e) => e.weight > 0).length)} edges
          </span>
        </div>
      </div>

      {/* Graph canvas area */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(15,22,36,1) 0%, rgba(7,9,15,1) 70%)",
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
            nodeVal={(n: any) => nodeRadius(n.impactScore) ** 2}
            nodeRelSize={1}
            nodeColor={nodeColor}
            nodeCanvasObject={nodeCanvasObject}
            nodeCanvasObjectMode={() => "replace"}
            linkSource="source"
            linkTarget="target"
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkDirectionalParticles={0}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            onNodeHover={handleNodeHover}
            cooldownTicks={200}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.4}
            enableNodeDrag={true}
            enableZoomInteraction={true}
            enablePanInteraction={true}
          />
        )}

        {/* Node detail overlay */}
        {overlayEngineer && (
          <NodeOverlay
            engineer={overlayEngineer}
            rank={overlayRank}
            onClose={() => {
              onSelectLogin(null);
              setHighlightNodes(new Set());
              setHighlightLinks(new Set());
            }}
          />
        )}

        {/* Click hint */}
        {!overlayEngineer && (
          <div
            className="absolute bottom-4 left-4 text-[10px] pointer-events-none"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-dm-mono)" }}
          >
            Click a node to explore connections
          </div>
        )}
      </div>
    </div>
  );
}
