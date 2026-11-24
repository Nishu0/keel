"use client";

import { Play, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { agents as demoAgents } from "@/lib/mock";
import { Button } from "../kit";

type AgentOption = { id: string; name: string; version: number };

export function NewRunButton({ agentId }: { agentId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  // the sidebar's "New run" links here with ?new=1
  const [open, setOpen] = useState(() => params.get("new") === "1");
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Play className="size-3.5" /> New run
      </Button>
      {open && (
        <NewRunDialog
          onClose={() => {
            setOpen(false);
            if (params.get("new")) router.replace("/app/runs", { scroll: false });
          }}
          initialAgent={agentId}
        />
      )}
    </>
  );
}

function NewRunDialog({ onClose, initialAgent }: { onClose: () => void; initialAgent?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState<AgentOption[] | null>(null);
  const [live, setLive] = useState(false);
  const [agent, setAgent] = useState(initialAgent ?? "");
  const [task, setTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    // showModal focuses the first control (the close button); start in the first field instead
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    fetch("/api/keel/v1/agents")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const list = (await r.json()) as AgentOption[];
        setLive(true);
        setOptions(list);
        setAgent((a) => a || list[0]?.id || "");
      })
      .catch(() => {
        setOptions(demoAgents.map((a) => ({ id: a.id, name: a.name, version: a.version })));
        setAgent((a) => a || demoAgents[0].id);
      });
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/keel/v1/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent_id: agent, input: { task } }),
    }).catch(() => null);
    setBusy(false);
    if (!r) return setError("Couldn't reach the server.");
    if (!r.ok) {
      const data = (await r.json().catch(() => ({}))) as { detail?: string; configured?: boolean };
      return setError(data.configured === false ? "The api isn't connected, so runs can't start from here yet." : (data.detail ?? `Couldn't start the run (${r.status}).`));
    }
    const run = (await r.json()) as { id: string };
    // close first: the previous route stays mounted (hidden) after navigation,
    // and an open modal dialog would leave the next page inert
    ref.current?.close();
    router.push(`/app/runs/${run.id}`);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-auto w-[min(520px,calc(100vw-32px))] rounded-lg border border-rule-strong bg-raised p-0 text-ink shadow-[0_30px_80px_-20px_rgb(0_0_0/0.5)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
        className="p-5"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-[26px] leading-none">Start a run</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              {live ? "Runs start on the next free worker." : "Demo data: connect the api to start real runs."}
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="rounded p-1 text-muted-foreground hover:bg-wash hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[13px] text-ink-2">Agent</span>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            disabled={!options}
            className="h-9 w-full rounded-md border border-rule-strong bg-paper px-3 text-[14px]"
          >
            {options?.length === 0 && <option value="">No agents yet</option>}
            {options?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} v{a.version}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] text-ink-2">Task</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={4}
            required
            data-autofocus
            placeholder="What should the agent do?"
            className="w-full resize-none rounded-md border border-rule-strong bg-paper px-3 py-2 text-[14px] outline-none placeholder:text-faint focus:border-ink"
          />
        </label>

        {error && <p role="alert" className="mt-3 text-[13px] text-st-failed">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" onClick={() => ref.current?.close()}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !agent || !task.trim()}>
            <Play className="size-3.5" /> {busy ? "Starting" : "Start run"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
