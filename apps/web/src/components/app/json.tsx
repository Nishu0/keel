import type { ReactNode } from "react";

// Readable, lightly coloured JSON. No dependency, handles what events carry.
export function Json({ value, className = "" }: { value: unknown; className?: string }) {
  return (
    <pre className={`overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.65] text-ink-2 ${className}`}>
      {render(value, 0)}
    </pre>
  );
}

function render(v: unknown, depth: number): ReactNode {
  const pad = "  ".repeat(depth);
  if (v === null || v === undefined) return <span className="text-faint">null</span>;
  if (typeof v === "string") {
    if (v.includes("\n")) {
      return (
        <span className="text-st-completed">
          {'"'}
          {v.split("\n").map((line, i) => (
            <span key={i}>
              {i > 0 && <>{"\n" + pad + "  "}</>}
              {line}
            </span>
          ))}
          {'"'}
        </span>
      );
    }
    return <span className="text-st-completed">&quot;{v}&quot;</span>;
  }
  if (typeof v === "number") return <span className="text-st-running">{v}</span>;
  if (typeof v === "boolean") return <span className="text-st-waiting">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return (
      <>
        {"[\n"}
        {v.map((x, i) => (
          <span key={i}>
            {pad}
            {"  "}
            {render(x, depth + 1)}
            {i < v.length - 1 ? ",\n" : "\n"}
          </span>
        ))}
        {pad}]
      </>
    );
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return (
    <>
      {"{\n"}
      {entries.map(([k, x], i) => (
        <span key={k}>
          {pad}
          {"  "}
          <span className="text-ink">{k}</span>
          <span className="text-faint">: </span>
          {render(x, depth + 1)}
          {i < entries.length - 1 ? ",\n" : "\n"}
        </span>
      ))}
      {pad}
      {"}"}
    </>
  );
}
