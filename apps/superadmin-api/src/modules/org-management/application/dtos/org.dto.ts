import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Org } from "../../domain/entities/org.entity";
import type { OrgRelation } from "../../domain/entities/org-relation.entity";
import type { CrossOrgGrant } from "../../domain/entities/cross-org-grant.entity";
import { ORG_STATUSES, ORG_TYPES } from "../../domain/value-objects/org-status.vo";

export class OrgDto {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() legalName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ORG_TYPES }) orgType!: (typeof ORG_TYPES)[number];
  @ApiProperty() countryCode!: string;
  @ApiProperty() defaultLocale!: string;
  @ApiProperty() defaultCurrency!: string;
  @ApiProperty() defaultTimezone!: string;
  @ApiProperty({ enum: ORG_STATUSES }) status!: (typeof ORG_STATUSES)[number];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(o: Org): OrgDto {
    const x = o.toSnapshot();
    return {
      id: x.id,
      slug: x.slug,
      legalName: x.legalName,
      displayName: x.displayName,
      orgType: x.orgType,
      countryCode: x.countryCode,
      defaultLocale: x.defaultLocale,
      defaultCurrency: x.defaultCurrency,
      defaultTimezone: x.defaultTimezone,
      status: x.status,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class OrgPageDto {
  @ApiProperty({ type: [OrgDto] }) items!: OrgDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}

export class OrgRelationDto {
  @ApiProperty() id!: string;
  @ApiProperty() parentOrgId!: string;
  @ApiProperty() childOrgId!: string;
  @ApiProperty({ enum: ["sanctions", "member_of", "owns"] })
  relation!: "sanctions" | "member_of" | "owns";
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;

  static fromDomain(r: OrgRelation): OrgRelationDto {
    const x = r.toSnapshot();
    return {
      id: x.id,
      parentOrgId: x.parentOrgId,
      childOrgId: x.childOrgId,
      relation: x.relation,
      effectiveFrom: x.effectiveFrom.toISOString(),
      effectiveTo: x.effectiveTo?.toISOString() ?? null
    };
  }
}

export class CrossOrgGrantDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() fromOrgId!: string;
  @ApiProperty() toOrgId!: string;
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() effectiveFrom!: string;
  @ApiPropertyOptional({ nullable: true }) effectiveTo!: string | null;

  static fromDomain(g: CrossOrgGrant): CrossOrgGrantDto {
    const x = g.toSnapshot();
    return {
      id: x.id,
      userId: x.userId,
      fromOrgId: x.fromOrgId,
      toOrgId: x.toOrgId,
      permissions: x.permissions,
      effectiveFrom: x.effectiveFrom.toISOString(),
      effectiveTo: x.effectiveTo?.toISOString() ?? null
    };
  }
}
