import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import {
  LICENCE_CHECK_METHODS,
  type LicenceCheckMethod,
  COMPLIANCE_DECISION_REASON_MAX,
  COMPLIANCE_DOCUMENT_DECISIONS,
  COMPLIANCE_DOCUMENT_STATUSES,
  type ComplianceDocumentDecision,
  type ComplianceDocumentStatus
} from "@sportspulse/kernel";
import type { AuthPrincipal } from "@sportspulse/auth";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { ScopedAdminGuard } from "../../../shared/auth/guards/scoped-admin.guard";
import { AllowScopedWrite } from "../../../shared/auth/decorators/allow-scoped-write.decorator";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { UserScope } from "../../../shared/auth/decorators/user-scope.decorator";
import type { UserScope as UserScopeType } from "../../../shared/auth/scope";
import {
  ComplianceDocumentSubmissionsService,
  type AdminComplianceDocumentDto
} from "../application/document-submissions/document-submissions.service";

class ListDocumentSubmissionsQueryDto {
  @IsOptional()
  @IsIn([...COMPLIANCE_DOCUMENT_STATUSES])
  status?: ComplianceDocumentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

class LicenceCheckBodyDto {
  /** The text the browser decoded from the licence's PDF417 barcode. Parsed on the server, never stored. */
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  barcodeText!: string;

  @IsIn([...LICENCE_CHECK_METHODS])
  method!: LicenceCheckMethod;
}

class DecideDocumentSubmissionBodyDto {
  @IsIn([...COMPLIANCE_DOCUMENT_DECISIONS])
  decision!: ComplianceDocumentDecision;

  /** Required for rejected / resubmit_requested (checked in the kernel rule). */
  @IsOptional()
  @IsString()
  @MaxLength(COMPLIANCE_DECISION_REASON_MAX)
  reason?: string | null;
}

/**
 * Admin review of player-uploaded ID and eligibility documents (COMP-1,
 * UC-29). Super admins see everything; org / league / season / division
 * admins and registrars see submissions inside their scope
 * (visibleComplianceSubmissionsWhere) and get 404 outside it. The
 * player-side routes (upload, own list, own file) live on
 * SelfComplianceController under /compliance/self/documents/uploads.
 */
@ApiTags("compliance/document-submissions")
@ApiBearerAuth()
@Controller("compliance/document-submissions")
@UseGuards(JwtAuthGuard, ScopedAdminGuard)
export class DocumentSubmissionsController {
  constructor(private readonly documents: ComplianceDocumentSubmissionsService) {}

  @Get()
  @ApiOperation({
    summary:
      "Review queue of uploaded ID / eligibility documents in the caller's scope, newest first. ?status=pending for the open queue. Returns per-status counts for the same scope."
  })
  list(@Query() q: ListDocumentSubmissionsQueryDto, @UserScope() scope: UserScopeType) {
    return this.documents.listForAdmin(scope, q);
  }

  @Get(":id")
  @ApiOperation({ summary: "One submission with DOB, division rules and the decision log. 404 outside scope." })
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UserScope() scope: UserScopeType
  ): Promise<AdminComplianceDocumentDto> {
    return this.documents.getForAdmin(scope, id);
  }

  @Post(":id/decision")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "Approve, reject (reason required) or request a new upload (reason required). One transaction: row lock, append-only decision row, status. Notifies the player (or guardian) and the team captain. Same decision + reason again is a no-op (alreadyDecided: true)."
  })
  async decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: DecideDocumentSubmissionBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() principal: AuthPrincipal
  ) {
    const result = await this.documents.decide({
      scope,
      actorUserId: principal.userId,
      id,
      decision: body.decision,
      reason: body.reason ?? null
    });
    // `id` and `orgId` at the top level so the audit interceptor files
    // the event under this document and its organisation.
    return {
      id: result.submission.id,
      orgId: result.submission.orgId,
      status: result.submission.status,
      alreadyDecided: result.alreadyDecided,
      notified: result.notified,
      submission: result.submission
    };
  }

  @Post(":id/licence-check")
  @AllowScopedWrite()
  @ApiOperation({
    summary:
      "UC-29: record a driver's licence barcode check on a government ID submission. The server parses the AAMVA text, compares name, DOB and expiry with the person on file and stores an evidence row (last 4 + keyed hash of the number, never the number). 404 outside scope. The admin still decides through /decision."
  })
  async licenceCheck(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: LicenceCheckBodyDto,
    @UserScope() scope: UserScopeType,
    @CurrentUser() principal: AuthPrincipal
  ) {
    const res = await this.documents.recordLicenceCheck({
      scope,
      actorUserId: principal.userId,
      id,
      barcodeText: body.barcodeText,
      method: body.method
    });
    const submission = await this.documents.getForAdmin(scope, id);
    // `id` and `orgId` at the top level for the audit interceptor. The
    // interceptor stores this response, so it carries no card name, DOB
    // or number: the browser shows those from its own decode.
    return { id, orgId: submission.orgId, check: res.check, submission };
  }

  @Get(":id/file")
  @ApiOperation({
    summary:
      "A 5-minute signed URL for the file, for an admin whose scope covers it. Every call is written to the audit log. Owners use /compliance/self/documents/uploads/:id/file."
  })
  file(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UserScope() scope: UserScopeType,
    @CurrentUser() principal: AuthPrincipal
  ) {
    return this.documents.fileUrlForAdmin(scope, principal.userId, id);
  }
}
