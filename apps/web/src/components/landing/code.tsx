import type { ReactNode } from "react";

// Tiny hand-rolled highlighter: we only ever show a few known snippets.
const K = ({ children }: { children: ReactNode }) => <span className="text-[#c7a3ff]">{children}</span>;
const S = ({ children }: { children: ReactNode }) => <span className="text-[#9fd8a8]">{children}</span>;
const C = ({ children }: { children: ReactNode }) => <span className="text-[#7d7d78]">{children}</span>;
const F = ({ children }: { children: ReactNode }) => <span className="text-[#8fbcff]">{children}</span>;
const D = ({ children }: { children: ReactNode }) => <span className="text-[#f0b46a]">{children}</span>;

export function CodeWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-black/40 bg-[#161615] text-[#e9e9e5] shadow-[0_24px_60px_-30px_rgb(0_0_0/0.5)]">
      <figcaption className="flex h-9 items-center border-b border-white/8 px-4 font-mono text-[12px] text-[#8b8b86]">
        {title}
      </figcaption>
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-[1.7]">{children}</pre>
    </figure>
  );
}

export function ToolSnippet() {
  return (
    <CodeWindow title="tools/orders.py">
      <code>
        <D>@tool</D>(effect=<S>&quot;external&quot;</S>, timeout_s=<D>30</D>, reconcile=order_status){"\n"}
        <K>async def</K> <F>place_order</F>(market_id: <F>str</F>, side: <F>Side</F>, size: <F>float</F>, *, idempotency_key: <F>str</F>) -&gt; <F>Order</F>:{"\n"}
        {"    "}<C># keel passes the same key on every retry of this logical call</C>{"\n"}
        {"    "}<K>return await</K> desk.orders.create(market_id, side, size, key=idempotency_key){"\n"}
        {"\n"}
        <K>async def</K> <F>order_status</F>(idempotency_key: <F>str</F>) -&gt; <F>Order</F> | <K>None</K>:{"\n"}
        {"    "}<C># asked after a crash: did this call land or not?</C>{"\n"}
        {"    "}<K>return await</K> desk.orders.find(key=idempotency_key)
      </code>
    </CodeWindow>
  );
}

export function RunSnippet() {
  return (
    <CodeWindow title="terminal">
      <code>
        <C>$</C> curl -X POST https://api.keel.run/v1/runs \{"\n"}
        {"    "}-H <S>&quot;Authorization: Bearer kl_live_ab12…&quot;</S> \{"\n"}
        {"    "}-d <S>{`'{"agent_id": "agt_trader", "input": {"task": "Rebalance FED-DEC"}}'`}</S>{"\n"}
        {"\n"}
        <C>{`{ "id": "run_01JDX4K9TQ", "status": "queued" }`}</C>{"\n"}
        {"\n"}
        <C>$</C> keel watch run_01JDX4K9TQ
      </code>
    </CodeWindow>
  );
}
