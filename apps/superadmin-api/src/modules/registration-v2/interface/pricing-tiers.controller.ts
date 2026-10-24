import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { seasonVisible, unrestricted } from "../../../shared/auth/visibility";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import type { Database } from "@sportspulse/db";
import { RegistrationV2Service } from "../application/registration-v2.service";
import {
  CreatePricingTierBodyDto,
  ListPricingTiersQueryDto,
  UpdatePricingTierBodyDto
} from "./dto/pricing-tier.dto";

@ApiTags("registration-v2/pricing-tiers")
@ApiBearerAuth()
@Controller("registration-v2/pricing-tiers")
// Reads: super admin or a scoped admin (tiers of seasons inside their
// scope). Writes: super admin only (guard write rule).
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class PricingTiersController {
  constructor(
    private readonly svc: RegistrationV2Service,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get()
  @ApiOperation({ summary: "List pricing tiers (optionally filter by season)" })
  async list(@Query() q: ListPricingTiersQueryDto, @UserScope() scope: UserScopeType) {
    if (!unrestricted(scope)) {
      // Scoped admins read one season at a time, and only their own.
      if (!q.seasonId || !(await seasonVisible(this.db, scope, q.seasonId))) return [];
    }
    return this.svc.listPricingTiers({ seasonId: q.seasonId });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a pricing tier" })
  async getOne(@Param("id") id: string, @UserScope() scope: UserScopeType) {
    const tier = await this.svc.getPricingTier(id);
    if (!(await seasonVisible(this.db, scope, tier.seasonId))) {
      throw new NotFoundException(`Pricing tier ${id} not found`);
    }
    return tier;
  }

  @Post()
  @ApiOperation({ summary: "Create a pricing tier" })
  create(@Body() body: CreatePricingTierBodyDto) {
    return this.svc.createPricingTier(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a pricing tier (auto-save on blur)" })
  update(@Param("id") id: string, @Body() body: UpdatePricingTierBodyDto) {
    return this.svc.updatePricingTier(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a pricing tier" })
  remove(@Param("id") id: string) {
    return this.svc.deletePricingTier(id);
  }
}
