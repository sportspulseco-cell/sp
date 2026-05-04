import { SetMetadata } from "@nestjs/common";

export const SCOPE_METADATA = "SCOPE_METADATA";

export type ScopeType =
  | "platform"
  | "org"
  | "league"
  | "season"
  | "division"
  | "team"
  | "game";

/**
 * Bind a `@Roles()`-protected handler to a resource scope. The guard reads
 * the URL param (e.g. `:leagueId`) and verifies the principal has an
 * active `user_role_assignment` with `scope_type=<scopeType>` and
 * `scope_id=<resolved param>`.
 *
 * Pass `paramName` to override the default `<scopeType>Id` → `:leagueId`.
 */
export interface ScopeMeta {
  scopeType: ScopeType;
  paramName?: string;
}

export const Scope = (scopeType: ScopeType, paramName?: string) =>
  SetMetadata(SCOPE_METADATA, { scopeType, paramName } as ScopeMeta);
