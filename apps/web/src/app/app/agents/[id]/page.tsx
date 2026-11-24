import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentEditor } from "@/components/app/agent-editor";
import { PageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui";
import { agentById, agents, tools } from "@/lib/mock";

export function generateStaticParams() {
  return agents.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: PageProps<"/app/agents/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: agentById(id)?.name ?? "Agent" };
}

export default async function AgentPage({ params }: PageProps<"/app/agents/[id]">) {
  const { id } = await params;
  const agent = agentById(id);
  if (!agent) notFound();
  return (
    <>
      <PageHeader
        crumbs={
          <span className="flex items-center gap-2">
            <Link href="/app/agents" className="hover:text-ink">Agents</Link>
            <span className="text-faint">/</span>
            <span className="text-ink-2">{agent.name}</span>
          </span>
        }
        title={agent.name}
        sub={agent.description}
        actions={<ButtonLink href={`/app/runs?agent=${agent.id}`}>View runs</ButtonLink>}
      />
      <AgentEditor agent={agent} allTools={tools} />
    </>
  );
}
