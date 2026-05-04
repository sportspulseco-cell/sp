import { Suspense } from "react";
import { ShieldCheck, Globe2, Activity, Users } from "lucide-react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Sign in — SportsPulse Super Admin" };

const FEATURES = [
  {
    icon: Globe2,
    title: "Global, multi-sport",
    body: "Hockey, soccer, basketball, cricket — multi-tenant from day one."
  },
  {
    icon: Activity,
    title: "Real-time scoring",
    body: "Offline-first scorekeeping. Live scoreboards. AI highlights."
  },
  {
    icon: Users,
    title: "Federation-grade",
    body: "Roles, eligibility, compliance and audit baked in."
  }
];

export default function SignInPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Left — brand panel (always dark, like Vercel sign-in pages) */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a0a] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_45%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0a0a0a]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <path d="m12 14 4-4" />
              <path d="M3.34 19a10 10 0 1 1 17.32 0" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">SportsPulse</p>
            <p className="text-xs text-white/50">Super Admin Console</p>
          </div>
        </div>

        <div className="relative space-y-8">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-tight text-white/70">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              Restricted access
            </span>
            <h1 className="max-w-md text-4xl font-semibold leading-[1.05] tracking-tighter">
              Run leagues at federation scale.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-white/60">
              The platform layer for orgs, leagues, rosters, registration,
              compliance, scoring, scheduling and stats — modular,
              multi-tenant, and built for any sport.
            </p>
          </div>

          <ul className="grid max-w-md grid-cols-1 gap-3 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm"
              >
                <Icon
                  className="h-4 w-4 text-white"
                  strokeWidth={1.5}
                />
                <p className="mt-2 text-xs font-semibold tracking-tight">
                  {title}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/40">
          © {new Date().getFullYear()} SportsPulse — All rights reserved
        </p>
      </section>

      {/* Right — form */}
      <section className="flex items-center justify-center bg-bg p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fg text-bg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path d="m12 14 4-4" />
                <path d="M3.34 19a10 10 0 1 1 17.32 0" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-fg">
                SportsPulse
              </p>
              <p className="text-xs text-fg-muted">Super Admin Console</p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tighter text-fg">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Sign in to the platform admin console.
          </p>

          <div className="mt-8">
            <Suspense fallback={<SignInFormSkeleton />}>
              <SignInForm />
            </Suspense>
          </div>

          <p className="mt-8 text-xs text-fg-muted">
            New here?{" "}
            <a href="/sign-up" className="underline hover:text-fg">
              Create an account
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

function SignInFormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}
