"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type Providers = { github: boolean; google: boolean; email: boolean };

export function SignInForm() {
  const params = useSearchParams();
  const error = params.get("error");
  const [providers, setProviders] = useState<Providers | null>(null);
  const [offline, setOffline] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/keel/v1/auth/providers")
      .then(async (r) => (r.ok ? setProviders((await r.json()) as Providers) : setOffline(true)))
      .catch(() => setOffline(true));
  }, []);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const r = await fetch("/api/keel/v1/auth/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) setSent(true);
    else setProblem(r?.status === 422 ? "That doesn't look like an email address." : "Couldn't send the link. Try again in a moment.");
  };

  const oauth = (name: "github" | "google", label: string, icon: React.ReactNode) =>
    providers?.[name] ? (
      <a
        href={`/api/keel/v1/auth/${name}/start`}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-white/12 bg-background text-[15px] text-foreground transition-colors hover:border-white/25 hover:bg-white/[0.03]"
      >
        {icon} Continue with {label}
      </a>
    ) : null;

  return (
    <div>
      {error && (
        <p role="alert" className="mb-5 rounded-lg border border-[color-mix(in_oklab,var(--st-failed)_35%,transparent)] px-3.5 py-2.5 text-[14px] text-foreground">
          {error}
        </p>
      )}
      {offline && (
        <p className="mb-5 rounded-lg border border-white/10 px-3.5 py-2.5 text-[14px] text-muted-foreground">
          The api isn&apos;t connected, so sign in is off. You can still{" "}
          <a href="/app" className="text-foreground underline underline-offset-4">
            explore the demo
          </a>
          .
        </p>
      )}

      <div className="space-y-2.5">
        {oauth("github", "GitHub", <GitHub />)}
        {oauth("google", "Google", <Google />)}
      </div>

      {providers && (providers.github || providers.google) && providers.email && (
        <div className="my-6 flex items-center gap-3 text-[12.5px] text-faint">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {providers?.email &&
        (sent ? (
          <div className="rounded-lg border border-white/10 px-4 py-4">
            <p className="text-[15px] text-foreground">Check your inbox.</p>
            <p className="mt-1 text-[14px] text-muted-foreground">
              We sent a sign in link to {email}. It works once and expires in 15 minutes.
            </p>
            <button onClick={() => setSent(false)} className="mt-3 text-[13.5px] text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-2.5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-ink-2">Work email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="h-11 w-full rounded-lg border border-white/12 bg-background px-3.5 text-[15px] text-foreground outline-none placeholder:text-faint focus:border-white/30"
              />
            </label>
            {problem && <p className="text-[13px] text-st-failed">{problem}</p>}
            <button disabled={busy} className="btn-sheen h-11 w-full rounded-lg text-[15px] text-foreground disabled:opacity-60">
              {busy ? "Sending" : "Email me a sign in link"}
            </button>
          </form>
        ))}

      {providers && !providers.github && !providers.google && !providers.email && (
        <p className="text-[14px] text-muted-foreground">
          No sign in methods are set up on this server yet. Add GitHub, Google or email settings to <code>.env</code>.
        </p>
      )}
    </div>
  );
}

function GitHub() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function Google() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
