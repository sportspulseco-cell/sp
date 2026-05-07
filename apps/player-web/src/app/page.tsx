import { Eyebrow } from "@sportspulse/ui";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-4">
      <Eyebrow>// sp-player</Eyebrow>
      <h1 className="text-[36px] font-semibold tracking-tighter text-fg">
        Player home
      </h1>
      <p className="text-sm text-fg-muted">Your registrations, schedule, and team home.</p>
      <p className="text-[12px] text-fg-muted">
        Scaffold only — pages land in subsequent slices.
      </p>
    </main>
  );
}
