"use client";

import { GitFork } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../kit";

/** Start a new run that keeps everything before `step` and continues from there. */
export function ForkButton({ runId, step }: { runId: string; step: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fork = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fetch(`/api/keel/v1/runs/${encodeURIComponent(runId)}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from_step: step }),
    }).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok) return router.push(`/app/runs/${body.id}`);
    setProblem(body.configured === false ? "Demo data can't be forked. Connect the api." : (body.detail ?? "Couldn't fork this run."));
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={fork} disabled={busy} title={`New run that reuses steps before ${step} and redoes the rest`}>
        <GitFork className="size-3.5" /> {busy ? "Forking" : `Fork from step ${step}`}
      </Button>
      {problem && <span className="text-[12px] text-muted-foreground">{problem}</span>}
    </span>
  );
}
