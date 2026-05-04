import { Module } from "@nestjs/common";

import { OrgsController } from "./interface/orgs.controller";
import { OrgRelationsController } from "./interface/org-relations.controller";
import { CrossOrgGrantsController } from "./interface/cross-org-grants.controller";

import {
  ListOrgsHandler,
  GetOrgHandler,
  CreateOrgHandler,
  UpdateOrgHandler,
  SuspendOrgHandler,
  ReactivateOrgHandler,
  ArchiveOrgHandler
} from "./application/orgs/handlers";
import {
  LinkOrgsHandler,
  UnlinkOrgsHandler,
  ListOrgChildrenHandler,
  ListOrgParentsHandler
} from "./application/org-relations/handlers";
import {
  IssueCrossOrgGrantHandler,
  RevokeCrossOrgGrantHandler,
  ListGrantsByUserHandler,
  ListGrantsByOrgHandler
} from "./application/cross-org-grants/handlers";

import { ORG_REPOSITORY } from "./domain/repositories/org.repository";
import { ORG_RELATION_REPOSITORY } from "./domain/repositories/org-relation.repository";
import { CROSS_ORG_GRANT_REPOSITORY } from "./domain/repositories/cross-org-grant.repository";

import { DrizzleOrgRepository } from "./infrastructure/repositories/drizzle-org.repository";
import { DrizzleOrgRelationRepository } from "./infrastructure/repositories/drizzle-org-relation.repository";
import { DrizzleCrossOrgGrantRepository } from "./infrastructure/repositories/drizzle-cross-org-grant.repository";

@Module({
  controllers: [
    OrgsController,
    OrgRelationsController,
    CrossOrgGrantsController
  ],
  providers: [
    ListOrgsHandler,
    GetOrgHandler,
    CreateOrgHandler,
    UpdateOrgHandler,
    SuspendOrgHandler,
    ReactivateOrgHandler,
    ArchiveOrgHandler,
    LinkOrgsHandler,
    UnlinkOrgsHandler,
    ListOrgChildrenHandler,
    ListOrgParentsHandler,
    IssueCrossOrgGrantHandler,
    RevokeCrossOrgGrantHandler,
    ListGrantsByUserHandler,
    ListGrantsByOrgHandler,

    { provide: ORG_REPOSITORY, useClass: DrizzleOrgRepository },
    { provide: ORG_RELATION_REPOSITORY, useClass: DrizzleOrgRelationRepository },
    {
      provide: CROSS_ORG_GRANT_REPOSITORY,
      useClass: DrizzleCrossOrgGrantRepository
    }
  ]
})
export class OrgManagementModule {}
