import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { communications } from "@/lib/api/server-api";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import {
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@/components/ui/table";
import { UpsertTemplateButton } from "@/components/communications/upsert-template-button";
import { DeleteTemplateButton } from "@/components/communications/delete-template-button";

export const metadata = { title: "Notification templates — SportsPulse" };

export default async function TemplatesPage() {
  const page = await communications
    .listTemplates({ limit: 200 })
    .catch(() => ({ items: [], nextCursor: null }));

  const grouped = new Map<string, typeof page.items>();
  for (const t of page.items) {
    const list = grouped.get(t.code) ?? [];
    list.push(t);
    grouped.set(t.code, list);
  }

  return (
    <div className="space-y-8">
      <Link
        href="/communications"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Outbox
      </Link>

      <PageHeader
        eyebrow="OPERATIONS"
        title="Notification templates"
        description="Per (org, code, channel, locale) — the source of subjects + body. Code-level defaults live in the catalog; UI rows here override per-org."
        action={<UpsertTemplateButton />}
      />

      {page.items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          description="Notifications fall back to the built-in catalog (registration.approved, game.finalized, etc.) until you override here."
          action={<UpsertTemplateButton />}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([code, items]) => (
            <section
              key={code}
              className="rounded-xl border border-border bg-surface-1"
            >
              <header className="border-b border-border px-6 py-4">
                <Eyebrow>{code}</Eyebrow>
                <p className="mt-1 text-[13px] text-fg-muted">
                  {items.length}{" "}
                  {items.length === 1 ? "variant" : "variants"} (channel ×
                  locale × org)
                </p>
              </header>
              <Table>
                <THead>
                  <TR>
                    <TH>Channel</TH>
                    <TH>Locale</TH>
                    <TH>Org</TH>
                    <TH>Subject</TH>
                    <TH>State</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {items.map((t) => (
                    <TR key={t.id}>
                      <TD>
                        <Badge mono>{t.channel}</Badge>
                      </TD>
                      <TD className="font-mono text-[11px] text-fg-muted">
                        {t.locale}
                      </TD>
                      <TD className="font-mono text-[11px] text-fg-muted">
                        {t.orgId
                          ? t.orgId.slice(0, 8)
                          : "platform default"}
                      </TD>
                      <TD className="max-w-md truncate text-fg">
                        {t.subject ?? <span className="text-fg-muted">—</span>}
                      </TD>
                      <TD>
                        <Badge tone={t.isActive ? "success" : "neutral"} mono>
                          {t.isActive ? "ACTIVE" : "OFF"}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <UpsertTemplateButton template={t} />
                          <DeleteTemplateButton id={t.id} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
