import { Module } from "@nestjs/common";
import { ImportsController } from "./interface/imports.controller";
import { ImportService } from "./application/import.service";
import {
  ImporterRegistry,
  PersonsImporter,
  TeamsImporter
} from "./application/importers/importer";
import { IMPORT_REPOSITORY } from "./domain/repositories/import.repository";
import { DrizzleImportRepository } from "./infrastructure/repositories/drizzle-import.repository";

@Module({
  controllers: [ImportsController],
  providers: [
    ImportService,
    ImporterRegistry,
    PersonsImporter,
    TeamsImporter,
    { provide: IMPORT_REPOSITORY, useClass: DrizzleImportRepository }
  ]
})
export class DataMigrationModule {}
