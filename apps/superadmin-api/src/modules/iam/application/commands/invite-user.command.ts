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
import {
  InviteMessageService,
  type RenderedInviteMessage
} from "../services/invite-message.service";
import { EmailDispatcherService } from "../../../../shared/notifications/email-dispatcher.service";

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
  /**
   * Optional human label for the scope the role is granted on
   * (e.g. "PPHL · Adult League"). Surfaced in the rendered invite
   * message so the recipient knows which resource they're admin of.
   */
  scopeLabel?: string | null;
  /**
   * Optional display name of the inviting admin — included in the
   * rendered message signature.
   */
  inviterDisplayName?: string | null;
  /** Acting principal — recorded as the granter on the assignment. */
  invitedByUserId: string;
}

export interface InviteUserResult {
  userId: string;
  email: string;
  /** True if Supabase created a new auth row, false if the email already existed. */
  created: boolean;
  assignment: RoleAssignmentDto | null;
  /**
   * Rendered invite message — what we email via Resend AND what the
   * admin gets dropped onto their clipboard. Kept on the result even
   * after real delivery succeeds so the admin can re-paste anywhere.
   */
  message: RenderedInviteMessage;
  /** True when Resend accepted the message; false in log-only mode. */
  emailDelivered: boolean;
  /** Reason the dispatch was log-only / failed, when not delivered. */
  emailDeliveryReason: string | null;
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
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    private readonly inviteMessage: InviteMessageService,
    private readonly email: EmailDispatcherService
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

    const message = this.inviteMessage.render({
      email,
      displayName: input.displayName ?? null,
      password: input.password ?? null,
      role: input.role
        ? {
            roleCode: input.role.roleCode,
            scopeType: input.role.scopeType,
            scopeId: input.role.scopeId ?? null
          }
        : undefined,
      scopeLabel: input.scopeLabel ?? null,
      inviterDisplayName: input.inviterDisplayName ?? null
    });

    // Real send via Resend. Falls back to log-only when RESEND_API_KEY
    // is unset; the rendered message is returned in the response either
    // way so the admin still gets the clipboard / manual-relay path.
    const dispatch = await this.email.send({
      to: message.recipient,
      subject: message.subject,
      body: message.body,
      channel: "iam.invite"
    });

    this.log.log(
      `invite ${created ? "sent" : "linked"} for ${email}${
        input.role ? ` with role=${input.role.roleCode} scope=${input.role.scopeType}` : ""
      } · email_delivered=${dispatch.delivered}`
    );

    return {
      userId,
      email,
      created,
      assignment,
      message,
      emailDelivered: dispatch.delivered,
      emailDeliveryReason: dispatch.reason ?? null
    };
  }
}
