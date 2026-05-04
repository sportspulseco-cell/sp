import type { Page, PageQuery } from "@sportspulse/kernel";

export type RoleScopeType =
  | "platform"
  | "org"
  | "league"
  | "season"
  | "division"
  | "team"
  | "game";

export interface RoleRow {
  id: string;
  orgId: string | null;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleAssignmentRow {
  id: string;
  userId: string;
  roleId: string;
  scopeType: RoleScopeType;
  scopeId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  grantedByUserId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  /** Joined fields, populated by `list*` calls. */
  role?: RoleRow;
}

export interface ListRolesQuery extends PageQuery {
  orgId?: string | null;
  isSystem?: boolean;
  search?: string;
}

export interface CreateRoleInput {
  orgId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  permissions?: string[];
}

export interface UpdateRoleInput {
  id: string;
  name?: string;
  description?: string | null;
  permissions?: string[];
}

export interface ListRoleAssignmentsQuery extends PageQuery {
  userId?: string;
  roleId?: string;
  scopeType?: RoleScopeType;
  scopeId?: string;
  /** When true, exclude revoked assignments. */
  activeOnly?: boolean;
}

export interface AssignRoleInput {
  userId: string;
  roleId: string;
  scopeType: RoleScopeType;
  scopeId?: string | null;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  grantedByUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RoleRepository {
  // Roles
  listRoles(q: ListRolesQuery): Promise<Page<RoleRow>>;
  findRole(id: string): Promise<RoleRow | null>;
  findRoleByCode(orgId: string | null, code: string): Promise<RoleRow | null>;
  createRole(input: CreateRoleInput): Promise<RoleRow>;
  updateRole(input: UpdateRoleInput): Promise<RoleRow>;
  deleteRole(id: string): Promise<void>;

  // Role assignments
  listAssignments(
    q: ListRoleAssignmentsQuery
  ): Promise<Page<RoleAssignmentRow>>;
  findAssignment(id: string): Promise<RoleAssignmentRow | null>;
  /**
   * Assign a role. Idempotent on (user, role, scopeType, scopeId)
   * for currently-active rows — re-assigning an active match is a no-op
   * and returns the existing row.
   */
  assignRole(input: AssignRoleInput): Promise<RoleAssignmentRow>;
  revokeAssignment(
    id: string,
    revokedByUserId?: string | null
  ): Promise<RoleAssignmentRow>;
  /** Active assignments for a user, joined with the role row. */
  activeAssignmentsForUser(userId: string): Promise<RoleAssignmentRow[]>;
}

export const ROLE_REPOSITORY = Symbol("ROLE_REPOSITORY");
