import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationOptions
} from "class-validator";

// Reject any ISO date/timestamp earlier than start-of-today (local server time).
// Seasons must always be created with a forward-looking window — past windows
// are a UX trap (registration "open" but already closed, games scheduled in
// the past). Lives next to the DTO to keep the contract obvious.
export function IsFutureOrToday(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isFutureOrToday",
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined || value === "") return true;
          if (typeof value !== "string") return false;
          // Compare on the date portion only; the input emits YYYY-MM-DD.
          const dateOnly = value.slice(0, 10);
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, "0");
          const d = String(now.getDate()).padStart(2, "0");
          const today = `${y}-${m}-${d}`;
          return dateOnly >= today;
        },
        defaultMessage() {
          return `${propertyName} must be today or a future date`;
        }
      }
    });
  };
}

export class CreateSeasonBodyDto {
  /** Post-flip — seasons live under a league. */
  @ApiProperty() @IsUUID() leagueId!: string;
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty() @IsString() sportCode!: string;
  @ApiProperty({ description: "ISO date YYYY-MM-DD" })
  @IsDateString() @IsFutureOrToday() startDate!: string;
  @ApiProperty({ description: "ISO date YYYY-MM-DD" })
  @IsDateString() @IsFutureOrToday() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional({ description: "ISO timestamp" })
  @IsOptional() @IsDateString() @IsFutureOrToday() registrationOpensAt?: string | null;
  @ApiPropertyOptional({ description: "ISO timestamp" })
  @IsOptional() @IsDateString() @IsFutureOrToday() registrationClosesAt?: string | null;
  @ApiPropertyOptional({ description: "ISO timestamp" })
  @IsOptional() @IsDateString() @IsFutureOrToday() rosterLockAt?: string | null;
}

export class UpdateSeasonBodyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() registrationOpensAt?: string | null;
  @ApiPropertyOptional() @IsOptional() registrationClosesAt?: string | null;
  @ApiPropertyOptional() @IsOptional() rosterLockAt?: string | null;
}

export class ChangeSeasonStatusBodyDto {
  @ApiProperty({
    enum: [
      "draft",
      "registration_open",
      "in_progress",
      "playoffs",
      "completed",
      "archived"
    ]
  })
  @IsIn([
    "draft",
    "registration_open",
    "in_progress",
    "playoffs",
    "completed",
    "archived"
  ])
  status!: string;
}

export class ListSeasonsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() leagueId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() orgId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sportCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
