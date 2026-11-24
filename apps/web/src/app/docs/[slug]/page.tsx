import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, docBySlug, type Block } from "@/lib/docs";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const doc = docBySlug((await params).slug);
  return { title: doc ? `${doc.title} · Docs` : "Docs", description: doc?.lead };
}

export default async function DocPage({ params }: PageProps<"/docs/[slug]">) {
  const doc = docBySlug((await params).slug);
  if (!doc) notFound();
  const i = DOCS.indexOf(doc);
  const next = DOCS[i + 1];
  return (
    <article className="max-w-[72ch]">
      <p className="text-[13px] text-muted-foreground">{doc.group}</p>
      <h1 className="mt-1 font-serif text-[44px] leading-[1.05] text-foreground">{doc.title}</h1>
      <p className="mt-3 text-[17px] leading-[1.55] text-ink-2">{doc.lead}</p>
      <div className="mt-10 space-y-5">
        {doc.body.map((b, k) => (
          <Render key={k} b={b} />
        ))}
      </div>
      {next && (
        <Link href={`/docs/${next.slug}`} className="mt-16 block rounded-xl border border-border px-5 py-4 transition-colors hover:border-white/25">
          <span className="text-[13px] text-muted-foreground">Next</span>
          <span className="mt-0.5 block text-[16px] text-foreground">{next.title}</span>
        </Link>
      )}
    </article>
  );
}

function Render({ b }: { b: Block }) {
  if ("h" in b) return <h2 className="pt-6 text-[19px] font-medium text-foreground">{b.h}</h2>;
  if ("p" in b) return <p className="text-[15.5px] leading-[1.7] text-ink-2">{b.p}</p>;
  if ("list" in b)
    return (
      <ul className="list-disc space-y-1.5 pl-5 text-[15.5px] leading-[1.6] text-ink-2 marker:text-faint">
        {b.list.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    );
  if ("code" in b)
    return (
      <pre className="overflow-x-auto rounded-xl border border-border px-4 py-3.5 font-mono text-[13px] leading-[1.65] text-ink-2">
        <code>{b.code}</code>
      </pre>
    );
  const [head, ...rows] = b.table;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="border-b border-border text-[13px] text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.join("|")} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "whitespace-nowrap px-4 py-2.5 font-mono text-[12.5px] text-foreground" : "px-4 py-2.5 text-ink-2"}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
