import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { Person } from "../../domain/entities/person.entity";

export class PersonDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) userId!: string | null;
  @ApiProperty() legalFirstName!: string;
  @ApiProperty() legalLastName!: string;
  @ApiPropertyOptional({ nullable: true }) preferredName!: string | null;
  @ApiPropertyOptional({ nullable: true }) dobDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) genderSelfId!: string | null;
  @ApiPropertyOptional({ nullable: true }) pronouns!: string | null;
  @ApiPropertyOptional({ nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) photoUrl!: string | null;
  @ApiProperty() externalIds!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  static fromDomain(p: Person): PersonDto {
    const x = p.toSnapshot();
    return {
      id: x.id,
      userId: x.userId,
      legalFirstName: x.legalFirstName,
      legalLastName: x.legalLastName,
      preferredName: x.preferredName,
      dobDate: x.dobDate,
      genderSelfId: x.genderSelfId,
      pronouns: x.pronouns,
      countryCode: x.countryCode,
      photoUrl: x.photoUrl,
      externalIds: x.externalIds,
      createdAt: x.createdAt.toISOString(),
      updatedAt: x.updatedAt.toISOString()
    };
  }
}

export class PersonPageDto {
  @ApiProperty({ type: [PersonDto] }) items!: PersonDto[];
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
}
