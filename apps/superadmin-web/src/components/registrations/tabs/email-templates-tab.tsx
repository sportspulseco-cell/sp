"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { registrationV2 as REG_API } from "@/lib/api/browser-api";
import type {
  EmailEventType,
  EmailTemplate,
  EmailTypeFilter
} from "@/lib/api/sdk";

const EVENT_TYPES: { value: EmailEventType; label: string }[] = [
  { value: "on_payment", label: "Payment confirmed" },
  { value: "on_approved", label: "Approved" },
  { value: "on_rejected", label: "Rejected" },
  { value: "installment_reminder", label: "Installment reminder" },
  { value: "season_closing", label: "Season closing" },
  { value: "parental_consent", label: "Parental consent" },
  { value: "custom", label: "Custom" }
];

const TYPE_FILTERS: { value: EmailTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "team", label: "Team" },
  { value: "individual", label: "Individual" }
];

export function EmailTemplatesTab({
  seasonId,
  templates,
  onTemplatesChange
}: {
  seasonId: string;
  templates: EmailTemplate[];
  onTemplatesChange: (next: EmailTemplate[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTemplate(eventType: EmailEventType) {
    setCreating(true);
    setError(null);
    try {
      const created = await REG_API.createEmailTemplate({
        seasonId,
        eventType,
        registrationTypeFilter: "all",
        subject: `[Action] ${eventType.replace(/_/g, " ")}`,
        bodyHtml: "<p>Edit this template body…</p>",
        isActive: false
      });
      onTemplatesChange([...templates, created]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  }

  async function patchTemplate(id: string, patch: Partial<EmailTemplate>) {
    const optimistic = templates.map((t) =>
      t.id === id ? { ...t, ...patch } : t
    );
    onTemplatesChange(optimistic);
    try {
      const updated = await REG_API.updateEmailTemplate(id, patch);
      onTemplatesChange(optimistic.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      onTemplatesChange(templates);
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Delete this email template?")) return;
    try {
      await REG_API.deleteEmailTemplate(id);
      onTemplatesChange(templates.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const usedEventTypes = new Set(templates.map((t) => t.eventType));
  const availableTypes = EVENT_TYPES.filter(
    (e) => !usedEventTypes.has(e.value) || e.value === "custom"
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
            // 05 · Email Templates
          </p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
            Email templates
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            One template per (event type, registration filter). Auto-saves on
            blur. Set <span className="font-mono">Active</span> to wire into
            the live notification map.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {availableTypes.map((e) => (
          <button
            key={e.value}
            type="button"
            onClick={() => addTemplate(e.value)}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg disabled:opacity-50"
          >
            <Plus className="h-3 w-3" strokeWidth={2.25} />
            {e.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-error/30 bg-error/5 px-3 py-2 text-[12px] text-error">
          {error}
        </div>
      )}

      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
          <p className="text-[14px] text-fg-muted">
            No templates yet. Click any event-type button above to start.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-xl border border-border bg-surface-1 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {EVENT_TYPES.find((e) => e.value === t.eventType)?.label ??
                      t.eventType}
                    {" · "}
                    {t.registrationTypeFilter}
                  </p>
                  <input
                    defaultValue={t.subject}
                    onBlur={(e) =>
                      e.target.value !== t.subject &&
                      patchTemplate(t.id, { subject: e.target.value })
                    }
                    placeholder="Subject"
                    className="mt-1 w-full bg-transparent text-[15px] font-semibold tracking-tight text-fg outline-none focus:bg-surface-2 focus:px-1 focus:py-0.5 focus:rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={t.registrationTypeFilter}
                    onChange={(e) =>
                      patchTemplate(t.id, {
                        registrationTypeFilter: e.target.value as EmailTypeFilter
                      })
                    }
                    className="rounded-md border border-border bg-bg-elev px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg"
                  >
                    {TYPE_FILTERS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      patchTemplate(t.id, { isActive: !t.isActive })
                    }
                    className={
                      t.isActive
                        ? "inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-success"
                        : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        t.isActive ? "bg-success" : "bg-fg-subtle"
                      }`}
                    />
                    {t.isActive ? "Active" : "Inactive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-error"
                    title="Delete template"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              <textarea
                defaultValue={t.bodyHtml}
                onBlur={(e) =>
                  e.target.value !== t.bodyHtml &&
                  patchTemplate(t.id, { bodyHtml: e.target.value })
                }
                rows={4}
                className="mt-4 w-full resize-y rounded-md border border-border bg-bg-elev px-3 py-2 font-mono text-[12px] text-fg focus:border-fg-muted focus:outline-none"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
