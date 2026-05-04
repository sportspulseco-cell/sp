import { Suspense } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata = { title: "Sign up — SportsPulse Super Admin" };

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#0a0a0a] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.16),transparent_45%)]"
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0a0a0a]">
            <ShieldCheck className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">SportsPulse</p>
            <p className="text-xs text-white/50">Super Admin Console</p>
          </div>
        </div>
        <div className="relative space-y-3 max-w-md">
          <h1 className="text-4xl font-semibold leading-[1.05] tracking-tighter">
            Create your account.
          </h1>
          <p className="text-sm leading-relaxed text-white/60">
            Sign-up creates a baseline profile. Roles + super_admin status
            are granted by an existing admin once you're in.
          </p>
        </div>
        <p className="relative text-[11px] text-white/40">
          © {new Date().getFullYear()} SportsPulse — All rights reserved
        </p>
      </section>

      <section className="flex items-center justify-center bg-bg p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tighter text-fg">
            Get started
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Create a SportsPulse account.
          </p>
          <div className="mt-8">
            <Suspense fallback={null}>
              <SignUpForm />
            </Suspense>
          </div>
          <p className="mt-8 text-xs text-fg-muted">
            Already have an account?{" "}
            <Link href="/sign-in" className="underline hover:text-fg">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
