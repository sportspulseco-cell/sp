import { Inject, Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../../../shared/auth/supabase-admin.service";
import {
  ROLE_REPOSITORY,
  type RoleRepository
} from "../../domain/repositories/role.repository";
import {
  RoleAssignmentDto
} from "../dtos/role.dto";
import type { ScopeType } from "@sportspulse/kernel";

export interface InviteUserInput {
  email: string;
  displayName?: string | null;
  /**
   * Optional role to assign immediately on invite. The handler resolves
   * `roleCode` to a `roleId` so callers don't need to know the IDs.
   */
  role?: {
    roleCode: string;
    scopeType: ScopeType;
    scopeId?: string | null;
  };
  /**
   * Optional initial password. When set, the user is created in Supabase
   * with email auto-confirmed; the inviter is responsible for relaying
   * the credentials. When unset, a magic-link invite email is sent
   * instead.
   */
  password?: string | null;
  /** Acting principal — recorded as the granter on the assignment. */
  invitedByUserId: string;
}

export interface InviteUserResult {
  userId: string;
  email: string;
  /** True if Supabase created a new auth row, false if the email already existed. */
  created: boolean;
  assignment: RoleAssignmentDto | null;
}

/**
 * One-shot user invite that:
 *   1. Asks Supabase to email an invite (creates the auth.users row).
 *   2. Optionally writes a role assignment so grants are live the moment
 *      the user signs in for the first time.
 *
 * Idempotent on email: if the email is already in auth.users, the existing
 * user_id is returned and the role assignment (if any) is still upserted.
 *
 * Reused by the super_admin invite modal AND by every "Assign admin / Invite
 * by email" surface (org / league / season / division / team detail pages),
 * so the contract here is the canonical one — do not invite users via any
 * other path.
 */
@Injectable()
export class InviteUserHandler {
  private readonly log = new Logger(InviteUserHandler.name);

  constructor(
    private readonly supabase: SupabaseAdminService,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository
  ) {}

  async execute(input: InviteUserInput): Promise<InviteUserResult> {
    const email = input.email.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error(`Invalid email: ${input.email}`);
    }

    const { userId, created } = await this.supabase.inviteUserByEmail({
      email,
      displayName: input.displayName ?? null,
      password: input.password ?? null
    });

    let assignment: RoleAssignmentDto | null = null;
    if (input.role) {
      // System roles live at orgId=null. (Custom org-scoped roles can't
      // currently be granted via invite; UX-side this is gated to system
      // roles only.)
      const role = await this.roles.findRoleByCode(null, input.role.roleCode);
      if (!role) {
        throw new Error(`Role code not found: ${input.role.roleCode}`);
      }
      const row = await this.roles.assignRole({
        userId,
        roleId: role.id,
        scopeType: input.role.scopeType,
        scopeId:
          input.role.scopeType === "platform"
            ? null
            : (input.role.scopeId ?? null),
        grantedByUserId: input.invitedByUserId
      });
      assignment = RoleAssignmentDto.fromRow(row);
    }

    this.log.log(
      `invite ${created ? "sent" : "linked"} for ${email}${
        input.role ? ` with role=${input.role.roleCode} scope=${input.role.scopeType}` : ""
      }`
    );

    return { userId, email, created, assignment };
  }
}
