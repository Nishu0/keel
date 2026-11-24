import type { Metadata } from "next";
import Link from "next/link";
import { Dither } from "@/components/landing/dither";
import { ButtonLink, Wordmark } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" aria-label="keel home" className="self-start">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-16">
          <h1 className="font-serif text-[44px] leading-none text-ink">Sign in</h1>
          <p className="mt-3 text-[14.5px] text-muted">Pick up your runs where you left them.</p>
          <div className="mt-8 space-y-2.5">
            <ButtonLink href="/app" size="lg" className="w-full">
              <GitHub /> Continue with GitHub
            </ButtonLink>
            <ButtonLink href="/app" size="lg" className="w-full">
              <Google /> Continue with Google
            </ButtonLink>
          </div>
          <div className="my-6 flex items-center gap-3 text-[12.5px] text-faint">
            <span className="h-px flex-1 bg-rule" /> or <span className="h-px flex-1 bg-rule" />
          </div>
          <form action="/app" className="space-y-2.5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-ink-2">Work email</span>
              <input
                type="email"
                required
                placeholder="you@company.com"
                className="h-10 w-full rounded-md border border-rule-strong bg-raised px-3 text-[14.5px] text-ink outline-none placeholder:text-faint focus:border-ink"
              />
            </label>
            <button className="h-10 w-full rounded-md bg-ink text-[14.5px] font-medium text-paper hover:bg-ink-2">Email me a sign in link</button>
          </form>
          <p className="mt-6 text-[12.5px] text-muted">New here? Signing in creates your org on the free plan.</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l border-rule bg-surface lg:block">
        <Dither className="absolute inset-0 h-full w-full opacity-[0.16]" />
        <blockquote className="absolute bottom-12 left-12 right-12 max-w-[30ch] font-serif text-[34px] leading-[1.15] text-ink">
          A stuck run is better than a double order.
        </blockquote>
      </div>
    </main>
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
