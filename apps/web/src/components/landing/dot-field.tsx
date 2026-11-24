"use client";

import { useEffect, useRef } from "react";

// A full bleed field of tiny square dots whose brightness follows smooth
// noise, so it reads as soft landmasses of texture behind the headline.
// Drawn once per size; no animation.

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number) {
  let t = 0, amp = 0.55, f = 1;
  for (let i = 0; i < 5; i++) {
    t += amp * noise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return t;
}

export function DotField({ className, seed = 3.7 }: { className?: string; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const cell = 7;
      const size = 2;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const n = fbm(x / 420 + seed, y / 340 - seed);
          // fine grain so the edges of each mass break up into dots
          const grain = hash(x * 0.37 + seed, y * 0.53) * 0.22;
          let a = (n + grain - 0.6) * 3.2;
          // keep the middle calm where the headline sits
          const dx = (x - w / 2) / (w * 0.42), dy = (y - h * 0.34) / (h * 0.36);
          a *= 0.35 + 0.65 * Math.min(1, Math.hypot(dx, dy));
          if (a <= 0.02) continue;
          ctx.fillStyle = `rgba(250,250,249,${Math.min(0.62, a * 0.55).toFixed(3)})`;
          ctx.fillRect(x, y, size, size);
        }
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [seed]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
