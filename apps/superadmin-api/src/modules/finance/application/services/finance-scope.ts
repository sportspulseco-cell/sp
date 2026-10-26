import { NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { assertTargetInOrg } from "../../../../shared/audience/org-targets";
import type { UserScope } from "../../../../shared/auth/scope";
import { invoiceVisible, personVisible, seasonVisible, unrestricted, visibleSeasonIds } from "../../../../shared/auth/visibility";

/** 404 (never 403) when the invoice is outside the caller's finance scope. */
export async function assertInvoiceInScope(db: Database, scope: UserScope, invoiceId: string): Promise<void> {
  if (!(await invoiceVisible(db, scope, invoiceId))) throw new NotFoundException("Invoice not found");
}

/**
 * Who a scoped admin may bill (POST /finance/invoices/bulk). Every caller:
 * the target belongs to the billing org (it used to be checked only on the
 * org-admin proxy). An org admin of that org may bill any target in it. A
 * league, season or division admin may bill only inside their own
 * league's seasons: the league, a season, a division, a team entered in
 * one of its divisions, or a person they can see; never the whole org.
 */
export async function assertBulkTargetInScope(
  db: Database,
  scope: UserScope,
  userId: string,
  body: { orgId: string; billingScope: string; targetId: string }
): Promise<void> {
  if (body.billingScope !== "individual") {
    await assertTargetInOrg(db, body.billingScope, body.targetId, body.orgId);
  }
  if (unrestricted(scope)) return;
  if ((scope.orgWideOrgIds ?? []).includes(body.orgId)) return;
  if (!(scope.orgIds ?? []).includes(body.orgId)) throw new NotFoundException("Org not found");
  const has = async (q: ReturnType<typeof sql>) => {
    const r = (await db.execute(q)) as unknown as { length?: number; rows?: unknown[] };
    return Array.isArray(r) ? r.length > 0 : (r.rows?.length ?? 0) > 0;
  };
  let ok = false;
  const id = body.targetId;
  switch (body.billingScope) {
    case "league":
      ok = (scope.leagueIds ?? []).includes(id);
      break;
    case "season":
      ok = await seasonVisible(db, scope, id);
      break;
    case "division": {
      const r = (await db.execute(sql`select season_id from divisions where id = ${id}::uuid`)) as unknown as Array<{ season_id: string }>;
      const seasonId = (Array.isArray(r) ? r[0] : (r as unknown as { rows: Array<{ season_id: string }> }).rows?.[0])?.season_id;
      ok = !!seasonId && (await seasonVisible(db, scope, seasonId));
      break;
    }
    case "team":
      ok = await has(sql`select 1 from division_team_entries dte join divisions d on d.id = dte.division_id
        where dte.team_id = ${id}::uuid and d.season_id in ${visibleSeasonIds(scope)!} limit 1`);
      break;
    case "individual":
      ok = await personVisible(db, { scope, userId }, id);
      break;
    default:
      ok = false; // "org": the whole organization is an org admin's call
  }
  if (!ok) throw new NotFoundException("Target not found in your scope");
}
