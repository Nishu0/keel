"use client";

import { useState } from "react";
import { cx, usd } from "@/lib/format";

// Daily spend stacked by agent. Categorical slots 1-4 from the validated
// reference palette; light and dark steps are chosen separately.
export interface Series {
  id: string;
  name: string;
  light: string;
  dark: string;
}
export interface Day {
  date: string; // YYYY-MM-DD
  values: Record<string, number>;
}

const H = 220;
const GAP = 2;

export function UsageChart({ series, days }: { series: Series[]; days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = days.map((d) => series.reduce((s, x) => s + (d.values[x.id] ?? 0), 0));
  const max = niceMax(Math.max(...totals));
  const ticks = [0, max / 2, max];

  return (
    <figure className="rounded-lg border border-rule-strong bg-raised p-5">
      <style>{series.map((s, i) => `.sw-${i}{--c:${s.light}}@media (prefers-color-scheme:dark){.sw-${i}{--c:${s.dark}}}`).join("")}</style>
      <figcaption className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <span className="text-[14px] font-medium text-ink">Spend per day, by agent</span>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2" aria-label="Legend">
          {series.map((s, i) => (
            <li key={s.id} className="inline-flex items-center gap-1.5">
              <i className={cx("size-2.5 rounded-[3px] bg-[var(--c)]", `sw-${i}`)} />
              {s.name}
            </li>
          ))}
        </ul>
        <button onClick={() => setTable((t) => !t)} className="ml-auto text-[12.5px] text-muted-foreground underline decoration-rule-strong underline-offset-4 hover:text-ink">
          {table ? "Show chart" : "Show table"}
        </button>
      </figcaption>

      {table ? (
        <div className="mt-4 overflow-x-auto">
          <table className="tnum w-full text-right text-[12.5px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-rule">
                <th className="py-1.5 text-left font-normal">Day</th>
                {series.map((s) => <th key={s.id} className="py-1.5 font-normal">{s.name}</th>)}
                <th className="py-1.5 font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="text-ink-2">
              {days.map((d, i) => (
                <tr key={d.date} className="border-b border-rule last:border-0">
                  <td className="py-1.5 text-left">{label(d.date)}</td>
                  {series.map((s) => <td key={s.id} className="py-1.5">{usd(d.values[s.id] ?? 0)}</td>)}
                  <td className="py-1.5 text-ink">{usd(totals[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-5 flex gap-3">
          {/* y axis */}
          <div className="tnum relative w-10 shrink-0 text-right text-[11.5px] text-muted-foreground" style={{ height: H }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: H - (t / max) * H }}>
                {money(t, max)}
              </span>
            ))}
          </div>
          {/* few days: keep bars bar shaped instead of stretching across the card */}
          <div className="relative min-w-0 flex-1" style={{ maxWidth: Math.max(days.length * 72, 160) }}>
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className={cx("absolute inset-x-0 h-px", t === 0 ? "bg-rule-strong" : "bg-rule")}
                style={{ top: H - (t / max) * H }}
              />
            ))}
            <div className="relative flex items-end gap-[6px]" style={{ height: H }} role="img" aria-label={`Stacked bars of daily spend per agent over ${days.length} days`}>
              {days.map((d, i) => {
                let acc = 0;
                const segs = series.map((s, si) => {
                  const v = d.values[s.id] ?? 0;
                  const h = (v / max) * H;
                  const seg = { si, h, bottom: acc };
                  acc += h;
                  return seg;
                }).filter((s) => s.h > 0);
                return (
                  <div
                    key={d.date}
                    className="group relative h-full flex-1"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {hover === i && <div className="absolute inset-0 -mx-[3px] rounded-sm bg-wash" aria-hidden />}
                    {segs.map((s, k) => (
                      <div
                        key={s.si}
                        className={cx("absolute inset-x-0 bg-[var(--c)]", `sw-${s.si}`, k === segs.length - 1 && "rounded-t-[4px]")}
                        style={{ bottom: s.bottom + k * 0, height: Math.max(0, s.h - (k < segs.length - 1 ? GAP : 0)) }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="tnum mt-2 flex gap-[6px] text-[11px] text-muted-foreground" aria-hidden>
              {days.map((d, i) => (
                <span key={d.date} className="flex-1 text-center">{i % 2 === 0 || i === days.length - 1 ? label(d.date, true) : ""}</span>
              ))}
            </div>

            {hover !== null && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-52 rounded-md border border-rule-strong bg-raised px-3 py-2.5 text-[12.5px] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.3)]"
                style={{ left: `clamp(0px, calc(${((hover + 0.5) / days.length) * 100}% - 104px), calc(100% - 208px))` }}
              >
                <p className="text-muted-foreground">{label(days[hover].date)}</p>
                <ul className="mt-1.5 space-y-1">
                  {[...series].reverse().map((s) => {
                    const si = series.indexOf(s);
                    return (
                      <li key={s.id} className="flex items-center gap-2 text-ink-2">
                        <i className={cx("size-2 rounded-[2px] bg-[var(--c)]", `sw-${si}`)} />
                        <span className="flex-1">{s.name}</span>
                        <span className="tnum text-ink">{usd(days[hover].values[s.id] ?? 0)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="tnum mt-1.5 flex justify-between border-t border-rule pt-1.5 text-ink">
                  <span>Total</span>
                  <span>{usd(totals[hover])}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </figure>
  );
}

// round up to 1, 2 or 5 times a power of ten, so small spend still fills the chart
function niceMax(v: number) {
  if (v <= 0) return 1;
  const target = v * 1.05;
  const mag = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].find((m) => m * mag >= target)! * mag;
}

function money(v: number, max: number) {
  if (v === 0) return "$0";
  if (max < 0.1) return `$${v.toFixed(3)}`;
  if (max < 1) return `$${v.toFixed(2)}`;
  return `$${v % 1 ? v.toFixed(1) : v.toFixed(0)}`;
}

function label(date: string, short = false) {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC", ...(short ? {} : { weekday: "short" }) });
}
