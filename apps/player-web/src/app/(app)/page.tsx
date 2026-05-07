import Link from "next/link";
import {
  CalendarRange,
  ClipboardList,
  Compass,
  ScrollText,
  ShieldCheck,
  User,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import {
  Badge,
  Eyebrow,
  EmptyState,
  IconTile,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table
} from "@sportspulse/ui";
import {
  gameOps,
  iam,
  leagueMgmt,
  registration
} from "@/lib/api/server-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export default async function PlayerHome() {
  const [profile, scope] = await Promise.all([
    iam.me().catch(() => null),
    iam.meScope().catch(() => null)
  ]);

  if (!profile || !scope) {
    return (
      <ShellWithoutSession message="We couldn't load your account. Try signing out and back in." />
    );
  }

  const myTeamId = scope.teamIds[0] ?? null;
  const team = myTeamId ? await leagueMgmt.getTeam(myTeamId).catch(() => null) : null;

  const [registrationsPage, gamesPage] = await Promise.all([
    scope.personId
      ? registration
          .listRegistrations({ subjectPersonId: scope.personId })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve({ items: [], nextCursor: null }),
    myTeamId
      ? gameOps
          .listGames({ teamId: myTeamId, limit: 10 })
          .catch(() => ({ items: [], nextCursor: null }))
      : Promise.resolve({ items: [], nextCursor: null })
  ]);

  const now = Date.now();
  const upcoming = gamesPage.items
    .filter((g) => new Date(g.scheduledStartTsUtc).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduledStartTsUtc).getTime() -
        new Date(b.scheduledStartTsUtc).getTime()
    );

  const profileFields: Array<{ key: string; have: boolean }> = [
    { key: "Legal name", have: !!profile.legalFirstName && !!profile.legalLastName },
    { key: "Preferred name", have: !!profile.preferredName },
    { key: "Country", have: !!profile.countryCode },
    { key: "Email", have: !!profile.email }
  ];
  const filled = profileFields.filter((f) => f.have).length;
  const profilePct = Math.round((filled / profileFields.length) * 100);

  const fullName = [profile.legalFirstName, profile.legalLastName]
    .filter(Boolean)
    .join(" ");
  const displayName =
    profile.preferredName || fullName || profile.email || "Player";

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div className="space-y-2">
          <Eyebrow>// Home</Eyebrow>
          <h1 className="text-[36px] font-semibold leading-tight tracking-tighter text-fg">
            Hey {displayName.split(" ")[0]}.
          </h1>
          <p className="text-[14px] text-fg-muted">
            Your team, your registrations, and what's next on the schedule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/register"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <Compass className="h-3.5 w-3.5" strokeWidth={1.75} />
            Find a team
          </Link>
          <Link
            href="/profile"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-bg-subtle px-3 font-mono text-[10px] uppercase tracking-widest text-fg-muted hover:border-fg-muted hover:text-fg"
          >
            <User className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit profile
          </Link>
        </div>
      </header>

      {/* Top-row cards: My team + Profile completion */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface-1 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Eyebrow>My team</Eyebrow>
            <IconTile icon={UsersRound} tint="blue" size="sm" />
          </div>
          {team ? (
            <>
              <p className="mt-5 text-[24px] font-semibold tracking-tight text-fg">
                {team.name}
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-fg-muted">
                {team.sportCode} · {team.shortName ?? "—"}
              </p>
              <p className="mt-3 text-[13px] text-fg-muted">
                You're rostered as a {scope.roleCodes[0] ?? "player"}. Upcoming
                games show below.
              </p>
            </>
          ) : (
            <>
              <p className="mt-5 text-[20px] font-semibold tracking-tight text-fg">
                Looking for a team?
              </p>
              <p className="mt-2 text-[13px] text-fg-muted">
                You're not on a roster yet. Try the free-agent flow to find a
                team in your area.
              </p>
              <a
                href="/register"
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full bg-fg px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-bg"
              >
                Free-agent register
              </a>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <Eyebrow>Profile</Eyebrow>
            <IconTile icon={ShieldCheck} tint={profilePct === 100 ? "emerald" : "amber"} size="sm" />
          </div>
          <p className="mt-5 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-fg">
            {profilePct}%
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {filled} of {profileFields.length} fields complete
          </p>
          <ul className="mt-3 space-y-1">
            {profileFields.map((f) => (
              <li
                key={f.key}
                className="flex items-center justify-between text-[12px] text-fg-muted"
              >
                <span>{f.key}</span>
                <Badge mono tone={f.have ? "success" : "warning"}>
                  {f.have ? "ok" : "missing"}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* My registrations */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>My registrations</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              Every season you've registered for, with current status.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-muted">
            {registrationsPage.items.length} total
          </span>
        </header>
        {registrationsPage.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No registrations yet"
            description="Register for an upcoming season from the public funnel — link in the team admin's email or via /register."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Registration</TH>
                <TH>Status</TH>
                <TH>Submitted</TH>
              </TR>
            </THead>
            <TBody>
              {registrationsPage.items.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-[11px] text-fg-muted">
                    {r.id.slice(0, 8)}
                  </TD>
                  <TD>
                    <Badge mono tone={statusToneFor(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </TD>
                  <TD className="text-[12px] text-fg-muted">
                    {r.submittedAt
                      ? new Date(r.submittedAt).toLocaleDateString()
                      : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Schedule */}
      <section className="rounded-xl border border-border bg-surface-1">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <Eyebrow>Upcoming games</Eyebrow>
            <p className="mt-1 text-[13px] text-fg-muted">
              {team
                ? `The next scheduled games for ${team.name}.`
                : "Once you're on a team, your schedule lives here."}
            </p>
          </div>
        </header>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No games scheduled"
            description="Once a season is in progress, games will appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Opponent</TH>
                <TH>Venue</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {upcoming.slice(0, 10).map((g) => {
                const isHome = g.homeTeamId === myTeamId;
                const oppId = isHome ? g.awayTeamId : g.homeTeamId;
                return (
                  <TR key={g.id}>
                    <TD className="text-fg">{fmtDateTime(g.scheduledStartTsUtc)}</TD>
                    <TD className="font-mono text-[11px] text-fg-muted">
                      {isHome ? "vs " : "@ "}
                      {oppId.slice(0, 8)}
                    </TD>
                    <TD className="text-fg-muted">{g.venueName ?? "—"}</TD>
                    <TD>
                      <Badge mono tone={g.status === "scheduled" ? "info" : "neutral"}>
                        {g.status.replace(/_/g, " ")}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function statusToneFor(
  status: string
): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "withdrawn" || status === "cancelled")
    return "danger";
  if (status.startsWith("pending") || status === "submitted") return "warning";
  return "info";
}

function ShellWithoutSession({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-16">
      <Eyebrow>// sp-player</Eyebrow>
      <h1 className="text-[36px] font-semibold tracking-tighter text-fg">
        Player
      </h1>
      <EmptyState icon={ClipboardList} title="Account not loaded" description={message} />
    </main>
  );
}
