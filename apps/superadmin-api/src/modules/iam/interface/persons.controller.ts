import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
import { CurrentUser } from "../../../shared/auth/decorators/current-user.decorator";
import { userIsPeopleAdmin } from "../../../shared/auth/org-admin";
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
    const page = await this.listH.execute(q);
    if (await userIsPeopleAdmin(this.db, user.userId)) return page;
    return { ...page, items: page.items.map(redactPerson) };
  }
  @Get(":id") @ApiOperation({ summary: "Get a person (personal details for admins only)" })
  async getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthPrincipal
  ): Promise<PersonDto> {
    const person = await this.getH.execute({ id });
    if (await userIsPeopleAdmin(this.db, user.userId)) return person;
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
