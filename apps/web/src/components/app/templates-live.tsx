"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../kit";

type Template = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  approval_required: string[];
  sample_task: string;
  missing: string[];
};

/** Starter agents. Using one creates the agent and starts its sample run, then opens that run. */
export function Templates({ onCreated }: { onCreated: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/keel/v1/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows?.length) return null;

  const use = async (t: Template) => {
    setBusy(t.id);
    setProblem(null);
    const r = await fetch(`/api/keel/v1/templates/${t.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setProblem(body.detail ?? "Couldn't create the agent.");
    onCreated();
    if (body.run_id) router.push(`/app/runs/${body.run_id}`);
  };

  return (
    <div className="mt-8">
      <h3 className="text-[14px] font-medium text-ink">Start from a template</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Creates the agent and runs its sample task, so you can watch a durable run straight away.</p>
      <ul className="mt-3 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2">
        {rows.map((t) => (
          <li key={t.id} className="flex flex-col bg-background px-4 py-4">
            <p className="text-[14.5px] text-ink">{t.name}</p>
            <p className="mt-1 text-[13px] text-ink-2">{t.description}</p>
            <p className="mt-3 text-[12.5px] text-muted-foreground">Sample: {t.sample_task}</p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {t.tools.map((x) => (
                <span key={x} className={`rounded border border-rule px-1.5 font-mono text-[11px] ${t.missing.includes(x) ? "text-faint line-through" : "text-ink-2"}`}>
                  {x}
                  {t.approval_required.includes(x) && <span className="ml-1 font-sans text-st-review">approval</span>}
                </span>
              ))}
              <Button size="sm" className="ml-auto" disabled={busy !== null} onClick={() => use(t)}>
                {busy === t.id ? "Creating" : "Use template"}
              </Button>
            </div>
            {t.missing.length > 0 && (
              <p className="mt-2 text-[12px] text-muted-foreground">{t.missing.join(", ")} isn&apos;t available here yet, so it&apos;ll be left out.</p>
            )}
          </li>
        ))}
      </ul>
      {problem && <p className="mt-2 text-[13px] text-st-failed">{problem}</p>}
    </div>
  );
}
