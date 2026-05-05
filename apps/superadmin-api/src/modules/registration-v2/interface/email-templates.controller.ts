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
  CreateEmailTemplateBodyDto,
  ListEmailTemplatesQueryDto,
  UpdateEmailTemplateBodyDto
} from "./dto/email-template.dto";

@ApiTags("registration-v2/email-templates")
@ApiBearerAuth()
@Controller("registration-v2/email-templates")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class EmailTemplatesController {
  constructor(private readonly svc: RegistrationV2Service) {}

  @Get()
  @ApiOperation({ summary: "List email templates (optionally filter by season)" })
  list(@Query() q: ListEmailTemplatesQueryDto) {
    return this.svc.listEmailTemplates({ seasonId: q.seasonId });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an email template" })
  getOne(@Param("id") id: string) {
    return this.svc.getEmailTemplate(id);
  }

  @Post()
  @ApiOperation({ summary: "Create an email template" })
  create(@Body() body: CreateEmailTemplateBodyDto) {
    return this.svc.createEmailTemplate(body);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an email template (auto-save on blur)" })
  update(@Param("id") id: string, @Body() body: UpdateEmailTemplateBodyDto) {
    return this.svc.updateEmailTemplate(id, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete an email template" })
  remove(@Param("id") id: string) {
    return this.svc.deleteEmailTemplate(id);
  }
}
