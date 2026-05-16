import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../shared/auth/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../../shared/auth/guards/super-admin.guard";
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
    private readonly linkH: LinkPersonToUserHandler
  ) {}

  // GET endpoints are accessible to any authenticated user — captains
  // need to search persons to populate the "Add player" picker on
  // /captain/roster. Mutations remain super-admin-only (BUG-027).
  @Get() @ApiOperation({ summary: "List persons" })
  list(@Query() q: ListPersonsQueryDto): Promise<PersonPageDto> {
    return this.listH.execute(q);
  }
  @Get(":id") @ApiOperation({ summary: "Get a person" })
  getOne(@Param("id") id: string): Promise<PersonDto> {
    return this.getH.execute({ id });
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
