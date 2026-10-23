import { ApiProperty } from "@nestjs/swagger";
import type { Profile } from "../../domain/entities/profile.entity";

// Outbound representation — never expose the aggregate directly.
export class ProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) email!: string | null;
  @ApiProperty({ nullable: true }) legalFirstName!: string | null;
  @ApiProperty({ nullable: true }) legalLastName!: string | null;
  @ApiProperty({ nullable: true }) preferredName!: string | null;
  @ApiProperty({ nullable: true }) displayName!: string | null;
  @ApiProperty({ nullable: true }) countryCode!: string | null;
  @ApiProperty() locale!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ["pending", "active", "suspended", "deleted"] })
  status!: "pending" | "active" | "suspended" | "deleted";
  @ApiProperty() isSuperAdmin!: boolean;
  /**
   * Region names this user is attached to, through role scopes and
   * rosters (division -> region). Filled by the list query; empty when
   * none. Country is a profile field; region is a structural tier.
   */
  @ApiProperty({ type: [String], required: false }) regions?: string[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(p: Profile): ProfileDto {
    const s = p.toSnapshot();
    return {
      id: s.id,
      email: s.email,
      legalFirstName: s.legalFirstName,
      legalLastName: s.legalLastName,
      preferredName: s.preferredName,
      displayName: s.displayName,
      countryCode: s.countryCode,
      locale: s.locale,
      timezone: s.timezone,
      status: s.status,
      isSuperAdmin: s.isSuperAdmin,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    };
  }
}

export class ProfilePageDto {
  @ApiProperty({ type: [ProfileDto] }) items!: ProfileDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
