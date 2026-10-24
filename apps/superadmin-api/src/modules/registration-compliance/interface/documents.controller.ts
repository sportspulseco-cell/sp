import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import { orgVisible } from "../../../shared/auth/visibility";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import { inArray, eq } from "drizzle-orm";
import { schema, type Database } from "@sportspulse/db";
import {
  ConsentSignatureDto,
  DocumentDto,
  DocumentPageDto,
  DocumentVersionDto
} from "../application/dtos/document.dto";
import {
  CreateDocumentHandler,
  GetDocumentHandler,
  ListDocumentsHandler,
  ListDocumentVersionsHandler,
  ListPersonSignaturesHandler,
  PublishDocumentVersionHandler,
  RevokeSignatureHandler,
  SignDocumentHandler,
  UpdateDocumentHandler
} from "../application/documents/handlers";
import {
  CreateDocumentBodyDto,
  ListDocumentsQueryDto,
  PublishDocumentVersionBodyDto,
  RevokeSignatureBodyDto,
  SignDocumentBodyDto,
  UpdateDocumentBodyDto
} from "./dto/document.dto";

@ApiTags("compliance/documents")
@ApiBearerAuth()
@Controller("compliance/documents")
// Reads: super admin or a scoped admin (documents of their orgs plus
// platform-wide ones). Writes: super admin only (guard write rule).
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class DocumentsController {
  constructor(
    private readonly listH: ListDocumentsHandler,
    private readonly getH: GetDocumentHandler,
    private readonly createH: CreateDocumentHandler,
    private readonly updateH: UpdateDocumentHandler,
    private readonly listVersionsH: ListDocumentVersionsHandler,
    private readonly publishH: PublishDocumentVersionHandler,
    private readonly signH: SignDocumentHandler,
    private readonly revokeH: RevokeSignatureHandler,
    private readonly personSigsH: ListPersonSignaturesHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // ---- Documents ----
  @Get() list(
    @Query() q: ListDocumentsQueryDto,
    @UserScope() scope: UserScopeType
  ): Promise<DocumentPageDto> {
    if (q.orgId && !orgVisible(scope, q.orgId)) {
      return Promise.resolve({ items: [], nextCursor: null });
    }
    return this.listH.execute({ ...q, visibleTo: scope });
  }
  @Get(":id") async getOne(
    @Param("id") id: string,
    @UserScope() scope: UserScopeType
  ): Promise<DocumentDto> {
    const doc = await this.getH.execute({ id });
    if (!orgVisible(scope, doc.orgId)) throw new NotFoundException("Document not found");
    return doc;
  }
  @Post() create(@Body() body: CreateDocumentBodyDto): Promise<DocumentDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() body: UpdateDocumentBodyDto
  ): Promise<DocumentDto> {
    return this.updateH.execute({ id, ...body });
  }

  // ---- Versions ----
  @Get(":id/versions") async versions(
    @Param("id") documentId: string,
    @UserScope() scope: UserScopeType
  ): Promise<DocumentVersionDto[]> {
    const doc = await this.getH.execute({ id: documentId });
    if (!orgVisible(scope, doc.orgId)) throw new NotFoundException("Document not found");
    return this.listVersionsH.execute({ documentId });
  }
  @Post(":id/versions/publish")
  @ApiOperation({ summary: "Publish a new version (supersedes prior, sets active)" })
  publish(
    @Param("id") documentId: string,
    @Body() body: PublishDocumentVersionBodyDto
  ): Promise<DocumentVersionDto> {
    return this.publishH.execute({ documentId, ...body });
  }

  // ---- Signatures ----
  @Post("signatures")
  @ApiOperation({ summary: "Sign a document version on behalf of a person" })
  sign(
    @Body() body: SignDocumentBodyDto,
    @CurrentUser() user: AuthPrincipal,
    @Req() req: { ip?: string; headers?: Record<string, string | undefined> }
  ): Promise<ConsentSignatureDto> {
    return this.signH.execute({
      ...body,
      signedByUserId: user.userId,
      ipAddr: req.ip ?? null,
      userAgent: req.headers?.["user-agent"] ?? null
    });
  }
  @Post("signatures/:id/revoke") revoke(
    @Param("id") id: string,
    @Body() body: RevokeSignatureBodyDto
  ) {
    return this.revokeH.execute({ id, reason: body.reason });
  }
  @Get("signatures/by-person/:personId")
  async byPerson(@Param("personId") personId: string): Promise<ConsentSignatureDto[]> {
    const sigs = await this.personSigsH.execute({ personId });
    // Add documentName + versionNumber so screens never print raw ids.
    const versionIds = [...new Set(sigs.map((s) => s.documentVersionId))];
    if (versionIds.length === 0) return sigs;
    const rows = await this.db
      .select({
        id: schema.documentVersions.id,
        versionNumber: schema.documentVersions.versionNumber,
        documentName: schema.documents.name
      })
      .from(schema.documentVersions)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentVersions.documentId))
      .where(inArray(schema.documentVersions.id, versionIds));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return sigs.map((s) => ({
      ...s,
      documentName: byId.get(s.documentVersionId)?.documentName ?? null,
      documentVersionNumber: byId.get(s.documentVersionId)?.versionNumber ?? null
    }));
  }
}
