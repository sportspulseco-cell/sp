import {
  Body,
  Controller,
  Get,
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
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
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
@UseGuards(JwtAuthGuard, SuperAdminGuard)
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
    private readonly personSigsH: ListPersonSignaturesHandler
  ) {}

  // ---- Documents ----
  @Get() list(@Query() q: ListDocumentsQueryDto): Promise<DocumentPageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") getOne(@Param("id") id: string): Promise<DocumentDto> {
    return this.getH.execute({ id });
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
  @Get(":id/versions") versions(
    @Param("id") documentId: string
  ): Promise<DocumentVersionDto[]> {
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
  byPerson(@Param("personId") personId: string): Promise<ConsentSignatureDto[]> {
    return this.personSigsH.execute({ personId });
  }
}
