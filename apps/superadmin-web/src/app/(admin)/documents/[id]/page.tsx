import { ArrowLeft, FileSignature } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { compliance } from "@/lib/api/server-api";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { IconTile } from "@/components/ui/icon-tile";
import { PublishDocumentVersionForm } from "@/components/documents/publish-document-version-form";

export const metadata = { title: "Document — SportsPulse" };

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function DocumentDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await compliance.getDocument(id).catch(() => null);
  if (!doc) notFound();

  const versions = await compliance.listDocumentVersions(id).catch(() => []);

  return (
    <div className="space-y-8">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        All documents
      </Link>

      <header className="flex items-start gap-5 border-b border-border pb-8">
        <IconTile icon={FileSignature} tint="violet" size="lg" />
        <div className="space-y-2">
          <Eyebrow dot>DOCUMENT · {doc.id.slice(0, 8)}</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-[1.05] tracking-tighter text-fg">
            {doc.name}
          </h1>
          {doc.description ? (
            <p className="text-[14px] text-fg-muted">{doc.description}</p>
          ) : null}
          <div className="flex items-center gap-2 pt-2">
            <Badge mono>{doc.kind.replace(/_/g, " ")}</Badge>
            {doc.activeVersionId ? (
              <Badge tone="success" mono>
                ACTIVE · v
                {versions.find((v) => v.id === doc.activeVersionId)
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

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-1">
          <header className="border-b border-border px-6 py-4">
            <Eyebrow>Versions</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {versions.length}{" "}
              {versions.length === 1 ? "version" : "versions"} on file
            </p>
          </header>
          {versions.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-fg-muted">
              No versions. Publish content on the right to activate.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {versions.map((v) => {
                const isActive = v.id === doc.activeVersionId;
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
                        Effective from {fmt(v.effectiveFrom)}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted">
                        {v.languageCode}
                        {v.jurisdictionCountryCode
                          ? ` · ${v.jurisdictionCountryCode}`
                          : ""}{" "}
                        · {v.contentHash.slice(0, 8)}
                      </p>
                    </div>
                    {isActive ? (
                      <Badge tone="success" mono>
                        ACTIVE
                      </Badge>
                    ) : v.supersededAt ? (
                      <Badge mono>SUPERSEDED</Badge>
                    ) : (
                      <Badge mono>DRAFT</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-1">
          <header className="border-b border-border px-6 py-4">
            <Eyebrow>Publish new version</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Supersedes the current active version.
            </p>
          </header>
          <div className="p-6">
            <PublishDocumentVersionForm documentId={doc.id} />
          </div>
        </div>
      </section>
    </div>
  );
}
