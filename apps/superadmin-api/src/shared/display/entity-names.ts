import { inArray } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";

export type NamedEntityType =
  | "org"
  | "league"
  | "season"
  | "division"
  | "team"
  | "user"
  | "person";

/**
 * Resolve (type, id) references to the names people recognise, in one
 * query per entity type. Screens showed raw id fragments ("ORG ·
 * 0C8DF762", user "3e46f60f") wherever an API returned only ids; enrich
 * responses with this instead of printing ids.
 *
 * Returns a map keyed `${type}:${id}`. Missing rows are simply absent,
 * so callers fall back explicitly.
 */
export async function resolveEntityNames(
  db: Database,
  refs: ReadonlyArray<{ type: string; id: string | null | undefined }>
): Promise<Map<string, string>> {
  const ids = new Map<NamedEntityType, Set<string>>();
  for (const r of refs) {
    if (!r.id) continue;
    const type = r.type as NamedEntityType;
    if (!["org", "league", "season", "division", "team", "user", "person"].includes(type)) continue;
    const set = ids.get(type) ?? new Set<string>();
    set.add(r.id);
    ids.set(type, set);
  }
  const out = new Map<string, string>();
  const put = (type: NamedEntityType, rows: Array<{ id: string; name: string | null }>) => {
    for (const row of rows) if (row.name) out.set(`${type}:${row.id}`, row.name);
  };
  const list = (type: NamedEntityType) => [...(ids.get(type) ?? [])];

  await Promise.all([
    list("org").length &&
      db
        .select({ id: schema.orgs.id, name: schema.orgs.displayName })
        .from(schema.orgs)
        .where(inArray(schema.orgs.id, list("org")))
        .then((rows) => put("org", rows)),
    list("league").length &&
      db
        .select({ id: schema.leagues.id, name: schema.leagues.name })
        .from(schema.leagues)
        .where(inArray(schema.leagues.id, list("league")))
        .then((rows) => put("league", rows)),
    list("season").length &&
      db
        .select({ id: schema.seasons.id, name: schema.seasons.name })
        .from(schema.seasons)
        .where(inArray(schema.seasons.id, list("season")))
        .then((rows) => put("season", rows)),
    list("division").length &&
      db
        .select({ id: schema.divisions.id, name: schema.divisions.name })
        .from(schema.divisions)
        .where(inArray(schema.divisions.id, list("division")))
        .then((rows) => put("division", rows)),
    list("team").length &&
      db
        .select({ id: schema.teams.id, name: schema.teams.name })
        .from(schema.teams)
        .where(inArray(schema.teams.id, list("team")))
        .then((rows) => put("team", rows)),
    list("user").length &&
      db
        .select({
          id: schema.profiles.id,
          displayName: schema.profiles.displayName,
          email: schema.profiles.email
        })
        .from(schema.profiles)
        .where(inArray(schema.profiles.id, list("user")))
        .then((rows) =>
          put(
            "user",
            rows.map((r) => ({ id: r.id, name: r.displayName || r.email || null }))
          )
        ),
    list("person").length &&
      db
        .select({
          id: schema.persons.id,
          first: schema.persons.legalFirstName,
          last: schema.persons.legalLastName,
          preferred: schema.persons.preferredName
        })
        .from(schema.persons)
        .where(inArray(schema.persons.id, list("person")))
        .then((rows) =>
          put(
            "person",
            rows.map((r) => ({
              id: r.id,
              name: `${r.preferred || r.first || ""} ${r.last || ""}`.trim() || null
            }))
          )
        )
  ]);
  return out;
}
