"use client";

export function FormBuilderTab({ seasonId }: { seasonId: string }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-widest text-fg-muted">
          // 04 · Form Builder
        </p>
        <h1 className="mt-2 text-[32px] font-semibold tracking-tighter text-fg">
          Form builder
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Custom questions, conditional logic, and waiver enabling for this
          season's player form.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-border bg-surface-1 p-10 text-center">
        <p className="text-[14px] text-fg-muted">
          Form builder lands in <span className="font-mono">Wave 2</span> —
          conditional logic engine and waiver toggles. Schema is already in
          place via <span className="font-mono">registration_form_versions</span>.
        </p>
        <p className="mt-3 font-mono text-[11px] text-fg-subtle">
          season_id {seasonId.slice(0, 8)}
        </p>
      </div>
    </div>
  );
}
