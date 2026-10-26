import Link from "next/link";
import { ArrowRight, CalendarRange, Search, Trophy } from "lucide-react";
import { registrationClosesLabel } from "@sportspulse/kernel";
import { LoadError } from "@sportspulse/ui";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register — SportsPulse" };

interface OpenSeason {
  seasonId: string;
  seasonName: string;
  leagueName: string;
  formName: string;
  registrationClosesAt: string | null;
}

type LeaguePage =
  | { kind: "ok"; org: { id: string; slug: string; name: string }; items: OpenSeason[] }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * A league's public registration page, reached from the link the league
 * shares (/join?org=<slug>). Anonymous: a visitor sees that league's open
 * seasons without signing in, and signs in or creates an account only when
 * they register. There is no list across leagues, so nobody can browse other
 * organisations from here (the API refuses a request that names no league).
 */
async function loadLeague(org: string): Promise<LeaguePage> {
  try {
    const res = await fetch(`${API}/public/registration/open?org=${encodeURIComponent(org)}`, { cache: "no-store" });
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) {
      console.error(`[join] open registrations for org=${org} answered ${res.status}`);
      return { kind: "error" };
    }
    const data = (await res.json()) as { org: { id: string; slug: string; name: string }; items: OpenSeason[] };
    return { kind: "ok", org: data.org, items: data.items ?? [] };
  } catch (e) {
    console.error(`[join] open registrations for org=${org} failed`, e);
    return { kind: "error" };
  }
}

function AccountLinks({ next }: { next: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]">
      <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">
        Sign in
      </Link>
      <span className="text-fg-subtle">·</span>
      <Link href="/sign-up" className="text-accent hover:underline">
        Create an account
      </Link>
    </div>
  );
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  const key = org?.trim() ?? "";

  if (!key) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12 text-fg">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">Register</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Register with your league</h1>
          <p className="mt-2 text-[14px] text-fg-muted">
            Registration starts from your league&apos;s link. Ask your league for it or find it on their website. You
            can look at what is open without an account.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-6 text-[13px] text-fg-muted">
          <Search className="mb-2 h-5 w-5" strokeWidth={1.5} />
          Already registered with a league before? Sign in to see the seasons open in your league.
        </div>
        <AccountLinks next="/register" />
      </main>
    );
  }

  const page = await loadLeague(key);

  if (page.kind === "error") {
    return (
      <main className="min-h-screen bg-bg p-6 text-fg">
        <LoadError what="this registration page" status={null} />
      </main>
    );
  }

  if (page.kind === "not_found") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-12 text-fg">
        <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that league</h1>
        <p className="text-[14px] text-fg-muted">Check the registration link with your league.</p>
        <AccountLinks next="/register" />
      </main>
    );
  }

  const here = `/join?org=${encodeURIComponent(page.org.slug)}`;
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-6 py-12 text-fg">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">Registration</p>
        <h1 className="text-2xl font-semibold tracking-tight">{page.org.name}</h1>
        <p className="text-[14px] text-fg-muted">
          Pick a season to register. You sign in or create an account when you register.
        </p>
      </header>

      {page.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-10 text-center">
          <p className="text-[14px] font-medium">No registration is open right now</p>
          <p className="mt-1 text-[12px] text-fg-muted">
            Seasons appear here when {page.org.name} opens registration.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {page.items.map((s) => (
            <li key={s.seasonId}>
              <Link
                href={`/register/${s.seasonId}`}
                className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">{s.leagueName}</p>
                    <p className="mt-1.5 truncate text-[16px] font-semibold tracking-tight">{s.seasonName}</p>
                  </div>
                  <Trophy className="h-5 w-5 shrink-0 text-fg-muted group-hover:text-accent" strokeWidth={1.5} />
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                    <CalendarRange className="h-3 w-3" strokeWidth={1.75} />
                    {registrationClosesLabel(s.registrationClosesAt) ?? "open"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    Register <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <AccountLinks next={here} />
    </main>
  );
}
