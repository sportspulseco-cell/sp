import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "@sportspulse/db";
import { schema } from "@sportspulse/db";
import { DRIZZLE } from "../../../../shared/database/database.tokens";

export interface GetRoleProfileInput {
  userId: string;
  roleCode: string;
}

@Injectable()
export class GetRoleProfileHandler {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async execute(
    input: GetRoleProfileInput
  ): Promise<{ data: Record<string, unknown> }> {
    const [row] = await this.db
      .select({ metadata: schema.profiles.metadata })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, input.userId))
      .limit(1);
    const meta = (row?.metadata ?? {}) as Record<string, unknown>;
    const roleProfile = (meta["roleProfile"] ?? {}) as Record<string, unknown>;
    const data = (roleProfile[input.roleCode] ?? {}) as Record<string, unknown>;
    return { data };
  }
}
