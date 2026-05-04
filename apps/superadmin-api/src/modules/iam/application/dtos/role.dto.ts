import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  RoleAssignmentRow,
  RoleRow
} from "../../domain/repositories/role.repository";

export class RoleDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) orgId!: string | null;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromRow(r: RoleRow): RoleDto {
    return {
      id: r.id,
      orgId: r.orgId,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    };
  }
}

export class RolePageDto {
  @ApiProperty({ type: [RoleDto] }) items!: RoleDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class RoleAssignmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty() scopeType!: string;
  @ApiPropertyOptional({ nullable: true }) scopeId!: string | null;
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) grantedByUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedAt!: string | null;
  @ApiPropertyOptional({ nullable: true }) revokedByUserId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiPropertyOptional({ type: () => RoleDto, nullable: true })
  role!: RoleDto | null;

  static fromRow(r: RoleAssignmentRow): RoleAssignmentDto {
    return {
      id: r.id,
      userId: r.userId,
      roleId: r.roleId,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      effectiveFrom: r.effectiveFrom.toISOString(),
      effectiveTo: r.effectiveTo?.toISOString() ?? null,
      grantedByUserId: r.grantedByUserId,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokedByUserId: r.revokedByUserId,
      createdAt: r.createdAt.toISOString(),
      role: r.role ? RoleDto.fromRow(r.role) : null
    };
  }
}

export class RoleAssignmentPageDto {
  @ApiProperty({ type: [RoleAssignmentDto] }) items!: RoleAssignmentDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
