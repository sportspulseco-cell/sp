"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { iam } from "@/lib/api/browser-api";
import type { Profile } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@sportspulse/ui";

export function LinkPersonButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    iam
      .listUsers({ limit: 100 })
      .then((p) => {
        setUsers(p.items);
        if (p.items[0]) setUserId(p.items[0].id);
      })
      .catch(() => undefined);
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      await iam.linkPersonToUser(personId, userId);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        <Link2 className="h-3 w-3" strokeWidth={1.75} />
        Link auth user
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Link auth user"
        description="Bind this person record to an authenticated user account. After linking, the user can sign in and see their own data."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Auth user"
            htmlFor="lp-user"
            hint="Pick the Supabase auth user that should represent this person."
          >
            <Select
              id="lp-user"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Choose user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email ?? u.displayName ?? "Unnamed user"}
                  {u.email && u.displayName ? ` (${u.displayName})` : ""}
                </option>
              ))}
            </Select>
          </Field>

          {error ? (
            <Alert tone="error">
              {error}
            </Alert>
          ) : null}

          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !userId}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Linking…
                </>
              ) : (
                "Link user"
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
