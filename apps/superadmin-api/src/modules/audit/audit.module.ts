import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditController } from "./interface/audit.controller";
import { AuditInterceptor } from "./interface/audit.interceptor";
import { AuditWriterService } from "./application/audit-writer.service";
import {
  AuditFacetsHandler,
  GetAuditEventHandler,
  ListAuditEventsHandler
} from "./application/handlers/queries";
import { AUDIT_REPOSITORY } from "./domain/repositories/audit.repository";
import { DrizzleAuditRepository } from "./infrastructure/repositories/drizzle-audit.repository";

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    ListAuditEventsHandler,
    GetAuditEventHandler,
    AuditFacetsHandler,
    AuditWriterService,
    { provide: AUDIT_REPOSITORY, useClass: DrizzleAuditRepository },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ],
  exports: [AuditWriterService]
})
export class AuditModule {}
