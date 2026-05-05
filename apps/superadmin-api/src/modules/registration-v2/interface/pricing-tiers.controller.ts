import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { RegistrationV2Service } from "../application/registration-v2.service";
import {
  CreatePricingTierBodyDto,
  ListPricingTiersQueryDto,
  UpdatePricingTierBodyDto
} from "./dto/pricing-tier.dto";

@ApiTags("registration-v2/pricing-tiers")
@ApiBearerAuth()
@Controller("registration-v2/pricing-tiers")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class PricingTiersController {
  constructor(private readonly svc: RegistrationV2Service) {}

  @Get()
  @ApiOperation({ summary: "List pricing tiers (optionally filter by season)" })
  list(@Query() q: ListPricingTiersQueryDto) {
    return this.svc.listPricingTiers({ seasonId: q.seasonId });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a pricing tier" })
  getOne(@Param("id") id: string) {
    return this.svc.getPricingTier(id);
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
