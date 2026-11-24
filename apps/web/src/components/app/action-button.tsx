"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { act } from "@/lib/live";
import { Button } from "../kit";

/** A button that POSTs a run action and reports what happened next to it. */
export function ActionButton({
  path,
  body,
  done,
  children,
  ...rest
}: Omit<ComponentProps<typeof Button>, "onClick"> & { path: string; body?: unknown; done: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        {...rest}
        disabled={pending || rest.disabled}
        onClick={() =>
          start(async () => {
            const r = await act(path, body);
            setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          })
        }
      >
        {children}
      </Button>
      {msg && (
        <span role="status" className={`max-w-[34ch] text-[12px] ${msg.ok ? "text-st-completed" : "text-muted-foreground"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
