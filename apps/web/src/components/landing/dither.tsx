"use client";

import { useEffect, useRef } from "react";

// Ordered (Bayer 8x8) dither of a long, low swell. Rendered once at low
// resolution and scaled up with nearest-neighbour so every dot stays crisp.

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3,
  35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

export function Dither({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const px = 3;
      const w = Math.ceil(c.clientWidth / px);
      const h = Math.ceil(c.clientHeight / px);
      if (!w || !h) return;
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#141413";
      const img = ctx.createImageData(w, h);
      const [r, g, b] = hex(ink);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const v = y / h;
          // swell: a few stacked sines, denser toward the bottom
          const wave =
            0.62 +
            0.07 * Math.sin(u * 5.2 + 0.6) +
            0.035 * Math.sin(u * 13.1 + 2.1) +
            0.018 * Math.sin(u * 29 + 0.3);
          const below = v - wave;
          let t = below > 0 ? 0.18 + below * 1.6 : Math.max(0, 0.16 + below * 2.4);
          // glow where the light sits on the water
          const sun = Math.exp(-((u - 0.68) ** 2) / 0.02 - ((v - wave) ** 2) / 0.004);
          t -= sun * 0.18;
          t *= 0.55 + 0.45 * Math.min(1, v * 1.4);
          const on = t > (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
          const i = (y * w + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = on ? 255 : 0;
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={ref} aria-hidden className={className} style={{ imageRendering: "pixelated" }} />;
}

function hex(s: string): [number, number, number] {
  const m = s.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((ch) => ch + ch).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
