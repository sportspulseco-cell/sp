import { ArrowLeft, FileSignature } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { registration } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { PublishVersionButton } from "@/components/forms/publish-version-button";

export const metadata = { title: "Form — SportsPulse" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function FormDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const form = await registration.getForm(id).catch(() => null);
  if (!form) notFound();

  const versions = await registration.listFormVersions(id).catch(() => []);

  return (
    <div className="space-y-8">
      <Link
        href="/forms"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All forms
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={FileSignature} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>FORM · {form.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {form.name}
          </h1>
          {form.description ? (
            <p className="text-[14px] text-fg-muted">{form.description}</p>
          ) : null}
          <div className="flex items-center gap-2 pt-2">
            <Badge mono>{form.scope}</Badge>
            {form.activeVersionId ? (
              <Badge tone="success" mono>
                ACTIVE · v
                {versions.find((v) => v.id === form.activeVersionId)
                  ?.versionNumber ?? "?"}
              </Badge>
            ) : (
              <Badge tone="warning" mono>
                NO ACTIVE VERSION
              </Badge>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Versions</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {versions.length} {versions.length === 1 ? "version" : "versions"}{" "}
              · publishing supersedes the previous active one
            </p>
          </div>
        </header>
        {versions.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            No versions yet. Publish a schema to activate the form.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v) => {
              const isActive = v.id === form.activeVersionId;
              return (
                <li
                  key={v.id}
                  className="flex items-center gap-4 px-6 py-4"
                >
                  <span className="font-mono text-[14px] font-semibold tabular-nums text-fg">
                    v{v.versionNumber}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      {v.publishedAt ? (
                        <span>Published {fmt(v.publishedAt)}</span>
                      ) : (
                        <span className="text-fg-muted">Draft</span>
                      )}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                      {Object.keys(v.schema ?? {}).length} top-level keys ·{" "}
                      {v.locked ? "locked" : "editable"}
                    </p>
                  </div>
                  {isActive ? (
                    <Badge tone="success" mono>
                      ACTIVE
                    </Badge>
                  ) : v.publishedAt ? (
                    <Badge mono>SUPERSEDED</Badge>
                  ) : (
                    <PublishVersionButton formId={form.id} versionId={v.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
