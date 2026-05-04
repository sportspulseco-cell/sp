import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { clampLimit, NotFoundError } from "@sportspulse/kernel";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { ImportService } from "../application/import.service";
import { ImporterRegistry } from "../application/importers/importer";
import {
  IMPORT_REPOSITORY,
  type ImportRepository
} from "../domain/repositories/import.repository";
import {
  ImportJobDto,
  ImportJobPageDto,
  ImportJobRowDto
} from "../application/dtos";
import {
  ImportCsvBodyDto,
  ListJobsQueryDto
} from "./dto/imports.dto";

@ApiTags("data-migration")
@ApiBearerAuth()
@Controller("imports")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class ImportsController {
  constructor(
    private readonly service: ImportService,
    private readonly registry: ImporterRegistry,
    @Inject(IMPORT_REPOSITORY) private readonly repo: ImportRepository
  ) {}

  @Get("supported")
  @ApiOperation({ summary: "List entity kinds with working importers" })
  supported(): { kinds: string[] } {
    return { kinds: this.registry.supportedKinds() };
  }

  @Get()
  async list(@Query() q: ListJobsQueryDto): Promise<ImportJobPageDto> {
    const page = await this.repo.listJobs({ ...q, limit: clampLimit(q.limit) });
    return {
      items: page.items.map((r) => ImportJobDto.fromRow(r)),
      nextCursor: page.nextCursor
    };
  }

  @Get(":id")
  async get(@Param("id") id: string): Promise<ImportJobDto> {
    const job = await this.repo.findJob(id);
    if (!job) throw new NotFoundError("ImportJob", id);
    return ImportJobDto.fromRow(job);
  }

  @Get(":id/rows")
  async rows(
    @Param("id") id: string,
    @Query("status") status?: "ok" | "failed" | "skipped"
  ): Promise<ImportJobRowDto[]> {
    const rows = await this.repo.listJobRows(id, status);
    return rows.map((r) => ImportJobRowDto.fromRow(r));
  }

  @Post()
  @ApiOperation({
    summary: "Run a CSV import. Synchronous for <1k rows; status returns final."
  })
  async runImport(
    @Body() body: ImportCsvBodyDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<ImportJobDto> {
    const job = await this.service.importCsv({
      entityKind: body.entityKind,
      csv: body.csv,
      orgId: body.orgId ?? null,
      sourceFilename: body.sourceFilename ?? null,
      submittedByUserId: user.userId
    });
    return ImportJobDto.fromRow(job);
  }
}
