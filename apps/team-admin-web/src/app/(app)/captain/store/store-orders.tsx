"use client";

import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Alert, Badge, Button, EmptyState, Eyebrow, LocalDate, Input } from "@sportspulse/ui";
import type { StoreOrder } from "@sportspulse/api-client";
import { formatMoney } from "@sportspulse/kernel";
import { teamStore } from "@/lib/api/browser-api";

const day = (iso: string) => <LocalDate iso={iso} format="monthDay" />;

/**
 * Orders from the team store (UC-26). Payment is the invoice's: an
 * order is fulfilled once it is paid. Processing, then shipped (with a
 * note such as where to pick it up); an unpaid order can be cancelled.
 * Every change tells the buyer.
 */
export function StoreOrders({ teamId }: { teamId: string }) {
  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shipping, setShipping] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    try {
      setOrders((await teamStore.listOrders(teamId)).items);
    } catch (e) {
      setError((e as Error).message);
      setOrders([]);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function move(o: StoreOrder, status: StoreOrder["status"], withNote?: string) {
    setBusy(o.id);
    setError(null);
    try {
      await teamStore.setOrderStatus(teamId, o.id, status, withNote);
      setShipping(null);
      setNote("");
      setFlash(`${o.buyer.name}'s order is ${status}. They have been told.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow>Orders{orders ? ` (${orders.length})` : ""}</Eyebrow>
        {orders ? (
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
            {orders.filter((o) => o.paid && o.status !== "shipped" && o.status !== "cancelled").length} paid, to fulfil
          </span>
        ) : null}
      </div>
      {flash ? (
        <Alert tone="success" role="status">{flash}</Alert>
      ) : null}
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : null}
      {orders === null ? (
        <p className="text-sm text-fg-muted">Loading orders…</p>
      ) : orders.length === 0 ? (
        <EmptyState icon={Package} title="No orders yet" description="Orders from players on your roster show here, with whether they are paid." />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="space-y-3 rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-fg">
                    {o.buyer.name} <span className="font-normal text-fg-muted">· {day(o.createdAt)} · {formatMoney(o.totalCents, o.currency)}</span>
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[13px] text-fg">
                    {o.items.map((i) => (
                      <li key={i.id}>
                        {i.label}
                        {i.backorder ? <Badge mono tone="warning" className="ml-2">Backorder</Badge> : null}
                      </li>
                    ))}
                  </ul>
                  {o.note ? <p className="mt-1 text-[12px] text-fg-muted">Note: {o.note}</p> : null}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge status={o.status} domain="store_order">{o.statusLabel}</Badge>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
                    {o.invoice?.status === "void" ? "Invoice void" : o.paid ? "Paid" : `Awaiting payment · ${o.invoice?.number ?? ""}`}
                  </span>
                </div>
              </div>
              {shipping === o.id ? (
                <div className="space-y-2 rounded-md border border-border bg-bg-subtle p-3">
                  <label className="grid gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Note for {o.buyer.name} (optional)</span>
                    <Input
                      value={note}
                      maxLength={300}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Pick up at Thursday's game"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShipping(null)} disabled={busy !== null}>Back</Button>
                    <Button size="sm" onClick={() => move(o, "shipped", note.trim() || undefined)} disabled={busy !== null}>
                      {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark shipped"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {o.status === "placed" && o.paid ? (
                    <Button size="sm" onClick={() => move(o, "processing")} disabled={busy !== null}>
                      {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mark processing"}
                    </Button>
                  ) : null}
                  {o.status === "processing" ? (
                    <Button size="sm" onClick={() => { setShipping(o.id); setNote(""); }} disabled={busy !== null}>
                      Mark shipped
                    </Button>
                  ) : null}
                  {(o.status === "placed" || o.status === "processing") && !o.paid && (o.invoice?.paidCents ?? 0) === 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => move(o, "cancelled")} disabled={busy !== null}>
                      Cancel order
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
