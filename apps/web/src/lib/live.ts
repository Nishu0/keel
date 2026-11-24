"use client";

import { useEffect, useState } from "react";
import { NOW } from "./format";
import type { EventType, RunEvent } from "./types";

const TYPES: EventType[] = [
  "run.created", "run.started", "run.resumed", "model.requested", "model.completed", "model.failed",
  "tool.requested", "tool.started", "tool.completed", "tool.failed", "approval.requested", "approval.granted",
  "approval.denied", "handoff.started", "handoff.completed", "run.cancel_requested", "run.completed",
  "run.failed", "run.cancelled", "limit.exceeded",
];

const TERMINAL = new Set<EventType>(["run.completed", "run.failed", "run.cancelled", "limit.exceeded"]);

export type Source = "connecting" | "live" | "demo";

/** Tail a run's event log over SSE. Falls back to the given events when the api isn't connected. */
export function useRunEvents(runId: string, initial: RunEvent[]) {
  const [events, setEvents] = useState<RunEvent[]>(initial);
  const [source, setSource] = useState<Source>("connecting");

  useEffect(() => {
    let opened = false;
    let live: RunEvent[] = [];
    const es = new EventSource(`/api/keel/v1/runs/${encodeURIComponent(runId)}/stream`);

    const onEvent = (msg: MessageEvent<string>) => {
      const e = JSON.parse(msg.data) as RunEvent;
      if (!opened) {
        opened = true;
        live = [];
        setSource("live");
      }
      if (live.some((x) => x.seq === e.seq)) return; // reconnects replay from Last-Event-ID
      live = [...live, e].sort((a, b) => a.seq - b.seq);
      setEvents(live);
      // the server ends the stream on a terminal event; stop the browser from reconnecting
      if (TERMINAL.has(e.type)) es.close();
    };
    for (const t of TYPES) es.addEventListener(t, onEvent as EventListener);
    es.onerror = () => {
      // never connected: no api, or this run only exists in the demo data
      if (!opened) {
        es.close();
        setSource("demo");
      }
    };
    return () => es.close();
  }, [runId]);

  return { events, source };
}

export type ActResult = { ok: true } | { ok: false; error: string };

export async function act(path: string, body?: unknown): Promise<ActResult> {
  try {
    const r = await fetch(`/api/keel${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.ok) return { ok: true };
    const data = (await r.json().catch(() => ({}))) as { detail?: string; error?: string; configured?: boolean };
    if (data.configured === false) return { ok: false, error: "This is demo data. Connect the api to act on runs." };
    return { ok: false, error: data.detail ?? data.error ?? `Request failed with ${r.status}` };
  } catch {
    return { ok: false, error: "Couldn't reach the server." };
  }
}

/** GET a path from the api. `live` is false when the api isn't connected (demo mode). */
export function useApi<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; live: boolean | null; error: string | null }>({ data: null, live: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch(`/api/keel${path}`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 503) return setState({ data: null, live: false, error: null });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { detail?: string };
          return setState({ data: null, live: true, error: body.detail ?? `Request failed (${r.status})` });
        }
        setState({ data: (await r.json()) as T, live: true, error: null });
      })
      .catch(() => alive && setState({ data: null, live: false, error: null }));
    return () => {
      alive = false;
    };
  }, [path, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Send a write to the api and return a readable error, if any. */
export async function send(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<string | null> {
  try {
    const r = await fetch(`/api/keel${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.ok) return null;
    const data = (await r.json().catch(() => ({}))) as { detail?: unknown };
    return typeof data.detail === "string" ? data.detail : `Request failed (${r.status})`;
  } catch {
    return "Couldn't reach the server.";
  }
}

/** The current time, starting at the fixed demo clock so server and client render alike,
 *  then ticking in real time once mounted. */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(NOW);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs]);
  return now;
}
