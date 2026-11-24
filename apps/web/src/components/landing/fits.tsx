import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";

// Where keel sits next to the other pieces people put around an agent.
// Category level on purpose: products differ, the jobs don't.

const COLS = [
  { name: "Memory layer", q: "What does the agent know?", eg: "Facts, documents and past conversations, stored and recalled by meaning." },
  { name: "Agent harness", q: "How does the agent think and act?", eg: "The prompt, the tool loop and context handling inside one process." },
  { name: "keel", q: "What has the agent already done?", eg: "Every effect, in order, on a log any worker can resume from.", us: true },
];

type Cell = boolean | string;
const ROWS: [string, Cell, Cell, Cell][] = [
  ["Recalls relevant context across sessions", true, "Some", "Via a memory tool"],
  ["Survives the process dying at step 40", false, "Restarts from step 1", true],
  ["Never pays for a finished model call twice", false, false, true],
  ["Sends an order once, even across retries", false, false, true],
  ["Asks the tool what happened after a crash", false, false, true],
  ["Pauses for a person without holding a worker", false, false, true],
  ["Replayable record of each step and its cost", false, "Traces, if you add them", true],
];

function Mark({ v, us }: { v: Cell; us?: boolean }): ReactNode {
  if (v === true) return <Check className={us ? "mx-auto size-4 text-foreground" : "mx-auto size-4 text-ink-2"} aria-label="yes" />;
  if (v === false) return <Minus className="mx-auto size-4 text-faint" aria-label="no" />;
  return <span className="text-[13px] text-muted-foreground">{v}</span>;
}

export function Fits() {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((c) => (
          <div
            key={c.name}
            className={
              c.us
                ? "rounded-2xl border border-white/20 bg-background p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.04),0_30px_80px_-40px_rgb(255_255_255/0.15)]"
                : "rounded-2xl border border-white/[0.07] bg-background p-6"
            }
          >
            <p className="text-[14px] text-muted-foreground">{c.name}</p>
            <p className="mt-2 font-serif text-[26px] leading-[1.15] text-foreground">{c.q}</p>
            <p className="mt-3 text-[15px] leading-[1.55] text-muted-foreground">{c.eg}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-white/[0.07]">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-white/[0.07] text-[13px] text-muted-foreground">
              <th className="px-6 py-3 font-normal" />
              {COLS.map((c) => (
                <th key={c.name} className={`w-[18%] px-4 py-3 text-center font-normal ${c.us ? "text-foreground" : ""}`}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {ROWS.map(([label, ...cells]) => (
              <tr key={label}>
                <td className="px-6 py-3.5 text-ink-2">{label}</td>
                {cells.map((v, i) => (
                  <td key={i} className={`px-4 py-3.5 text-center ${i === 2 ? "bg-white/[0.025]" : ""}`}>
                    <Mark v={v} us={i === 2} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 max-w-[70ch] text-[15.5px] leading-[1.6] text-muted-foreground">
        They stack. Keep your memory layer and call it as a tool: its reads are pure, so keel reruns them freely, and its
        writes get the same once only treatment as any other external call. Bring the prompts and tools from your harness;
        keel drives the loop so a crash costs one step, not the run.
      </p>
    </div>
  );
}
