"use client";

import { useEffect, useRef, useState } from "react";
import type { Core, ElementDefinition, EventObject } from "cytoscape";
import type { GraphData } from "@jarvis/types";
import { CLUSTER_TINTS, TYPE_COLOR } from "@/lib/graph-style";

export type GraphCanvasProps = {
  data: GraphData;
  /** Group nodes into their theme clusters (compound nodes). */
  clusters?: boolean;
  /** Only these node ids are shown (focus mode, filters, timeline). */
  visible?: Set<string> | null;
  /** Visible edges; defaults to edges whose ends are both visible. */
  visibleEdges?: Set<string> | null;
  selected?: string | null;
  /** Nodes to emphasise (search matches). Others are dimmed. */
  highlight?: Set<string> | null;
  onSelect?: (id: string | null) => void;
  interactive?: boolean;
  onReady?: (cy: Core) => void;
  className?: string;
};

const sizeFor = (degree: number, mentions: number) => 14 + Math.min(34, Math.sqrt(degree * 6 + mentions * 4) * 3.2);

function toElements(data: GraphData, clusters: boolean): ElementDefinition[] {
  const tint = new Map(data.clusters.map((c, i) => [c.id, CLUSTER_TINTS[i % CLUSTER_TINTS.length]]));
  const els: ElementDefinition[] = [];
  if (clusters) {
    for (const c of data.clusters) {
      if (c.size > 1) els.push({ data: { id: `cluster:${c.id}`, label: c.label.toUpperCase(), tint: tint.get(c.id) }, classes: "cluster" });
    }
  }
  const parents = new Set(els.map((e) => e.data.id));
  for (const n of data.nodes) {
    const parent = clusters && n.cluster && parents.has(`cluster:${n.cluster}`) ? `cluster:${n.cluster}` : undefined;
    els.push({
      data: {
        id: n.id,
        parent,
        label: n.label,
        type: n.type,
        color: TYPE_COLOR[n.type],
        size: n.type === "theme" ? 30 : sizeFor(n.degree, n.mentions),
      },
      classes: `node-${n.type}`,
    });
  }
  for (const e of data.edges) {
    els.push({ data: { id: e.id, source: e.source, target: e.target, type: e.type, label: e.inferred ? "similar · inferred" : e.type.replace("_", " "), weight: e.inferred ? 1 : e.weight, inferred: e.inferred ? 1 : 0 } });
  }
  return els;
}

const STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      width: "data(size)",
      height: "data(size)",
      label: "data(label)",
      "font-family": "Inter Tight Variable, Inter Tight, system-ui, sans-serif",
      "font-size": 11,
      "font-weight": 500,
      color: "#0A0A0A",
      "text-valign": "bottom",
      "text-margin-y": 5,
      "text-background-color": "#FFFFFF",
      "text-background-opacity": 0.85,
      "text-background-padding": "1px",
      "min-zoomed-font-size": 5,
      "transition-property": "opacity",
      "transition-duration": 150,
    },
  },
  { selector: "node.node-theme", style: { shape: "rectangle", "font-weight": 700, "font-size": 12 } },
  { selector: "node.node-asset", style: { shape: "round-rectangle" } },
  { selector: "node.node-event", style: { shape: "diamond" } },
  { selector: "node.node-thesis", style: { shape: "triangle" } },
  { selector: "node.node-trade", style: { shape: "square", "background-color": "#FFFFFF", "border-width": 2, "border-color": "#0A0A0A" } },
  {
    selector: "node.cluster",
    style: {
      "background-color": "data(tint)",
      "background-opacity": 0.6,
      "border-width": 0,
      shape: "rectangle",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "left",
      "text-margin-y": -6,
      "font-family": "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace",
      "font-size": 10,
      "font-weight": 500,
      color: "#737373",
      "text-background-opacity": 0,
      padding: "18px",
    },
  },
  {
    selector: "edge",
    style: {
      width: "mapData(weight, 1, 6, 1, 3)",
      "line-color": "#D0D5DD",
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#D0D5DD",
      "arrow-scale": 0.6,
      "font-family": "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace",
      "font-size": 8,
      color: "#3046F5",
      "text-rotation": "autorotate",
      "text-background-color": "#FFFFFF",
      "text-background-opacity": 1,
      "transition-property": "opacity, line-color",
      "transition-duration": 150,
    },
  },
  { selector: "edge[type = 'contradicts']", style: { "line-style": "dashed", "line-color": "#F4A7A1", "target-arrow-color": "#F4A7A1" } },
  { selector: "edge[type = 'supports']", style: { "line-color": "#A9B2FB", "target-arrow-color": "#A9B2FB" } },
  { selector: "edge[inferred = 1]", style: { "line-style": "dotted", "line-color": "#3046F5", "target-arrow-shape": "none", opacity: 0.55 } },
  { selector: ".hidden", style: { display: "none" } },
  { selector: ".dim", style: { opacity: 0.12 } },
  { selector: "node.hl", style: { "border-width": 2, "border-color": "#3046F5" } },
  { selector: "edge.hl", style: { "line-color": "#3046F5", "target-arrow-color": "#3046F5", label: "data(label)", "z-index": 10 } },
  { selector: "node.selected", style: { "border-width": 3, "border-color": "#00F0FF", "overlay-opacity": 0 } },
  { selector: "node:active", style: { "overlay-opacity": 0.04 } },
];

export function GraphCanvas({ data, clusters = true, visible, visibleEdges, selected, highlight, onSelect, interactive = true, onReady, className }: GraphCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const onSelectRef = useRef(onSelect);
  const onReadyRef = useRef(onReady);
  const [built, setBuilt] = useState(0);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onReadyRef.current = onReady;
  });

  // (Re)build when data or clustering changes.
  useEffect(() => {
    let cancelled = false;
    let cy: Core | null = null;
    let observer: ResizeObserver | null = null;
    (async () => {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([import("cytoscape"), import("cytoscape-fcose")]);
      if (cancelled || !container.current) return;
      try {
        cytoscape.use(fcose);
      } catch {
        // already registered
      }
      cy = cytoscape({
        container: container.current,
        elements: toElements(data, clusters),
        style: STYLE as never,
        minZoom: 0.2,
        maxZoom: 3,
        userZoomingEnabled: interactive,
        userPanningEnabled: interactive,
        boxSelectionEnabled: false,
        autoungrabify: !interactive,
      });
      cy.layout({
        name: "fcose",
        quality: "proof",
        animate: false,
        randomize: true,
        nodeRepulsion: () => 12000,
        idealEdgeLength: () => 60,
        edgeElasticity: () => 0.4,
        nestingFactor: 0.1,
        gravity: 1.2,
        gravityCompound: 2.5,
        gravityRangeCompound: 1.2,
        numIter: 3000,
        tile: true,
        packComponents: false,
        padding: 24,
      } as never).run();
      // The container can be laid out after Cytoscape measures it; keep it fitted.
      let last = { w: 0, h: 0 };
      observer = new ResizeObserver(([entry]) => {
        const { width: w, height: h } = entry.contentRect;
        if (!cy || w === 0 || h === 0 || (w === last.w && h === last.h)) return;
        last = { w, h };
        cy.resize();
        cy.fit(cy.elements(":visible"), 24);
      });
      observer.observe(container.current);
      cy.on("tap", "node", (e: EventObject) => {
        if (e.target.hasClass("cluster")) return;
        onSelectRef.current?.(e.target.id());
      });
      cy.on("tap", (e: EventObject) => {
        if (e.target === cy) onSelectRef.current?.(null);
      });
      cyRef.current = cy;
      onReadyRef.current?.(cy);
      setBuilt((b) => b + 1);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      cy?.destroy();
      cyRef.current = null;
    };
  }, [data, clusters, interactive]);

  // Visibility, selection and highlighting are applied without re-layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !built) return;
    cy.batch(() => {
      cy.elements().removeClass("hidden dim hl selected");
      if (visible) {
        cy.nodes().not(".cluster").forEach((n) => {
          if (!visible.has(n.id())) n.addClass("hidden");
        });
        cy.edges().forEach((e) => {
          const show = visibleEdges ? visibleEdges.has(e.id()) : visible.has(e.source().id()) && visible.has(e.target().id());
          if (!show) e.addClass("hidden");
        });
        cy.nodes(".cluster").forEach((c) => {
          if (c.children().not(".hidden").length === 0) c.addClass("hidden");
        });
      }
      if (selected) {
        const node = cy.getElementById(selected);
        if (node.nonempty()) {
          const hood = node.closedNeighborhood();
          cy.elements().not(hood).not(".cluster").addClass("dim");
          hood.edges().addClass("hl");
          hood.nodes().addClass("hl");
          node.removeClass("hl").addClass("selected");
        }
      } else if (highlight) {
        cy.nodes().not(".cluster").forEach((n) => {
          if (!highlight.has(n.id())) n.addClass("dim");
        });
        cy.edges().forEach((e) => {
          if (!highlight.has(e.source().id()) || !highlight.has(e.target().id())) e.addClass("dim");
        });
      }
    });
  });

  return <div ref={container} className={className} data-testid="graph-canvas" />;
}
