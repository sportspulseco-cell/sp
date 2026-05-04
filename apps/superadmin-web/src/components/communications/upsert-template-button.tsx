"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { communications, orgs as orgsApi } from "@/lib/api/browser-api";
import type { NotificationTemplate, Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const CODES = [
  "registration.submitted",
  "registration.approved",
  "registration.rejected",
  "registration.waitlisted",
  "game.scheduled",
  "game.postponed",
  "game.cancelled",
  "game.finalized",
  "suspension.issued",
  "suspension.lifted",
  "roster.added",
  "roster.dropped"
];

export function UpsertTemplateButton({
  template
}: {
  template?: NotificationTemplate;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: template?.code ?? CODES[0]!,
    channel: (template?.channel ?? "email") as "email" | "sms" | "in_app",
    locale: template?.locale ?? "en",
    orgId: template?.orgId ?? "",
    subject: template?.subject ?? "",
    bodyTemplate: template?.bodyTemplate ?? "",
    variables: (template?.variables ?? []).join(", "),
    isActive: template?.isActive ?? true
  });
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    orgsApi
      .list({ limit: 200 })
      .then((p) => setOrgs(p.items))
      .catch(() => setOrgs([]));
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await communications.upsertTemplate({
        orgId: form.orgId || null,
        code: form.code,
        channel: form.channel,
        locale: form.locale,
        subject: form.subject || null,
        bodyTemplate: form.bodyTemplate,
        variables: form.variables
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        isActive: form.isActive
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const isEdit = !!template;

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg"
        >
          <Pencil className="mr-1 inline h-3 w-3" strokeWidth={1.75} />
          Edit
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New template
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={isEdit ? "Edit template" : "New / upsert template"}
        description={
          isEdit
            ? "Edits the template body, subject, and variables. Re-keying changes are upserts on (org, code, channel, locale)."
            : "Templates are unique on (org, code, channel, locale). Re-submitting an existing tuple updates it in place."
        }
        size="lg"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code" htmlFor="ut-code">
              <Select
                id="ut-code"
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              >
                {CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Channel" htmlFor="ut-channel">
              <Select
                id="ut-channel"
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value as typeof form.channel })
                }
              >
                <option value="email">email</option>
                <option value="sms">sms</option>
                <option value="in_app">in_app</option>
              </Select>
            </Field>
            <Field label="Locale" htmlFor="ut-locale">
              <Input
                id="ut-locale"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
                placeholder="en / fr-CA"
              />
            </Field>
          </div>
          <Field
            label="Organization"
            htmlFor="ut-org"
            hint="Leave as platform default unless this template should override only for one org."
          >
            <Select
              id="ut-org"
              value={form.orgId}
              onChange={(e) => setForm({ ...form, orgId: e.target.value })}
            >
              <option value="">Platform default (all orgs)</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Subject"
            htmlFor="ut-subject"
            hint="Mustache-style {{variables}} substituted at queue time."
          >
            <Input
              id="ut-subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Registration approved — {{leagueName}}"
            />
          </Field>
          <Field label="Body template" htmlFor="ut-body">
            <textarea
              id="ut-body"
              required
              rows={8}
              value={form.bodyTemplate}
              onChange={(e) =>
                setForm({ ...form, bodyTemplate: e.target.value })
              }
              placeholder={"Hi {{personName}},\n\nGreat news — your registration for {{leagueName}} has been approved."}
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-[12px] text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus"
            />
          </Field>
          <Field
            label="Variables"
            htmlFor="ut-vars"
            hint="Comma-separated, used for validation + UI hints."
          >
            <Input
              id="ut-vars"
              value={form.variables}
              onChange={(e) => setForm({ ...form, variables: e.target.value })}
              placeholder="personName, leagueName, reason"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) =>
                setForm({ ...form, isActive: e.target.checked })
              }
            />
            Active
          </label>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Save template"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
