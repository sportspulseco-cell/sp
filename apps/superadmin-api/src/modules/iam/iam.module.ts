import { Module } from "@nestjs/common";
import { IamController } from "./interface/iam.controller";
import { PersonsController } from "./interface/persons.controller";
import { RolesController } from "./interface/roles.controller";
import { GetCurrentUserHandler } from "./application/queries/get-current-user.query";
import { ListProfilesHandler } from "./application/queries/list-profiles.query";
import { SuspendProfileHandler } from "./application/commands/suspend-profile.command";
import { ReactivateProfileHandler } from "./application/commands/reactivate-profile.command";
import { UpdateProfileHandler } from "./application/commands/update-profile.command";
import { InviteUserHandler } from "./application/commands/invite-user.command";
import { InviteMessageService } from "./application/services/invite-message.service";
import { SetUserPasswordHandler } from "./application/commands/set-user-password.command";
import { SetRoleProfileHandler } from "./application/commands/set-role-profile.command";
import { GetRoleProfileHandler } from "./application/queries/get-role-profile.query";
import {
  CreatePersonHandler,
  GetPersonHandler,
  LinkPersonToUserHandler,
  ListPersonsHandler,
  UpdatePersonHandler
} from "./application/persons/handlers";
import {
  ActiveAssignmentsForUserHandler,
  AssignRoleHandler,
  CreateRoleHandler,
  DeleteRoleHandler,
  GetRoleHandler,
  ListAssignmentsHandler,
  ListRolesHandler,
  RevokeAssignmentHandler,
  UpdateRoleHandler
} from "./application/roles/handlers";
import { PROFILE_REPOSITORY } from "./domain/repositories/profile.repository";
import { PERSON_REPOSITORY } from "./domain/repositories/person.repository";
import { ROLE_REPOSITORY } from "./domain/repositories/role.repository";
import { DrizzleProfileRepository } from "./infrastructure/repositories/drizzle-profile.repository";
import { DrizzlePersonRepository } from "./infrastructure/repositories/drizzle-person.repository";
import { DrizzleRoleRepository } from "./infrastructure/repositories/drizzle-role.repository";

@Module({
  controllers: [IamController, PersonsController, RolesController],
  providers: [
    // Profile use cases
    GetCurrentUserHandler,
    ListProfilesHandler,
    SuspendProfileHandler,
    ReactivateProfileHandler,
    UpdateProfileHandler,
    InviteUserHandler,
    InviteMessageService,
    SetUserPasswordHandler,
    SetRoleProfileHandler,
    GetRoleProfileHandler,
    // Person use cases
    ListPersonsHandler,
    GetPersonHandler,
    CreatePersonHandler,
    UpdatePersonHandler,
    LinkPersonToUserHandler,
    // Role + assignment use cases
    ListRolesHandler,
    GetRoleHandler,
    CreateRoleHandler,
    UpdateRoleHandler,
    DeleteRoleHandler,
    ListAssignmentsHandler,
    AssignRoleHandler,
    RevokeAssignmentHandler,
    ActiveAssignmentsForUserHandler,
    // Repositories (DIP)
    { provide: PROFILE_REPOSITORY, useClass: DrizzleProfileRepository },
    { provide: PERSON_REPOSITORY, useClass: DrizzlePersonRepository },
    { provide: ROLE_REPOSITORY, useClass: DrizzleRoleRepository }
  ]
})
export class IamModule {}
