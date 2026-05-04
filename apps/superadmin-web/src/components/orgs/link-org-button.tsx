"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Network } from "lucide-react";
import { orgs as orgsApi } from "@/lib/api/browser-api";
import type { Org } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function LinkOrgButton({
  orgId,
  allOrgs
}: {
  orgId: string;
  allOrgs: Org[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"parent" | "child">("child");
  const [otherOrgId, setOtherOrgId] = useState("");
  const [relation, setRelation] = useState<"sanctions" | "member_of" | "owns">(
    "owns"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = allOrgs.filter((o) => o.id !== orgId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!otherOrgId) return;
    setLoading(true);
    setError(null);
    try {
      await orgsApi.linkOrgs({
        parentOrgId: direction === "child" ? orgId : otherOrgId,
        childOrgId: direction === "child" ? otherOrgId : orgId,
        relation
      });
      setOpen(false);
      setOtherOrgId("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-muted transition-colors duration-fast ease-ease hover:border-border-strong hover:text-fg"
      >
        <Network className="h-3 w-3" strokeWidth={1.75} />
        Link org
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Link org"
        description="Establish a parent → child relation. Federations sanction leagues; clubs are owned by their parent. Resource-scope guards traverse this graph."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Direction" htmlFor="lo-dir">
            <Select
              id="lo-dir"
              value={direction}
              onChange={(e) =>
                setDirection(e.target.value as "parent" | "child")
              }
            >
              <option value="child">Add child org (this is parent)</option>
              <option value="parent">Add parent org (this is child)</option>
            </Select>
          </Field>
          <Field
            label={direction === "child" ? "Child org" : "Parent org"}
            htmlFor="lo-other"
          >
            <Select
              id="lo-other"
              required
              value={otherOrgId}
              onChange={(e) => setOtherOrgId(e.target.value)}
            >
              <option value="">Choose org…</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.displayName} ({o.orgType.replace(/_/g, " ")})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Relation" htmlFor="lo-rel">
            <Select
              id="lo-rel"
              value={relation}
              onChange={(e) =>
                setRelation(e.target.value as typeof relation)
              }
            >
              <option value="owns">owns — full control</option>
              <option value="sanctions">sanctions — governing-body endorsement</option>
              <option value="member_of">member_of — federation membership</option>
            </Select>
          </Field>

          {error ? (
            <p className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !otherOrgId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Linking…
                </>
              ) : (
                "Link"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
