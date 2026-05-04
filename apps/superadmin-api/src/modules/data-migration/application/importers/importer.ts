import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";
import type { ImportEntityKind } from "../../domain/repositories/import.repository";

export interface ImportContext {
  orgId: string | null;
  submittedByUserId?: string | null;
}

export interface ImportRowResult {
  status: "ok" | "failed" | "skipped";
  error?: string;
  createdEntityId?: string;
}

/**
 * Per-entity importer. Each implementation maps one CSV row to a domain
 * write. Importers must be tolerant of missing fields and surface row-level
 * errors instead of throwing — the orchestrator records each row's result.
 */
export interface RowImporter {
  importRow(
    row: Record<string, string>,
    ctx: ImportContext
  ): Promise<ImportRowResult>;
}

@Injectable()
export class PersonsImporter implements RowImporter {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async importRow(
    row: Record<string, string>,
    _ctx: ImportContext
  ): Promise<ImportRowResult> {
    const legalFirstName =
      row.legalFirstName || row.legal_first_name || row.firstName;
    const legalLastName =
      row.legalLastName || row.legal_last_name || row.lastName;
    if (!legalFirstName || !legalLastName) {
      return { status: "failed", error: "Missing legal name" };
    }
    const dob = row.dobDate || row.dob || row.dob_date || null;
    const country = row.countryCode || row.country || null;
    try {
      const [r] = await this.db
        .insert(schema.persons)
        .values({
          legalFirstName,
          legalLastName,
          preferredName: row.preferredName || row.preferred_name || null,
          dobDate: dob || null,
          countryCode: country ? country.toUpperCase().slice(0, 2) : null
        })
        .returning({ id: schema.persons.id });
      return { status: "ok", createdEntityId: r!.id };
    } catch (err) {
      return { status: "failed", error: (err as Error).message };
    }
  }
}

@Injectable()
export class TeamsImporter implements RowImporter {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async importRow(
    row: Record<string, string>,
    ctx: ImportContext
  ): Promise<ImportRowResult> {
    if (!ctx.orgId)
      return { status: "failed", error: "orgId required for team import" };
    const name = row.name;
    const sportCode = row.sportCode || row.sport_code || row.sport;
    if (!name || !sportCode) {
      return { status: "failed", error: "Missing name or sport_code" };
    }
    try {
      const [r] = await this.db
        .insert(schema.teams)
        .values({
          orgId: ctx.orgId,
          name,
          shortName: row.shortName || row.short_name || null,
          sportCode: sportCode.toUpperCase(),
          status: "active"
        })
        .returning({ id: schema.teams.id });
      return { status: "ok", createdEntityId: r!.id };
    } catch (err) {
      return { status: "failed", error: (err as Error).message };
    }
  }
}

@Injectable()
export class ImporterRegistry {
  constructor(
    private readonly persons: PersonsImporter,
    private readonly teams: TeamsImporter
  ) {}

  resolve(kind: ImportEntityKind): RowImporter {
    switch (kind) {
      case "persons":
        return this.persons;
      case "teams":
        return this.teams;
      default:
        throw new Error(
          `Importer for "${kind}" not implemented yet — start with persons or teams`
        );
    }
  }

  /** Which entity kinds have working importers. */
  supportedKinds(): ImportEntityKind[] {
    return ["persons", "teams"];
  }
}
