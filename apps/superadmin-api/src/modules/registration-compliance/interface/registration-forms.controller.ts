import {
  BadRequestException,
  Logger,
  NotFoundException,
  Body,
  Controller,
  Get,
  Inject,
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
import { formVisible, visibleRegistrationsWhere } from "../../../shared/auth/visibility";
import {
  formSubmissionsCsv,
  isStatusFilter,
  loadFormSubmissions,
  type FormSubmissions
} from "../application/registration-forms/form-submissions";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { resolveEntityNames } from "../../../shared/display/entity-names";
import type { Database } from "@sportspulse/db";
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
// Reads: super admin or a scoped admin (forms of their orgs / leagues /
// seasons). Writes: super admin only (guard write rule).
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class RegistrationFormsController {
  private readonly log = new Logger("FormSubmissions");
  constructor(
    private readonly listH: ListFormsHandler,
    private readonly getH: GetFormHandler,
    private readonly createH: CreateFormHandler,
    private readonly updateH: UpdateFormHandler,
    private readonly listVersionsH: ListFormVersionsHandler,
    private readonly createVersionH: CreateFormVersionHandler,
    private readonly publishH: PublishFormVersionHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  @Get() async list(
    @Query() q: ListFormsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<RegistrationFormPageDto> {
    const page = await this.listH.execute({
      limit: q.limit,
      cursor: q.cursor,
      orgId: q.orgId,
      visibleTo: scope,
      scope: q.scope,
      scopeId: q.scopeId,
      purpose: q.purpose,
      role: q.role,
      search: q.search
    });
    // Scope names so the list never shows raw ids.
    const names = await resolveEntityNames(
      this.db,
      page.items.map((f) => ({ type: f.scope, id: f.scopeId }))
    );
    return {
      ...page,
      items: page.items.map((f) => ({
        ...f,
        scopeName: f.scopeId ? names.get(`${f.scope}:${f.scopeId}`) ?? null : null
      }))
    };
  }
  @Get(":id") async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<RegistrationFormDto> {
    if (!(await formVisible(this.db, scope, id))) throw new NotFoundException("Form not found");
    return this.getH.execute({ id });
  }
  @Post() create(@Body() body: CreateFormBodyDto): Promise<RegistrationFormDto> {
    return this.createH.execute({
      orgId: body.orgId,
      scope: body.scope,
      scopeId: body.scopeId,
      seasonId: body.seasonId,
      name: body.name,
      description: body.description,
      purpose: body.purpose,
      appliesToRoles: body.appliesToRoles
    });
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateFormBodyDto
  ): Promise<RegistrationFormDto> {
    return this.updateH.execute({
      id,
      name: body.name,
      description: body.description,
      seasonId: body.seasonId,
      purpose: body.purpose,
      appliesToRoles: body.appliesToRoles
    });
  }

  @Get(":id/versions") @ApiOperation({ summary: "List versions of a form" })
  async versions(
    @Param("id") formId: string,
    @UserScope() scope: UserScopeType
  ): Promise<FormVersionDto[]> {
    if (!(await formVisible(this.db, scope, formId))) throw new NotFoundException("Form not found");
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
  /**
   * The form's submissions with every answer. Rows are the registrations
   * made on any version of this form that the caller may read; columns
   * label each answer. `status` takes the same filter values as the
   * Submissions view.
   */
  @Get(":id/submissions")
  @ApiOperation({
    summary:
      "Submissions of this form (any version) with answers, newest first. status: all | approved | pending_review | pending_payment | rejected."
  })
  async submissions(
    @Param("id") formId: string,
    @Query("status") status: string | undefined,
    @UserScope() scope: UserScopeType
  ): Promise<FormSubmissions> {
    return this.loadSubmissions(formId, status, scope);
  }

  /**
   * The same rows as CSV, returned as JSON `{ filename, csv }` so the web
   * apps' authenticated fetcher can save it as a file.
   */
  @Get(":id/submissions/export")
  @ApiOperation({
    summary:
      "CSV of this form's submissions with one column per answer, as { filename, csv, rows }. Same status filter as the view."
  })
  async exportSubmissions(
    @Param("id") formId: string,
    @Query("status") status: string | undefined,
    @UserScope() scope: UserScopeType
  ): Promise<{ filename: string; csv: string; rows: number; truncated: boolean }> {
    const s = await this.loadSubmissions(formId, status, scope);
    const out = formSubmissionsCsv(s);
    this.log.log(`export form=${formId} status=${s.status} rows=${s.items.length} columns=${s.columns.length} truncated=${s.truncated}`);
    return { ...out, rows: s.items.length, truncated: s.truncated };
  }

  private async loadSubmissions(formId: string, status: string | undefined, scope: UserScopeType) {
    const filter = status ?? "all";
    if (!isStatusFilter(filter)) {
      throw new BadRequestException("status must be one of all, approved, pending_review, pending_payment, rejected");
    }
    if (!(await formVisible(this.db, scope, formId))) throw new NotFoundException("Form not found");
    const s = await loadFormSubmissions(this.db, formId, filter, visibleRegistrationsWhere(scope));
    if (!s) throw new NotFoundException("Form not found");
    return s;
  }
}
