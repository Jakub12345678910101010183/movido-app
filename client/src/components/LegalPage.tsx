/**
 * Shared layout for the public legal pages (privacy policy, terms).
 * Placeholders the owner must fill in are rendered with <Todo>.
 */

import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export function Todo({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber-500/15 px-1 text-amber-400">[OWNER TO CONFIRM: {children}]</mark>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-terminal">
      <Navbar />
      <main className="container max-w-3xl pt-28 pb-20">
        <p role="note" className="mb-8 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
          Draft for review. This document has not yet been reviewed by a lawyer and contains
          placeholders marked "OWNER TO CONFIRM". It must be completed and reviewed before
          MOViDO is sold commercially.
        </p>
        <h1 className="text-4xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {updated}</p>
        <div className="space-y-10 text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-foreground">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
