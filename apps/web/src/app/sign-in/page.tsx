import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/components/kit";
import { DotField } from "@/components/landing/dot-field";
import { SignInForm } from "@/components/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Link href="/" aria-label="keel home" className="self-start">
          <Wordmark />
        </Link>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-16">
          <h1 className="font-serif text-[48px] leading-none text-foreground">Sign in</h1>
          <p className="mb-8 mt-3 text-[15px] text-muted-foreground">
            Pick up your runs where you left them. New here? Signing in creates your org on the free plan.
          </p>
          <Suspense fallback={<div className="h-40" />}>
            <SignInForm />
          </Suspense>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border lg:block">
        <DotField className="absolute inset-0 h-full w-full" seed={9.1} />
        <blockquote className="absolute bottom-12 left-12 right-12 max-w-[26ch] font-serif text-[36px] leading-[1.12] text-foreground">
          A stuck run is better than a <em className="italic">double order.</em>
        </blockquote>
      </div>
    </main>
  );
}
