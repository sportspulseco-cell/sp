import Link from "next/link";
import { ArrowRight, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Find a team — SportsPulse" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="// FIND A TEAM"
        title="Find a team"
        description="Two ways in: register with a team that's already invited you, or list yourself in the free-agent pool and let captains find you."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/registrations"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
        >
          <Users className="h-6 w-6 text-fg-muted group-hover:text-accent" strokeWidth={1.5} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // Path 1
            </p>
            <p className="mt-1 text-[15px] font-medium text-fg">
              Register with an invited team
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              You already have a team URL or invite code from a captain.
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            View my registrations <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </span>
        </Link>
        <Link
          href="/register/free-agent"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
        >
          <UserPlus className="h-6 w-6 text-fg-muted group-hover:text-accent" strokeWidth={1.5} />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-fg-muted">
              // Path 2
            </p>
            <p className="mt-1 text-[15px] font-medium text-fg">
              Join the free-agent pool
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              Tell captains your position, level, and availability. They'll reach out.
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-accent">
            Open the form <ArrowRight className="h-3 w-3" strokeWidth={2} />
          </span>
        </Link>
      </div>
    </div>
  );
}
