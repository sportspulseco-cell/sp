import { fetchAll } from "@sportspulse/api-client";
import { SUBMISSION_STATUS_FILTERS } from "@sportspulse/kernel";
import { Building2, CircleDot, ClipboardList } from "lucide-react";
import { leagueMgmt, gameOps, orgs, registration } from "@/lib/api/server-api";
import { PageHeader, TodoList, type TodoItem } from "@sportspulse/ui";
import { SeasonFlow } from "@/components/dashboard/season-flow";

export const metadata = { title: "Dashboard · Super Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TO_REVIEW = new Set<string>(SUBMISSION_STATUS_FILTERS.find((f) => f.value === "pending_review")?.statuses ?? []);

/**
 * Operator home (super admins, and league admins with their league
 * filter): what is waiting, then where each season stands. Nothing
 * else (doc/design/guided-ui.md). Totals live on their own pages.
 */
export default async function DashboardPage() {
  const [orgsPage, seasonsPage, leaguesPage, regsPage, gamesPage] = await Promise.all([
    orgs.list({ limit: 100 }).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listSeasons({ limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => leagueMgmt.listLeagues({ limit: 100, cursor })).catch(() => ({ items: [] })),
    fetchAll((cursor) => registration.listRegistrations({ limit: 100, cursor })).catch(() => ({ items: [] })),
    gameOps.listGames({ status: "in_play", limit: 100 }).catch(() => ({ items: [] }))
  ]);

  const toReview = regsPage.items.filter((r) => TO_REVIEW.has(r.status as string)).length;
  const suspendedOrgs = orgsPage.items.filter((o) => o.status === "suspended").length;
  const liveGames = gamesPage.items.filter((g) => g.status === "in_play").length;

  const todo: TodoItem[] = [];
  if (toReview > 0)
    todo.push({
      icon: ClipboardList,
      label: `${toReview} ${toReview === 1 ? "registration" : "registrations"} to review`,
      action: "Review",
      href: "/registrations"
    });
  if (liveGames > 0)
    todo.push({
      icon: CircleDot,
      label: `${liveGames} ${liveGames === 1 ? "game" : "games"} live now`,
      action: "Watch",
      href: "/games?status=in_play"
    });
  if (suspendedOrgs > 0)
    todo.push({
      icon: Building2,
      tone: "warn",
      label: `${suspendedOrgs} suspended ${suspendedOrgs === 1 ? "organization" : "organizations"}`,
      action: "Open",
      href: "/organizations"
    });

  return (
    <div className="space-y-10">
      <PageHeader title="Home" />
      <TodoList items={todo} />
      {/* The season lifecycle with one next step each (PPHL, 24 Oct 2026). */}
      <SeasonFlow seasons={seasonsPage.items} leagues={leaguesPage.items} registrations={regsPage.items} />
    </div>
  );
}
