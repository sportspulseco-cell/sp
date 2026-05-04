import {
  Body,
  Controller,
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
import {
  FormVersionDto,
  RegistrationFormDto,
  RegistrationFormPageDto
} from "../application/dtos/registration.dto";
import {
  CreateFormHandler,
  CreateFormVersionHandler,
  GetFormHandler,
  ListFormVersionsHandler,
  ListFormsHandler,
  PublishFormVersionHandler,
  UpdateFormHandler
} from "../application/registration-forms/handlers";
import {
  CreateFormBodyDto,
  CreateFormVersionBodyDto,
  ListFormsQueryDto,
  UpdateFormBodyDto
} from "./dto/registration.dto";

@ApiTags("registration/forms")
@ApiBearerAuth()
@Controller("registration/forms")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class RegistrationFormsController {
  constructor(
    private readonly listH: ListFormsHandler,
    private readonly getH: GetFormHandler,
    private readonly createH: CreateFormHandler,
    private readonly updateH: UpdateFormHandler,
    private readonly listVersionsH: ListFormVersionsHandler,
    private readonly createVersionH: CreateFormVersionHandler,
    private readonly publishH: PublishFormVersionHandler
  ) {}

  @Get() list(@Query() q: ListFormsQueryDto): Promise<RegistrationFormPageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") getOne(@Param("id") id: string): Promise<RegistrationFormDto> {
    return this.getH.execute({ id });
  }
  @Post() create(@Body() body: CreateFormBodyDto): Promise<RegistrationFormDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateFormBodyDto
  ): Promise<RegistrationFormDto> {
    return this.updateH.execute({ id, ...body });
  }

  @Get(":id/versions") @ApiOperation({ summary: "List versions of a form" })
  versions(@Param("id") formId: string): Promise<FormVersionDto[]> {
    return this.listVersionsH.execute({ formId });
  }
  @Post(":id/versions") @ApiOperation({ summary: "Create a draft version" })
  createVersion(
    @Param("id") formId: string,
    @Body() body: CreateFormVersionBodyDto
  ): Promise<FormVersionDto> {
    return this.createVersionH.execute({ formId, schema: body.schema });
  }
  @Post(":id/versions/:versionId/publish")
  @ApiOperation({ summary: "Publish a version (locks it, sets active)" })
  publish(
    @Param("id") formId: string,
    @Param("versionId") versionId: string
  ): Promise<RegistrationFormDto> {
    return this.publishH.execute({ formId, versionId });
  }
}
