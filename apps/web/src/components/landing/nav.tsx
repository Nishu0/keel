import Link from "next/link";
import { Wordmark } from "../kit";

export function Nav() {
  return (
    <header className="sticky top-0 z-30 bg-background/75 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to content
      </a>
      <nav className="mx-auto flex h-16 max-w-[1240px] items-center gap-9 px-5 sm:px-8">
        <Link href="/" aria-label="keel home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 text-[15px] text-muted-foreground md:flex">
          <a href="#durability" className="transition-colors hover:text-foreground">How it works</a>
          <a href="#tools" className="transition-colors hover:text-foreground">Tools</a>
          <a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a>
          <a href="https://github.com/Nishu0/keel" className="transition-colors hover:text-foreground">GitHub</a>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/sign-in" className="h-9 rounded-lg px-3.5 text-[15px] leading-9 text-foreground/90 hover:text-foreground">
            Sign in
          </Link>
          <Link href="/app" className="btn-sheen h-9 rounded-lg px-4 text-[15px] leading-9 text-foreground">
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
