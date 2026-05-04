import { Inject, Injectable } from "@nestjs/common";
import {
  ConflictError,
  NotFoundError,
  clampLimit
} from "@sportspulse/kernel";
import {
  ROLE_REPOSITORY,
  type AssignRoleInput,
  type CreateRoleInput,
  type ListRoleAssignmentsQuery,
  type ListRolesQuery,
  type RoleRepository,
  type UpdateRoleInput
} from "../../domain/repositories/role.repository";
import {
  RoleAssignmentDto,
  RoleAssignmentPageDto,
  RoleDto,
  RolePageDto
} from "../dtos/role.dto";

@Injectable()
export class ListRolesHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(q: Partial<ListRolesQuery> = {}): Promise<RolePageDto> {
    const page = await this.repo.listRoles({ ...q, limit: clampLimit(q.limit) });
    return {
      items: page.items.map((r) => RoleDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetRoleHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute({ id }: { id: string }): Promise<RoleDto> {
    const r = await this.repo.findRole(id);
    if (!r) throw new NotFoundError("Role", id);
    return RoleDto.fromRow(r);
  }
}

@Injectable()
export class CreateRoleHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(input: CreateRoleInput): Promise<RoleDto> {
    const dup = await this.repo.findRoleByCode(input.orgId ?? null, input.code);
    if (dup) throw new ConflictError("Role with that code already exists");
    const r = await this.repo.createRole({ ...input, isSystem: false });
    return RoleDto.fromRow(r);
  }
}

@Injectable()
export class UpdateRoleHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(input: UpdateRoleInput): Promise<RoleDto> {
    const existing = await this.repo.findRole(input.id);
    if (!existing) throw new NotFoundError("Role", input.id);
    if (existing.isSystem) {
      // System role names + permissions are seed-managed and cannot be edited
      // via the API to avoid drift between deployments.
      throw new ConflictError("System roles cannot be edited");
    }
    const r = await this.repo.updateRole(input);
    return RoleDto.fromRow(r);
  }
}

@Injectable()
export class DeleteRoleHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute({ id }: { id: string }): Promise<{ ok: true }> {
    const existing = await this.repo.findRole(id);
    if (!existing) throw new NotFoundError("Role", id);
    if (existing.isSystem) throw new ConflictError("System roles cannot be deleted");
    await this.repo.deleteRole(id);
    return { ok: true };
  }
}

@Injectable()
export class ListAssignmentsHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(
    q: Partial<ListRoleAssignmentsQuery> = {}
  ): Promise<RoleAssignmentPageDto> {
    const page = await this.repo.listAssignments({
      ...q,
      limit: clampLimit(q.limit)
    });
    return {
      items: page.items.map((r) => RoleAssignmentDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class AssignRoleHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(input: AssignRoleInput): Promise<RoleAssignmentDto> {
    // Validate role exists and matches scope sanity-check (org-scoped roles
    // shouldn't be assigned at platform scope, etc.).
    const role = await this.repo.findRole(input.roleId);
    if (!role) throw new NotFoundError("Role", input.roleId);
    const row = await this.repo.assignRole(input);
    return RoleAssignmentDto.fromRow(row);
  }
}

@Injectable()
export class RevokeAssignmentHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute(input: {
    id: string;
    revokedByUserId?: string | null;
  }): Promise<RoleAssignmentDto> {
    const existing = await this.repo.findAssignment(input.id);
    if (!existing) throw new NotFoundError("RoleAssignment", input.id);
    const row = await this.repo.revokeAssignment(
      input.id,
      input.revokedByUserId
    );
    return RoleAssignmentDto.fromRow(row);
  }
}

@Injectable()
export class ActiveAssignmentsForUserHandler {
  constructor(@Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository) {}
  async execute({ userId }: { userId: string }): Promise<RoleAssignmentDto[]> {
    const rows = await this.repo.activeAssignmentsForUser(userId);
    return rows.map((r) => RoleAssignmentDto.fromRow(r));
  }
}
