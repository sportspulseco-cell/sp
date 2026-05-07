import { SetMetadata } from "@nestjs/common";

/**
 * Marks a handler as performing its own per-row scope check, so the
 * default "writes require super_admin" rule in AuthorizedAccessGuard
 * is skipped. The handler is then responsible for validating the
 * caller's scope against the target entity (typically: "is this team
 * in scope.teamIds, or is the caller super_admin / org_admin / etc.").
 *
 * Used by team_admin + captain flows where a non-super-admin user
 * legitimately needs to PATCH / POST a row inside their own team.
 */
export const ALLOW_SCOPED_WRITE_KEY = "allowScopedWrite";
export const AllowScopedWrite = () => SetMetadata(ALLOW_SCOPED_WRITE_KEY, true);
