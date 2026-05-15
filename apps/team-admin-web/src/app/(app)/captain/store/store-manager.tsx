"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Button, Eyebrow, Field, Input } from "@sportspulse/ui";
import type { TeamStoreProduct } from "@sportspulse/api-client";
import { teamStore } from "@/lib/api/browser-api";

type Product = TeamStoreProduct;

interface FormState {
  name: string;
  description: string;
  imageUrl: string;
  priceDollars: string;
  currency: string;
  variantLabel: string;
  stockQty: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    imageUrl: "",
    priceDollars: "",
    currency: "USD",
    variantLabel: "",
    stockQty: "",
    isActive: true
  };
}

function productToForm(p: Product): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    imageUrl: p.imageUrl ?? "",
    priceDollars: (p.priceCents / 100).toFixed(2),
    currency: p.currency,
    variantLabel: p.variantLabel ?? "",
    stockQty: p.stockQty != null ? String(p.stockQty) : "",
    isActive: p.isActive
  };
}

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency
  }).format(cents / 100);
}

export function StoreManager({
  teamId,
  initialItems
}: {
  teamId: string;
  initialItems: Product[];
}) {
  const [items, setItems] = useState<Product[]>(initialItems);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseForm(f: FormState): {
    body: Parameters<typeof teamStore.create>[1];
    err?: string;
  } {
    const name = f.name.trim();
    if (!name) return { body: { name: "", priceCents: 0 }, err: "Name required" };
    const dollars = Number(f.priceDollars);
    if (!Number.isFinite(dollars) || dollars < 0) {
      return { body: { name, priceCents: 0 }, err: "Price must be a positive number" };
    }
    const stock = f.stockQty.trim()
      ? Number(f.stockQty)
      : undefined;
    if (stock !== undefined && (!Number.isFinite(stock) || stock < 0)) {
      return { body: { name, priceCents: 0 }, err: "Stock must be a positive integer or blank" };
    }
    const currency = (f.currency || "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { body: { name, priceCents: 0 }, err: "Currency must be a 3-letter ISO code (e.g. USD)" };
    }
    return {
      body: {
        name,
        description: f.description.trim() || undefined,
        imageUrl: f.imageUrl.trim() || undefined,
        priceCents: Math.round(dollars * 100),
        currency,
        variantLabel: f.variantLabel.trim() || undefined,
        stockQty: stock,
        isActive: f.isActive
      }
    };
  }

  async function refresh() {
    try {
      const res = await teamStore.listForCaptain(teamId);
      setItems(res.items);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleCreate() {
    const { body, err } = parseForm(createForm);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy("create");
    try {
      await teamStore.create(teamId, body);
      setCreateForm(emptyForm());
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditForm(productToForm(p));
    setError(null);
  }

  async function handleSaveEdit(productId: string) {
    const { body, err } = parseForm(editForm);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(productId);
    try {
      await teamStore.update(teamId, productId, body);
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(productId: string) {
    if (!confirm("Remove this product? This cannot be undone.")) return;
    setBusy(productId);
    setError(null);
    try {
      await teamStore.remove(teamId, productId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleToggle(p: Product) {
    setBusy(p.id);
    setError(null);
    try {
      await teamStore.update(teamId, p.id, { isActive: !p.isActive });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Eyebrow>// Products ({items.length})</Eyebrow>
        {!showCreate ? (
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setCreateForm(emptyForm());
              setError(null);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" strokeWidth={2} />
            Add product
          </Button>
        ) : null}
      </div>

      {showCreate ? (
        <FormCard
          title="New product"
          form={createForm}
          setForm={setCreateForm}
          onCancel={() => {
            setShowCreate(false);
            setError(null);
          }}
          onSubmit={handleCreate}
          submitLabel="Create"
          busy={busy === "create"}
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((p) => {
            const editing = editingId === p.id;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-surface-1 p-4"
              >
                {editing ? (
                  <FormCard
                    title="Edit product"
                    form={editForm}
                    setForm={setEditForm}
                    onCancel={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    onSubmit={() => handleSaveEdit(p.id)}
                    submitLabel="Save"
                    busy={busy === p.id}
                  />
                ) : (
                  <ProductRow
                    p={p}
                    onEdit={() => startEdit(p)}
                    onDelete={() => handleDelete(p.id)}
                    onToggle={() => handleToggle(p)}
                    busy={busy === p.id}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function ProductRow({
  p,
  onEdit,
  onDelete,
  onToggle,
  busy
}: {
  p: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
        {p.imageUrl ? (
          // Captain-supplied URL; no Next image-loader optimisation.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-fg-muted">
            no image
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-fg">{p.name}</p>
          {p.isActive ? (
            <Badge mono tone="success">
              active
            </Badge>
          ) : (
            <Badge mono tone="neutral">
              hidden
            </Badge>
          )}
        </div>
        <p className="text-xs text-fg-muted">
          {fmt(p.priceCents, p.currency)}
          {p.variantLabel ? ` · ${p.variantLabel}` : ""}
          {p.stockQty != null ? ` · ${p.stockQty} in stock` : ""}
        </p>
        {p.description ? (
          <p className="mt-1 line-clamp-2 text-xs text-fg-muted">
            {p.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-1.5 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={busy}
          >
            <Pencil className="mr-1 h-3 w-3" strokeWidth={2} />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onToggle}
            disabled={busy}
          >
            {p.isActive ? "Hide" : "Show"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={busy}
            className="ml-auto text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
            ) : (
              <Trash2 className="h-3 w-3" strokeWidth={2} />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormCard({
  title,
  form,
  setForm,
  onCancel,
  onSubmit,
  submitLabel,
  busy
}: {
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>// {title}</Eyebrow>
        <button
          type="button"
          onClick={onCancel}
          className="text-fg-muted hover:text-fg"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Home jersey"
            disabled={busy}
          />
        </Field>
        <Field label="Variant (size / color)">
          <Input
            value={form.variantLabel}
            onChange={(e) => setForm({ ...form, variantLabel: e.target.value })}
            placeholder="Medium · Royal"
            disabled={busy}
          />
        </Field>
        <Field label="Price">
          <Input
            value={form.priceDollars}
            inputMode="decimal"
            onChange={(e) =>
              setForm({ ...form, priceDollars: e.target.value })
            }
            placeholder="49.99"
            disabled={busy}
          />
        </Field>
        <Field label="Currency">
          <Input
            value={form.currency}
            onChange={(e) =>
              setForm({ ...form, currency: e.target.value.toUpperCase() })
            }
            placeholder="USD"
            maxLength={3}
            disabled={busy}
          />
        </Field>
        <Field label="Stock (blank = unlimited)">
          <Input
            value={form.stockQty}
            inputMode="numeric"
            onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            placeholder="50"
            disabled={busy}
          />
        </Field>
        <Field label="Image URL">
          <Input
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://…/jersey.jpg"
            disabled={busy}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={2}
              disabled={busy}
              className="flex w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-accent focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Optional details — sizing, material, deadline…"
            />
          </Field>
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            id="form-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            disabled={busy}
            className="h-4 w-4 rounded border-border"
          />
          <label htmlFor="form-active" className="text-sm text-fg">
            Visible to players
          </label>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={busy}>
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
