import Link from "next/link";
import { ButtonLink, Wordmark } from "../ui";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-paper/80 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3">
        Skip to content
      </a>
      <nav className="mx-auto flex h-14 max-w-[1160px] items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label="keel home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-6 text-[14px] text-ink-2 md:flex">
          <a href="#durability" className="hover:text-ink">How it works</a>
          <a href="#tools" className="hover:text-ink">Tools</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="https://github.com/Nishu0/keel" className="hover:text-ink">GitHub</a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/sign-in" variant="ghost" size="md">Sign in</ButtonLink>
          <ButtonLink href="/app" variant="primary" size="md">Open the app</ButtonLink>
        </div>
      </nav>
    </header>
  );
}
