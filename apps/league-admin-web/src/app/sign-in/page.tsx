import { Suspense } from "react";
import { ShieldCheck, Trophy } from "lucide-react";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata = { title: "Sign in — SportsPulse League Admin" };

export default function SignInPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a0a] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_45%)]"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0a0a0a]">
            <Trophy className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">SportsPulse</p>
            <p className="text-xs text-white/50">League Admin Console</p>
          </div>
        </div>
        <div className="relative space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-tight text-white/70">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            Scoped access
          </span>
          <h1 className="max-w-md text-4xl font-semibold leading-[1.05] tracking-tighter">
            Run your league.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            Manage the leagues you've been assigned — divisions, teams,
            schedules, and standings, all in one place.
          </p>
        </div>
        <p className="relative text-[11px] text-white/40">
          © {new Date().getFullYear()} SportsPulse — All rights reserved
        </p>
      </section>

      <section className="flex items-center justify-center bg-bg p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tighter text-fg">
            League Admin
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Sign in with your league_admin account.
          </p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <SignInForm />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
