import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  NotFoundException
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsPeopleAdmin } from "../../../shared/auth/org-admin";
import { sql } from "drizzle-orm";
import { loadAdminScope, loadUserScope } from "../../../shared/auth/scope";
import { personVisible, visiblePersonIds } from "../../../shared/auth/visibility";
import { DRIZZLE } from "../../../shared/database/database.tokens";
import type { Database } from "@sportspulse/db";
import type { AuthPrincipal } from "@sportspulse/auth";
import { PersonDto, PersonPageDto } from "../application/dtos/person.dto";
import {
  CreatePersonHandler,
  GetPersonHandler,
  LinkPersonToUserHandler,
  ListPersonsHandler,
  UpdatePersonHandler
} from "../application/persons/handlers";
import {
  CreatePersonBodyDto,
  LinkPersonUserBodyDto,
  ListPersonsQueryDto,
  UpdatePersonBodyDto
} from "./dto/person.dto";

@ApiTags("iam/persons")
@ApiBearerAuth()
@Controller("iam/persons")
@UseGuards(JwtAuthGuard)
export class PersonsController {
  constructor(
    private readonly listH: ListPersonsHandler,
    private readonly getH: GetPersonHandler,
    private readonly createH: CreatePersonHandler,
    private readonly updateH: UpdatePersonHandler,
    private readonly linkH: LinkPersonToUserHandler,
    @Inject(DRIZZLE) private readonly db: Database
  ) {}

  // GET endpoints are open to any signed-in user because captains search
  // people for the "Add player" picker and players resolve teammates'
  // names. Non-admins get names and photo only; DOB, gender, account
  // link and external ids are admin-only (CAP-11). Mutations remain
  // super-admin-only (BUG-027).
  @Get() @ApiOperation({ summary: "List persons (personal details for admins only)" })
  async list(
    @Query() q: ListPersonsQueryDto,
    @CurrentUser() user: AuthPrincipal
  ): Promise<PersonPageDto> {
    // Everyone but super admins searches only the people inside their
    // scope; personal details stay admin-only on top of that (CAP-11).
    const scope = await loadUserScope(this.db, user.userId);
    const page = await this.listH.execute({
      ...q,
      visibleTo: scope.isSuperAdmin ? undefined : { scope, userId: user.userId }
    });
    if (scope.isSuperAdmin) return page;
    // Personal details only for people inside the caller's ADMIN scope; a
    // roster spot elsewhere shows names only, like any teammate.
    const detailed = await this.adminVisibleIds(user.userId, page.items.map((p) => p.id));
    return { ...page, items: page.items.map((p) => (detailed.has(p.id) ? p : redactPerson(p))) };
  }
  @Get(":id") @ApiOperation({ summary: "Get a person (personal details for admins only)" })
  async getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<PersonDto> {
    const scope = await loadUserScope(this.db, user.userId);
    if (!scope.isSuperAdmin && !(await personVisible(this.db, { scope, userId: user.userId }, id))) {
      throw new NotFoundException("Person not found");
    }
    const person = await this.getH.execute({ id });
    if (scope.isSuperAdmin) return person;
    if ((await this.adminVisibleIds(user.userId, [id])).has(id)) return person;
    return redactPerson(person);
  }
  @Post() @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Create a person" })
  create(@Body() body: CreatePersonBodyDto): Promise<PersonDto> {
    return this.createH.execute(body);
  }
  @Patch(":id") @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Update a person" })
  update(
    @Param("id") id: string,
    @Body() body: UpdatePersonBodyDto
  ): Promise<PersonDto> {
    return this.updateH.execute({ id, ...body });
  }
  @Post(":id/link-user") @UseGuards(SuperAdminGuard)
  @ApiOperation({ summary: "Link a person to an auth user" })
  link(
    @Param("id") id: string,
    @Body() body: LinkPersonUserBodyDto
  ): Promise<PersonDto> {
    return this.linkH.execute({ id, userId: body.userId });
  }

  /** Ids (of `ids`) inside the caller's admin scope; empty for non-admins. */
  private async adminVisibleIds(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0 || !(await userIsPeopleAdmin(this.db, userId))) return new Set();
    const adminScope = await loadAdminScope(this.db, userId);
    const sub = visiblePersonIds({ scope: adminScope, userId });
    if (!sub) return new Set(ids);
    const rows = await this.db.execute(
      sql`select p.id from persons p where p.id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) and p.id in ${sub}`
    );
    const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{ id: string }>;
    return new Set(list.map((r) => r.id));
  }
}

function redactPerson(p: PersonDto): PersonDto {
  return {
    ...p,
    userId: null,
    dobDate: null,
    genderSelfId: null,
    pronouns: null,
    countryCode: null,
    externalIds: {}
  };
}
