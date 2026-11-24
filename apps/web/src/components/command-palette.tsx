"use client";

import { ArrowRight, Bot, CirclePlus, FileText, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";

type Item = { id: string; label: string; hint?: string; group: string; href: string; icon: React.ReactNode };
type RunRow = { id: string; agent_id: string; status: string; input?: { task?: unknown } };
type AgentRow = { id: string; name: string };

export const OPEN_PALETTE = "keel:palette";

const PAGES: [string, string][] = [
  ["Overview", "/app"],
  ["Runs", "/app/runs"],
  ["Agents", "/app/agents"],
  ["Tools", "/app/tools"],
  ["Automations", "/app/automations"],
  ["Compare runs", "/app/runs/compare"],
  ["Usage", "/app/usage"],
  ["Billing", "/app/settings/billing"],
  ["Members", "/app/settings/members"],
  ["API keys", "/app/settings/keys"],
  ["Secrets", "/app/settings/secrets"],
  ["Docs", "/docs"],
];

/** ⌘K / Ctrl+K: jump to a page, a recent run or an agent. */
export function CommandPalette() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);

  const show = useCallback(() => {
    setQ("");
    setAt(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else show();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener(OPEN_PALETTE, show);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener(OPEN_PALETTE, show);
    };
  }, [open, show]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
      // fetch fresh each time it opens; both are small
      fetch("/api/keel/v1/runs?limit=20").then((r) => (r.ok ? r.json() : [])).then(setRuns).catch(() => {});
      fetch("/api/keel/v1/agents").then((r) => (r.ok ? r.json() : [])).then(setAgents).catch(() => {});
    } else if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
    const all: Item[] = [
      { id: "new", label: "New run", group: "Actions", href: "/app/runs?new=1", icon: <CirclePlus className="size-4" /> },
      ...PAGES.map(([label, href]) => ({ id: href, label, group: "Go to", href, icon: <ArrowRight className="size-4" /> })),
      ...runs.map((r) => ({
        id: r.id,
        label: typeof r.input?.task === "string" ? r.input.task : r.id,
        hint: `${names[r.agent_id] ?? r.agent_id} · ${r.status.replaceAll("_", " ")}`,
        group: "Recent runs",
        href: `/app/runs/${r.id}`,
        icon: <FileText className="size-4" />,
      })),
      ...agents.map((a) => ({ id: a.id, label: a.name, hint: "Runs for this agent", group: "Agents", href: `/app/runs?agent=${a.id}`, icon: <Bot className="size-4" /> })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all.filter((i) => i.group !== "Agents").slice(0, 14);
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.id}`.toLowerCase().includes(needle)).slice(0, 30);
  }, [q, runs, agents]);

  const go = (i: Item | undefined) => {
    if (!i) return;
    setOpen(false); // close first: a modal left open in the old route would trap the page
    router.push(i.href);
  };

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === ref.current && setOpen(false)}
      className="m-auto mt-[14vh] w-[min(620px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="size-4 text-muted-foreground" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((n) => Math.min(n + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((n) => Math.max(n - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[at]);
            }
          }}
          placeholder="Search pages, runs and agents"
          aria-label="Search"
          aria-controls="palette-list"
          aria-activedescendant={items[at] ? `pal-${at}` : undefined}
          className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <kbd className="rounded border border-border px-1.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-6 text-center text-[13.5px] text-muted-foreground">Nothing matches “{q}”.</li>}
        {items.map((i, n) => {
          const header = i.group !== lastGroup ? i.group : null;
          lastGroup = i.group;
          return (
            <li key={`${i.group}:${i.id}`} role="presentation">
              {header && <p className="px-3 pb-1 pt-2.5 text-[12px] text-muted-foreground">{header}</p>}
              <button
                id={`pal-${n}`}
                role="option"
                aria-selected={n === at}
                onMouseMove={() => setAt(n)}
                onClick={() => go(i)}
                className={cx("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", n === at ? "bg-white/[0.07]" : "")}
              >
                <span className="text-muted-foreground">{i.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{i.label}</span>
                {i.hint && <span className="shrink-0 text-[12.5px] text-muted-foreground">{i.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
