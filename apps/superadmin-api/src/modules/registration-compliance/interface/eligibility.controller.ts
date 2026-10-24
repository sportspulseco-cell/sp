import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { isHardBlockCheck } from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { seasonVisible } from "../../../shared/auth/visibility";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import type { Database } from "@sportspulse/db";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import {
  EligibilityRecordDto,
  EligibilityRecordPageDto
} from "../application/dtos/registration.dto";
import {
  CreateEligibilityHandler,
  GetEligibilityHandler,
  ListEligibilityHandler,
  ReevaluateEligibilityHandler,
  WaiveEligibilityHandler
} from "../application/eligibility/handlers";
import {
  CreateEligibilityBodyDto,
  ListEligibilityQueryDto,
  ReevaluateEligibilityBodyDto,
  WaiveEligibilityBodyDto
} from "./dto/registration.dto";

@ApiTags("compliance/eligibility")
@ApiBearerAuth()
@Controller("compliance/eligibility")
// Reads: super admin or a scoped admin (records of seasons inside their
// scope). Writes: super admin only (guard write rule).
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class EligibilityController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly listH: ListEligibilityHandler,
    private readonly getH: GetEligibilityHandler,
    private readonly createH: CreateEligibilityHandler,
    private readonly reevalH: ReevaluateEligibilityHandler,
    private readonly waiveH: WaiveEligibilityHandler
  ) {}

  @Get() async list(
    @Query() q: ListEligibilityQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<EligibilityRecordPageDto> {
    if (q.seasonId && !(await seasonVisible(this.db, scope, q.seasonId))) {
      return { items: [], nextCursor: null };
    }
    return this.listH.execute({ ...q, visibleTo: scope });
  }
  // Constrain :id to UUID shape so /compliance/eligibility/precheck
  // (registered on a separate ComplianceController) doesn't get swallowed
  // by Express first-match into this :id handler — which 500'd with
  // "Invalid UUID: precheck" before the precheck route was reached (BUG-033).
  @Get(":id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
  async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<EligibilityRecordDto> {
    const rec = await this.getH.execute({ id });
    if (!(await seasonVisible(this.db, scope, rec.seasonId))) {
      throw new NotFoundException("Eligibility record not found");
    }
    return rec;
  }
  @Post() @ApiOperation({ summary: "Create eligibility record" })
  create(
    @Body() body: CreateEligibilityBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<EligibilityRecordDto> {
    return this.createH.execute({ ...body, evaluatedByUserId: user.userId });
  }
  @Post(":id/reevaluate") @ApiOperation({ summary: "Re-evaluate eligibility" })
  reevaluate(
    @Param("id") id: string,
    @Body() body: ReevaluateEligibilityBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<EligibilityRecordDto> {
    return this.reevalH.execute({
      id,
      ruleEvaluation: body.ruleEvaluation,
      status: body.status,
      evaluatedByUserId: user.userId
    });
  }
  @Post(":id/waive")
  @ApiOperation({
    summary:
      "Waive a soft block / admin flag (Workflow 7C §5.1). Hard-block check types (ageRestriction, genderEligibility, rosterSize) are rejected with 422 per ARCH 3 — they cannot be waived."
  })
  waive(
    @Param("id") id: string,
    @Body() body: WaiveEligibilityBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<EligibilityRecordDto> {
    if (body.checkType && isHardBlockCheck(body.checkType)) {
      throw new UnprocessableEntityException({
        error: "hard_block_not_waivable",
        message:
          "Age, gender, and roster-size eligibility checks cannot be waived.",
        checkType: body.checkType
      });
    }
    return this.waiveH.execute({
      id,
      reason: body.reason,
      checkType: body.checkType,
      byUserId: user.userId
    });
  }
}
