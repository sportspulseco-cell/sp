import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Layers,
  Sparkles,
  Trophy,
  UserPlus,
  Users
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Find a team — SportsPulse" };
export const dynamic = "force-dynamic";

interface OpenSeason {
  seasonId: string;
  seasonName: string;
  sportCode: string;
  leagueId: string;
  leagueName: string;
  orgId: string;
  orgName: string;
  formId: string;
  formName: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function listOpen(): Promise<OpenSeason[]> {
  try {
    const res = await fetch(`${API}/public/registration/open`, {
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: OpenSeason[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

function relCloses(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

export default async function FindATeamPage() {
  const open = await listOpen();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="// find a team"
        title="Find a team"
        description="Two ways in: pick an open league registration below, or list yourself in the free-agent pool and let captains find you."
      />

      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
              // open registrations
            </p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-fg">
              Leagues accepting registrations right now
            </h2>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            {open.length} open
          </span>
        </header>

        {open.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-10 text-center">
            <Sparkles
              className="mx-auto h-6 w-6 text-fg-muted"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-[14px] font-medium text-fg">
              Nothing's open right now
            </p>
            <p className="mt-1 text-[12px] text-fg-muted">
              Open leagues will appear here the moment a league admin
              publishes their registration form.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {open.map((s) => (
              <li key={s.seasonId}>
                <Link
                  href={`/register/${s.seasonId}`}
                  className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                        {s.orgName}
                        <span className="text-fg-subtle"> · </span>
                        {s.leagueName}
                      </p>
                      <p className="mt-1.5 truncate text-[16px] font-semibold tracking-tight text-fg">
                        {s.seasonName}
                      </p>
                      <p className="mt-1 truncate text-[12px] text-fg-muted">
                        Form:{" "}
                        <span className="text-fg">{s.formName}</span>
                      </p>
                    </div>
                    <Trophy
                      className="h-5 w-5 shrink-0 text-fg-muted group-hover:text-accent"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-muted">
                      <CalendarRange
                        className="h-3 w-3"
                        strokeWidth={1.75}
                      />
                      {relCloses(s.registrationClosesAt) ?? "open"}
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
      </section>

      <section>
        <header className="mb-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
            // other paths
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/registrations"
            className="group flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
          >
            <Users
              className="h-6 w-6 text-fg-muted group-hover:text-accent"
              strokeWidth={1.5}
            />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                resume
              </p>
              <p className="mt-1 text-[15px] font-medium text-fg">
                My registrations
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                See every submission you've started or completed. Drafts can be
                resumed.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Open <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </span>
          </Link>
          <Link
            href="/register/free-agent"
            className="group flex flex-col gap-3 rounded-xl border border-border bg-surface-1 p-5 hover:border-accent"
          >
            <UserPlus
              className="h-6 w-6 text-fg-muted group-hover:text-accent"
              strokeWidth={1.5}
            />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-fg-muted">
                no team yet
              </p>
              <p className="mt-1 text-[15px] font-medium text-fg">
                Join the free-agent pool
              </p>
              <p className="mt-1 text-[12px] text-fg-muted">
                Tell captains your position, level, and availability. They'll
                reach out.
              </p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              Open the form{" "}
              <ArrowRight className="h-3 w-3" strokeWidth={2} />
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
