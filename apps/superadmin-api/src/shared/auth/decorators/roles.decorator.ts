import { SetMetadata } from "@nestjs/common";

export const ROLES_METADATA = "ROLES_METADATA";

/**
 * Mark a controller / handler with the role codes that satisfy access.
 * super_admin always passes regardless of this list.
 *
 * Use together with `@Scope()` when the request URL identifies a resource
 * (e.g. `:leagueId`) and the assigned role must match that scope.
 */
export const Roles = (...codes: string[]) => SetMetadata(ROLES_METADATA, codes);
