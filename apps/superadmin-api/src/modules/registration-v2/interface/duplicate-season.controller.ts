import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested, ArrayMaxSize, ArrayMinSize, IsArray } from "class-validator";
import { Type } from "class-transformer";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { AuthorizedAccessGuard } from "../../../shared/auth/guards/authorized-access.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { loadAdminScope } from "../../../shared/auth/scope";
import { DuplicateSeasonService } from "../application/duplicate-season.service";

class DuplicateSeasonBody {
  @ApiProperty() @IsString() @MaxLength(120) name!:string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!:string;
  @ApiProperty() @IsUUID() requestId!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) newLeagueName?:string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() copySchedule?:boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() copyTeamEntries?:boolean;
}
class DuplicateBatchItem extends DuplicateSeasonBody {
  @ApiProperty() @IsUUID() sourceSeasonId!:string;
}
class DuplicateBatchBody {
  @ApiProperty({type:[DuplicateBatchItem]}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5)
  @ValidateNested({each:true}) @Type(()=>DuplicateBatchItem) items!:DuplicateBatchItem[];
}

@ApiTags("registration-v2/seasons") @ApiBearerAuth()
@Controller("registration-v2/seasons") @UseGuards(JwtAuthGuard,AuthorizedAccessGuard)
export class DuplicateSeasonController {
  constructor(private readonly copy:DuplicateSeasonService,@Inject(DRIZZLE) private readonly db:Database){}
  private async authorize(sourceSeasonId:string,userId:string) {
    const [season]=await this.db.select({orgId:schema.seasons.orgId,leagueId:schema.seasons.leagueId}).from(schema.seasons).where(and(eq(schema.seasons.id,sourceSeasonId),isNull(schema.seasons.deletedAt))).limit(1);
    const admin=await loadAdminScope(this.db,userId);
    if(!season || !((admin.orgIds===null || admin.orgIds.includes(season.orgId)) || (admin.leagueIds===null || admin.leagueIds.includes(season.leagueId))))throw new NotFoundException("Season not found or unavailable to your account.");
  }
  @Post(":id/duplicate") @AllowScopedWrite()
  @ApiOperation({summary:"Copy a season into a new draft, optionally under a new league. Never copy payments, registrations, rosters or results."})
  async duplicate(@Param("id") id:string,@Body() body:DuplicateSeasonBody,@CurrentUser() user:AuthPrincipal) {
    await this.authorize(id,user.userId);
    return this.copy.execute({...body,sourceSeasonId:id},user.userId);
  }
  @Post("duplicate-batch") @AllowScopedWrite()
  @ApiOperation({summary:"Process up to five configuration copies per request. Queue further batches with stable per-item IDs. Schedule copies run one at a time."})
  async batch(@Body() body:DuplicateBatchBody,@CurrentUser() user:AuthPrincipal) {
    if(body.items.length>1 && body.items.some(item=>item.copySchedule))throw new BadRequestException("Copy schedules one at a time to stay within the request time budget.");
    // Authorize the whole batch before the first write; no partial side
    // effects when an input attempts a cross-organization copy.
    for(const item of body.items)await this.authorize(item.sourceSeasonId,user.userId);
    const results=[];
    for(const item of body.items){
      try{results.push({requestId:item.requestId,ok:true,result:await this.copy.execute(item,user.userId)});}
      catch(error){results.push({requestId:item.requestId,ok:false,message:error instanceof Error && "code" in error ? error.message:"Copy failed. Retry this item with the same request ID."});}
    }
    return {results};
  }
}
