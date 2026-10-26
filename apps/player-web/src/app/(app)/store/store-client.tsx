"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingBag, ShoppingCart, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, DialogActions, EmptyState, Eyebrow, LocalDate, Alert } from "@sportspulse/ui";
import type { StoreOrder } from "@sportspulse/api-client";
import {
  formatMoney,
  STORE_LINE_MAX_QTY,
  STORE_NAME_MAX,
  storeLineLabel,
  validateStoreOrderLine,
  type StoreProductOptions
} from "@sportspulse/kernel";
import { teamStore } from "@/lib/api/browser-api";

export interface StoreProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: string;
  variantLabel: string | null;
  stockQty: number | null;
  options: StoreProductOptions;
}

interface CartLine {
  key: string;
  product: StoreProduct;
  quantity: number;
  size: string | null;
  personalName: string | null;
  personalNumber: number | null;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/**
 * Team store for a player on the roster (UC-26): pick a product, its
 * size and the name and number for the back (filled in from the roster),
 * add it to the cart, place the order, then pay its invoice on Payments.
 * Orders show their payment and fulfilment state; an unpaid order can be
 * cancelled.
 */
export function StoreClient({
  teamId,
  products,
  backName,
  jerseyNumber,
  initialOrders,
  canOrder
}: {
  teamId: string;
  products: StoreProduct[];
  backName: string | null;
  jerseyNumber: number | null;
  initialOrders: StoreOrder[];
  /** False when the caller is not on the roster: browse only. */
  canOrder: boolean;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>(initialOrders);
  const [picking, setPicking] = useState<StoreProduct | null>(null);
  const [requestKey, setRequestKey] = useState(newKey);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<StoreOrder | null>(null);

  const currency = cart[0]?.product.currency ?? "USD";
  const total = cart.reduce((s, l) => s + l.product.priceCents * l.quantity, 0);

  async function placeOrder() {
    setBusy("place");
    setError(null);
    try {
      const r = await teamStore.placeOrder(teamId, {
        requestKey,
        lines: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          size: l.size,
          personalName: l.personalName,
          personalNumber: l.personalNumber
        }))
      });
      setOrders((prev) => [r.order, ...prev.filter((o) => o.id !== r.order.id)]);
      setPlaced(r.order);
      setCart([]);
      setRequestKey(newKey());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(o: StoreOrder) {
    setBusy(o.id);
    setError(null);
    try {
      const r = await teamStore.cancelOrder(o.id);
      setOrders((prev) => prev.map((x) => (x.id === o.id ? r.order : x)));
      if (placed?.id === o.id) setPlaced(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {placed ? (
        <div className="rounded-xl border border-[var(--tint-emerald-fg)]/30 bg-[var(--tint-emerald-bg)] p-4 text-sm text-[var(--tint-emerald-fg)]">
          <p className="font-medium">Order placed. Total {formatMoney(placed.totalCents, placed.currency)}.</p>
          <p className="mt-1">
            Pay invoice {placed.invoice?.number} to confirm it.{" "}
            <Link href="/payments" className="font-medium underline">
              Go to Payments
            </Link>
          </p>
        </div>
      ) : null}
      {error ? (
        <Alert tone="error">
          {error}
        </Alert>
      ) : null}

      {cart.length > 0 ? (
        <section aria-label="Cart" className="space-y-3 rounded-xl border border-accent/40 bg-surface-1 p-4">
          <div className="flex items-center justify-between">
            <Eyebrow>Your cart</Eyebrow>
            <span className="font-mono text-sm font-semibold tabular-nums text-fg">{formatMoney(total, currency)}</span>
          </div>
          <ul className="space-y-1.5">
            {cart.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-3 text-sm text-fg">
                <span>{storeLineLabel(l.product.name, l)}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-fg-muted">{formatMoney(l.product.priceCents * l.quantity, l.product.currency)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${l.product.name}`}
                    onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}
                    className="text-fg-muted hover:text-fg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-fg-muted">Placing the order creates an invoice you pay on your Payments page.</p>
          <Button onClick={placeOrder} disabled={busy !== null}>
            {busy === "place" ? <Loader2 className="h-4 w-4 animate-spin" /> : `Place order · ${formatMoney(total, currency)}`}
          </Button>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const soldOut = p.stockQty != null && p.stockQty <= 0;
          return (
            <article key={p.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
              <div className="relative aspect-square w-full bg-surface-2">
                {p.imageUrl ? (
                  // Captain-supplied URL; not proxied through the image loader.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-muted">
                    <ShoppingBag className="h-10 w-10" strokeWidth={1.25} />
                  </div>
                )}
                {soldOut ? (
                  <div className="absolute right-2 top-2">
                    <Badge tone="warning" mono>out of stock · backorder</Badge>
                  </div>
                ) : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
                <Eyebrow>{p.variantLabel ?? "product"}</Eyebrow>
                <h3 className="text-sm font-medium text-fg">{p.name}</h3>
                {p.description ? <p className="line-clamp-3 text-xs text-fg-muted">{p.description}</p> : null}
                <div className="mt-auto flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold tabular-nums text-fg">{formatMoney(p.priceCents, p.currency)}</span>
                  {canOrder ? (
                    <Button size="sm" onClick={() => setPicking(p)}>
                      <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Order
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {canOrder ? (
        <section className="space-y-3">
          <Eyebrow>Your orders</Eyebrow>
          {orders.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No orders yet"
              description="Items you order from the team store show here."
            />
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface-1 p-4">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      <LocalDate iso={o.createdAt} format="date" /> ·{" "}
                      {formatMoney(o.totalCents, o.currency)}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13px] text-fg">
                      {o.items.map((i) => (
                        <li key={i.id}>
                          {i.label}
                          {i.backorder ? <Badge mono tone="warning" className="ml-2">Backorder</Badge> : null}
                        </li>
                      ))}
                    </ul>
                    {o.note ? <p className="mt-1 text-[12px] text-fg-muted">From your captain: {o.note}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge status={o.status} domain="store_order">{o.statusLabel}</Badge>
                    {o.status === "cancelled" ? null : o.paid ? (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Paid</span>
                    ) : (
                      <Link href="/payments" className="text-[12px] font-medium text-accent underline">
                        Pay invoice {o.invoice?.number}
                      </Link>
                    )}
                    {o.status === "placed" && !o.paid && (o.invoice?.paidCents ?? 0) === 0 ? (
                      <Button size="sm" variant="ghost" onClick={() => cancel(o)} disabled={busy !== null}>
                        {busy === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel order"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {picking ? (
        <PickDialog
          product={picking}
          backName={backName}
          jerseyNumber={jerseyNumber}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            setCart((c) => [...c, { ...line, key: newKey(), product: picking }]);
            setPlaced(null);
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PickDialog({
  product,
  backName,
  jerseyNumber,
  onClose,
  onAdd
}: {
  product: StoreProduct;
  backName: string | null;
  jerseyNumber: number | null;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, "key" | "product">) => void;
}) {
  const o = product.options;
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState(o.personalization.name ? (backName ?? "").toUpperCase().slice(0, STORE_NAME_MAX) : "");
  const [num, setNum] = useState(o.personalization.number && jerseyNumber != null ? String(jerseyNumber) : "");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const line = {
      quantity,
      size: size || null,
      personalName: o.personalization.name ? name.trim() || null : null,
      personalNumber: o.personalization.number && num.trim() !== "" ? Number(num) : null
    };
    const problem = validateStoreOrderLine(o, line);
    if (problem) {
      setError(problem);
      return;
    }
    onAdd(line);
  }

  const field = "w-full rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-fg focus:border-accent focus:outline-none";
  return (
    <Dialog open onClose={onClose} title={product.name} description={`${formatMoney(product.priceCents, product.currency)} each`}>
      <div className="space-y-3">
        {o.sizes.length > 0 ? (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Size</span>
            <select aria-label="Size" value={size} onChange={(e) => setSize(e.target.value)} className={field}>
              <option value="">Pick a size</option>
              {o.sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Quantity</span>
          <select aria-label="Quantity" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={field}>
            {Array.from({ length: STORE_LINE_MAX_QTY }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {o.personalization.name ? (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Name on the back</span>
            <input aria-label="Name on the back" value={name} maxLength={STORE_NAME_MAX} onChange={(e) => setName(e.target.value)} className={field} />
            <span className="text-[11px] text-fg-muted">From your roster entry. Leave blank for none.</span>
          </label>
        ) : null}
        {o.personalization.number ? (
          <label className="grid gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">Number on the back</span>
            <input aria-label="Number on the back" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))} className={field} />
            <span className="text-[11px] text-fg-muted">{jerseyNumber != null ? "Your roster number." : "0 to 99. Leave blank for none."}</span>
          </label>
        ) : null}
        {product.stockQty != null && product.stockQty < quantity ? (
          <p className="text-[12px] text-[var(--tint-amber-fg)]">
            {product.stockQty <= 0 ? "Out of stock" : `Only ${product.stockQty} in stock`}: the rest is ordered as a backorder.
          </p>
        ) : null}
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : null}
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={add}>Add to cart · {formatMoney(product.priceCents * quantity, product.currency)}</Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
