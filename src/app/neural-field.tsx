"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; vx: number; vy: number; r: number };
type Pulse = { a: number; b: number; t: number; speed: number };

const LINK_DISTANCE = 140;
const BRAND = "31, 107, 255";

// A slowly drifting graph of "neurons". Nearby nodes connect with hairlines
// and signals travel along the links, brighter around the pointer.
export function NeuralField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const pointer = { x: -9999, y: -9999 };
    let nodes: Node[] = [];
    let pulses: Pulse[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.round(
        Math.min(110, Math.max(28, (width * height) / 9000)),
      );
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1 + Math.random() * 1.8,
      }));
      pulses = [];
    }

    function links() {
      const result: [number, number, number][] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const d = Math.hypot(
            nodes[i].x - nodes[j].x,
            nodes[i].y - nodes[j].y,
          );
          if (d < LINK_DISTANCE) result.push([i, j, d]);
        }
      }
      return result;
    }

    function draw() {
      const ink = dark.matches ? "242, 242, 242" : "10, 10, 10";
      ctx!.clearRect(0, 0, width, height);

      const edges = links();
      for (const [i, j, d] of edges) {
        const a = nodes[i];
        const b = nodes[j];
        const near =
          Math.hypot((a.x + b.x) / 2 - pointer.x, (a.y + b.y) / 2 - pointer.y) <
          160;
        const alpha = (1 - d / LINK_DISTANCE) * (near ? 0.55 : 0.18);
        ctx!.strokeStyle = near
          ? `rgba(${BRAND}, ${alpha})`
          : `rgba(${ink}, ${alpha})`;
        ctx!.lineWidth = 0.6;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }

      for (const n of nodes) {
        ctx!.fillStyle = `rgba(${ink}, 0.7)`;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      for (const p of pulses) {
        const a = nodes[p.a];
        const b = nodes[p.b];
        if (!a || !b) continue;
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        ctx!.fillStyle = `rgba(${BRAND}, 0.95)`;
        ctx!.beginPath();
        ctx!.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx!.fill();
      }

      return edges;
    }

    function step() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      const edges = draw();

      const spawned: Pulse[] = [];
      pulses = pulses
        .map((p) => ({ ...p, t: p.t + p.speed }))
        .filter((p) => {
          if (p.t < 1) return true;
          // When a signal arrives, it sometimes fires onward.
          const next = edges.find(
            ([i, j]) => (i === p.b || j === p.b) && Math.random() < 0.6,
          );
          if (next) {
            const [i, j] = next;
            spawned.push({
              a: p.b,
              b: i === p.b ? j : i,
              t: 0,
              speed: p.speed,
            });
          }
          return false;
        })
        .concat(spawned)
        .slice(0, 40);

      if (edges.length && pulses.length < 12 && Math.random() < 0.05) {
        const [a, b] = edges[Math.floor(Math.random() * edges.length)];
        pulses.push({ a, b, t: 0, speed: 0.012 + Math.random() * 0.02 });
      }

      if (visible) frame = requestAnimationFrame(step);
    }

    function onPointer(event: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    }

    function onLeave() {
      pointer.x = -9999;
      pointer.y = -9999;
    }

    resize();
    if (reduceMotion) {
      draw();
    } else {
      frame = requestAnimationFrame(step);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion) draw();
    });
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !reduceMotion) frame = requestAnimationFrame(step);
    });
    intersection.observe(canvas);

    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
