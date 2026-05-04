"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { compliance } from "@/lib/api/browser-api";
import type { DocumentKind, Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const KINDS: DocumentKind[] = [
  "waiver",
  "code_of_conduct",
  "media_release",
  "concussion_protocol",
  "transfer_form",
  "policy",
  "other"
];

export function CreateDocumentButton({ orgs }: { orgs: Org[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        New document
      </Button>
      <CreateDocumentDialog
        open={open}
        onClose={() => setOpen(false)}
        orgs={orgs}
      />
    </>
  );
}

function CreateDocumentDialog({
  open,
  onClose,
  orgs
}: {
  open: boolean;
  onClose: () => void;
  orgs: Org[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<{
    orgId: string;
    kind: DocumentKind;
    name: string;
    description: string;
  }>({
    orgId: "",
    kind: "waiver",
    name: "",
    description: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await compliance.createDocument({
        orgId: form.orgId || null,
        kind: form.kind,
        name: form.name,
        description: form.description || null
      });
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New compliance document"
      description="Create the document shell. Publish a content version next to make it active for signing."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Organization"
          htmlFor="orgId"
          hint="Leave blank for a platform-wide document."
        >
          <Select
            id="orgId"
            value={form.orgId}
            onChange={(e) => setForm({ ...form, orgId: e.target.value })}
          >
            <option value="">Platform-wide</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.displayName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kind" htmlFor="kind">
          <Select
            id="kind"
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as DocumentKind })
            }
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="2026 Player Waiver & Release"
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Optional"
          />
        </Field>

        {error ? (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create document"
            )}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
