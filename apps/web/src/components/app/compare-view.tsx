"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "../kit";
import { RunDiff } from "./run-diff";

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const a = params.get("a") ?? "";
  const b = params.get("b") ?? "";
  const [x, setX] = useState(a);
  const [y, setY] = useState(b);
  const field = "h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-[13px] outline-none placeholder:text-faint focus:border-white/30";
  return (
    <div className="space-y-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.replace(`/app/runs/compare?a=${encodeURIComponent(x.trim())}&b=${encodeURIComponent(y.trim())}`);
        }}
        className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <label><span className="mb-1.5 block text-[13px] text-ink-2">Run</span><input value={x} onChange={(e) => setX(e.target.value)} placeholder="run_..." className={field} /></label>
        <label><span className="mb-1.5 block text-[13px] text-ink-2">Against</span><input value={y} onChange={(e) => setY(e.target.value)} placeholder="run_..." className={field} /></label>
        <Button variant="primary" type="submit" disabled={!x.trim() || !y.trim()}>Compare</Button>
      </form>
      {a && b ? <RunDiff key={`${a}:${b}`} a={a} b={b} /> : <p className="text-[14px] text-muted-foreground">Pick two runs, for example a run and a fork of it.</p>}
    </div>
  );
}
