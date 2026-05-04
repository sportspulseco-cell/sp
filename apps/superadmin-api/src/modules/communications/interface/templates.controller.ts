import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import {
  DeleteTemplateHandler,
  GetTemplateHandler,
  ListTemplatesHandler,
  NotificationTemplateDto,
  NotificationTemplatePageDto,
  UpsertTemplateHandler
} from "../application/handlers/templates";
import {
  ListTemplatesQueryDto,
  UpsertTemplateBodyDto
} from "./dto/template.dto";

@ApiTags("communications/templates")
@ApiBearerAuth()
@Controller("notification-templates")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class NotificationTemplatesController {
  constructor(
    private readonly listH: ListTemplatesHandler,
    private readonly getH: GetTemplateHandler,
    private readonly upsertH: UpsertTemplateHandler,
    private readonly deleteH: DeleteTemplateHandler
  ) {}

  @Get()
  list(@Query() q: ListTemplatesQueryDto): Promise<NotificationTemplatePageDto> {
    return this.listH.execute(q);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<NotificationTemplateDto> {
    return this.getH.execute({ id });
  }

  @Post()
  @ApiOperation({
    summary: "Create or upsert a template (unique on org/code/channel/locale)"
  })
  upsert(@Body() body: UpsertTemplateBodyDto): Promise<NotificationTemplateDto> {
    return this.upsertH.execute({
      orgId: body.orgId ?? null,
      code: body.code,
      channel: body.channel,
      locale: body.locale,
      subject: body.subject ?? null,
      bodyTemplate: body.bodyTemplate,
      variables: body.variables ?? [],
      isActive: body.isActive ?? true
    });
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.deleteH.execute({ id });
  }
}
