"""keel cli.

    keel run <agent_id> "task text"     start a run and watch it
    keel watch <run_id>                 tail a run's events live
    keel runs [--status S]              list recent runs

Reads KEEL_API_URL (default http://localhost:8000) and KEEL_API_KEY.
"""

from __future__ import annotations

import argparse
import sys
from typing import Any

from keel.client import TERMINAL, Keel, KeelError

DIM, BOLD, RESET = ("\033[2m", "\033[1m", "\033[0m") if sys.stdout.isatty() else ("", "", "")
COLORS = {
    "completed": "\033[32m",
    "failed": "\033[31m",
    "resumed": "\033[34m",
    "approval": "\033[33m",
    "doubt": "\033[33m",
}


def _paint(kind: str, text: str) -> str:
    if not sys.stdout.isatty():
        return text
    for k, c in COLORS.items():
        if k in kind:
            return f"{c}{text}{RESET}"
    return text


def describe(e: dict[str, Any]) -> str:
    p, t = e["payload"], e["type"]
    match t:
        case "model.completed":
            calls = ", ".join(tc["name"] for tc in p.get("tool_calls", []))
            return p.get("text", "") + (f"  {DIM}-> {calls}{RESET}" if calls else "")
        case "tool.started":
            return f"{p['name']} {DIM}{p.get('effect', '')}{RESET}"
        case "tool.completed":
            extra = " reconciled" if p.get("reconciled") else ""
            return f"{p['name']} done{extra} {DIM}{p.get('duration_ms', '')}ms{RESET}"
        case "tool.failed":
            return f"{p['name']} " + (
                "in doubt: " + p.get("reason", "") if p.get("in_doubt") else p.get("error", "")
            )
        case "run.resumed":
            return f"resumed on {p.get('worker')}, replayed {p.get('replayed_events')} events"
        case "approval.requested":
            return f"{p['name']} needs approval ({p['call_id']})"
        case "run.completed":
            return p.get("output", "")
        case _:
            return ""


def watch(k: Keel, run_id: str) -> int:
    for e in k.runs.stream(run_id):
        label = f"{e['type']:<20}"
        print(f"{DIM}{e['seq']:>4} {e['step']:>3}{RESET}  {_paint(e['type'], label)} {describe(e)}")
        if e["type"] in TERMINAL:
            return 0 if e["type"] == "run.completed" else 1
    # the stream ended without a terminal event: the run paused for a person
    print(f"\n{BOLD}{k.runs.get(run_id)['status']}{RESET}")
    return 2


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="keel")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("agent_id")
    r.add_argument("task")
    r.add_argument("--detach", action="store_true")
    w = sub.add_parser("watch")
    w.add_argument("run_id")
    ls = sub.add_parser("runs")
    ls.add_argument("--status")
    args = ap.parse_args(argv)

    try:
        k = Keel()
    except ValueError:
        sys.exit("set KEEL_API_KEY to an api key from Settings > API keys")
    with k:
        try:
            if args.cmd == "run":
                run = k.runs.create(args.agent_id, {"task": args.task})
                print(f"{BOLD}{run['id']}{RESET} {run['status']}")
                return 0 if args.detach else watch(k, run["id"])
            if args.cmd == "watch":
                return watch(k, args.run_id)
            for run in k.runs.list(status=args.status):
                print(f"{run['id']}  {run['status']:<22} {run['input'].get('task', '')[:60]}")
            return 0
        except KeelError as e:
            sys.exit(f"keel: {e.detail} ({e.status})")


if __name__ == "__main__":
    sys.exit(main())
