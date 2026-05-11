import { Module } from "@nestjs/common";
import { CommunicationsModule } from "../communications/communications.module";
import { FinanceModule } from "../finance/finance.module";

import { RegistrationFormsController } from "./interface/registration-forms.controller";
import { RegistrationsController } from "./interface/registrations.controller";
import { EligibilityController } from "./interface/eligibility.controller";
import { ComplianceSweepsController } from "./interface/compliance-sweeps.controller";
import { DocumentsController } from "./interface/documents.controller";
import { SelfComplianceController } from "./interface/self-compliance.controller";
import { SelfRegistrationsController } from "./interface/self-registrations.controller";

import {
  ListFormsHandler,
  GetFormHandler,
  CreateFormHandler,
  UpdateFormHandler,
  CreateFormVersionHandler,
  PublishFormVersionHandler,
  ListFormVersionsHandler
} from "./application/registration-forms/handlers";
import {
  ListRegistrationsHandler,
  GetRegistrationHandler,
  CreateRegistrationHandler,
  SubmitRegistrationHandler,
  ReviewRegistrationHandler,
  WithdrawRegistrationHandler
} from "./application/registrations/handlers";
import {
  ListEligibilityHandler,
  GetEligibilityHandler,
  CreateEligibilityHandler,
  ReevaluateEligibilityHandler,
  WaiveEligibilityHandler
} from "./application/eligibility/handlers";
import {
  ListDocumentsHandler,
  GetDocumentHandler,
  CreateDocumentHandler,
  UpdateDocumentHandler,
  ListDocumentVersionsHandler,
  PublishDocumentVersionHandler,
  SignDocumentHandler,
  RevokeSignatureHandler,
  ListPersonSignaturesHandler
} from "./application/documents/handlers";

import { REGISTRATION_FORM_REPOSITORY } from "./domain/repositories/registration-form.repository";
import { REGISTRATION_REPOSITORY } from "./domain/repositories/registration.repository";
import { ELIGIBILITY_RECORD_REPOSITORY } from "./domain/repositories/eligibility-record.repository";
import { DOCUMENT_REPOSITORY } from "./domain/repositories/document.repository";

import { DrizzleRegistrationFormRepository } from "./infrastructure/repositories/drizzle-registration-form.repository";
import { DrizzleRegistrationRepository } from "./infrastructure/repositories/drizzle-registration.repository";
import { DrizzleEligibilityRecordRepository } from "./infrastructure/repositories/drizzle-eligibility-record.repository";
import { DrizzleDocumentRepository } from "./infrastructure/repositories/drizzle-document.repository";

@Module({
  imports: [CommunicationsModule, FinanceModule],
  controllers: [
    RegistrationFormsController,
    RegistrationsController,
    EligibilityController,
    ComplianceSweepsController,
    DocumentsController,
    SelfComplianceController,
    SelfRegistrationsController
  ],
  providers: [
    // Forms
    ListFormsHandler,
    GetFormHandler,
    CreateFormHandler,
    UpdateFormHandler,
    CreateFormVersionHandler,
    PublishFormVersionHandler,
    ListFormVersionsHandler,
    // Registrations
    ListRegistrationsHandler,
    GetRegistrationHandler,
    CreateRegistrationHandler,
    SubmitRegistrationHandler,
    ReviewRegistrationHandler,
    WithdrawRegistrationHandler,
    // Eligibility
    ListEligibilityHandler,
    GetEligibilityHandler,
    CreateEligibilityHandler,
    ReevaluateEligibilityHandler,
    WaiveEligibilityHandler,
    // Documents + signatures
    ListDocumentsHandler,
    GetDocumentHandler,
    CreateDocumentHandler,
    UpdateDocumentHandler,
    ListDocumentVersionsHandler,
    PublishDocumentVersionHandler,
    SignDocumentHandler,
    RevokeSignatureHandler,
    ListPersonSignaturesHandler,

    {
      provide: REGISTRATION_FORM_REPOSITORY,
      useClass: DrizzleRegistrationFormRepository
    },
    {
      provide: REGISTRATION_REPOSITORY,
      useClass: DrizzleRegistrationRepository
    },
    {
      provide: ELIGIBILITY_RECORD_REPOSITORY,
      useClass: DrizzleEligibilityRecordRepository
    },
    {
      provide: DOCUMENT_REPOSITORY,
      useClass: DrizzleDocumentRepository
    }
  ]
})
export class RegistrationComplianceModule {}
