import { ApiProperty } from "@nestjs/swagger";
import { IsBase64, IsIn, MaxLength } from "class-validator";

export class UploadAvatarBodyDto {
  @ApiProperty({ enum: ["image/png", "image/jpeg", "image/webp"] })
  @IsIn(["image/png", "image/jpeg", "image/webp"])
  contentType!: "image/png" | "image/jpeg" | "image/webp";

  /** Raw file bytes, base64 (no data: prefix). 2 MB decoded at most. */
  @ApiProperty()
  @IsBase64()
  @MaxLength(2_800_000)
  dataBase64!: string;
}
