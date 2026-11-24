"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { MARK_K } from "../kit";
import { Dither } from "./dither";

// the ribbon's copy: a short claim in bold, then the plain version of it
const RIBBON: [string, string][] = [
  ["Crash proof runs", "Kill a worker at any line. The next one carries on."],
  ["At most once tools", "Every call carries a stable idempotency key."],
  ["Fork from any step", "Rerun with a change and reuse what came before."],
  ["Runs that start themselves", "On a cron, or when something posts to a url."],
];

const LINKS: [string, string][] = [
  ["Docs", "/docs"],
  ["Self host", "/docs/self-host"],
  ["Api", "/docs/api"],
  ["GitHub", "https://github.com/Nishu0/keel"],
];

// drawn in the wordmark's 0..1200 space, running far past both sides so it reaches the window edges
const RIBBON_PATH = "M -640 60 C -280 110, 20 330, 420 314 S 1120 196, 1840 40";

function Ribbon() {
  const text = useRef<SVGTextPathElement>(null);

  useEffect(() => {
    const el = text.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // the copy is written twice; slide left by one copy's width, then wrap, so it never jumps
    const measure = () => (el.parentElement as unknown as SVGTextElement).getComputedTextLength() / 2;
    let loop = measure();
    const onResize = () => (loop = measure()); // the text doubles in size on small screens
    window.addEventListener("resize", onResize);
    let offset = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      offset = (offset - (now - last) * 0.045) % loop;
      last = now;
      el.setAttribute("startOffset", String(offset));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const copy = (k: string) =>
    RIBBON.map(([bold, plain], i) => (
      <tspan key={`${k}${i}`}>
        <tspan fontWeight={650}>{bold}</tspan>
        <tspan dx="14">{plain}</tspan>
        <tspan dx="18" fill="#3f6b33">◆</tspan>
        <tspan>{"\u00a0\u00a0\u00a0"}</tspan>
      </tspan>
    ));

  return (
    <>
      {/* on phones the whole drawing shrinks a lot, so the band and its text grow to stay readable */}
      <path d={RIBBON_PATH} fill="none" stroke="#bfe3a8" className="[stroke-width:44px] max-sm:[stroke-width:92px]" />
      <text className="text-[18px] max-sm:text-[40px]" fill="#101011" dominantBaseline="central" style={{ fontFamily: "var(--font-inter)" }}>
        <textPath ref={text} href="#keel-ribbon" startOffset="0">
          {copy("a")}
          {copy("b")}
        </textPath>
      </text>
    </>
  );
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-rule">
      {/* the dithered swell rising from the bottom edge, behind everything */}
      <Dither className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]" />
      {/* full width, but scaled to the content column: slice keeps the 0..1200 core at the column's
          width and lets the ribbon spill out to the window edges */}
      <svg
        viewBox="-600 0 2400 420"
        preserveAspectRatio="xMidYMid slice"
        className="relative mt-16 block w-full sm:mt-24"
        style={{ height: "calc(min(100vw - 40px, 1176px) * 0.35)" }}
        role="img"
        aria-label="keel"
      >
        <defs>
          <path id="keel-ribbon" d={RIBBON_PATH} />
        </defs>
        <text
          x="600"
          y="345"
          textAnchor="middle"
          textLength="1000"
          lengthAdjust="spacingAndGlyphs"
          fontSize="390"
          fontWeight="800"
          letterSpacing="-6"
          fill="#fafaf9"
          transform="skewX(-11) translate(62 0)"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          keel
        </text>
        {/* the mark, stuck on the last letter like a sticker */}
        <g transform="translate(1028 18) rotate(14 40 40) scale(3.3)">
          <rect width="24" height="24" rx="6" fill="#d8ccff" />
          <g transform="translate(3.6 3.6) scale(0.7)" fill="none" stroke="#101011" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round">
            {MARK_K.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
        <Ribbon />
      </svg>

      <div className="relative mx-auto max-w-[1240px] px-5 sm:px-8">
        <div className="mt-10 grid items-center gap-5 border-t border-rule py-7 text-[12.5px] uppercase tracking-[0.12em] text-ink-2 md:grid-cols-[1fr_auto_1fr]">
          <p>© 2026 keel</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-1">
            {LINKS.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="rounded-md bg-foreground px-2.5 py-1.5 font-semibold text-background transition-opacity hover:opacity-85"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 md:justify-end">
            <span>A product by</span>
            <a
              href="https://itsnishu.com/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-md bg-[#d8ccff] px-2.5 py-1.5 font-semibold text-[#101011] transition-opacity hover:opacity-85"
            >
              Nisarg <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
