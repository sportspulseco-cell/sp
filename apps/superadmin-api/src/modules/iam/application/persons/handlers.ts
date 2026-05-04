import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  PERSON_REPOSITORY,
  type PersonRepository
} from "../../domain/repositories/person.repository";
import { Person, PersonId } from "../../domain/entities/person.entity";
import { PersonDto, PersonPageDto } from "../dtos/person.dto";

export interface ListPersonsInput {
  limit?: number;
  cursor?: string;
  countryCode?: string;
  search?: string;
  hasUserAccount?: boolean;
}

@Injectable()
export class ListPersonsHandler
  implements QueryHandler<ListPersonsInput, PersonPageDto>
{
  constructor(@Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository) {}
  async execute(input: ListPersonsInput): Promise<PersonPageDto> {
    const page = await this.persons.list({
      ...input,
      limit: clampLimit(input.limit)
    });
    return {
      items: page.items.map(PersonDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetPersonHandler implements QueryHandler<{ id: string }, PersonDto> {
  constructor(@Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository) {}
  async execute(input: { id: string }): Promise<PersonDto> {
    const p = await this.persons.findById(PersonId.of(input.id));
    if (!p) throw new NotFoundError("Person", input.id);
    return PersonDto.fromDomain(p);
  }
}

export interface CreatePersonInput {
  legalFirstName: string;
  legalLastName: string;
  userId?: string | null;
  preferredName?: string | null;
  dobDate?: string | null;
  genderSelfId?: string | null;
  pronouns?: string | null;
  countryCode?: string | null;
  photoUrl?: string | null;
  externalIds?: Record<string, unknown>;
}

@Injectable()
export class CreatePersonHandler
  implements CommandHandler<CreatePersonInput, PersonDto>
{
  constructor(@Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository) {}
  async execute(input: CreatePersonInput): Promise<PersonDto> {
    const p = Person.create({
      id: PersonId.of(randomUUID()),
      ...input
    });
    await this.persons.insert(p);
    return PersonDto.fromDomain(p);
  }
}

export interface UpdatePersonInput {
  id: string;
  legalFirstName?: string;
  legalLastName?: string;
  preferredName?: string | null;
  dobDate?: string | null;
  genderSelfId?: string | null;
  pronouns?: string | null;
  countryCode?: string | null;
  photoUrl?: string | null;
}

@Injectable()
export class UpdatePersonHandler
  implements CommandHandler<UpdatePersonInput, PersonDto>
{
  constructor(@Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository) {}
  async execute(input: UpdatePersonInput): Promise<PersonDto> {
    const p = await this.persons.findById(PersonId.of(input.id));
    if (!p) throw new NotFoundError("Person", input.id);
    if (
      input.legalFirstName !== undefined ||
      input.legalLastName !== undefined ||
      input.preferredName !== undefined
    ) {
      p.rename(input.legalFirstName, input.legalLastName, input.preferredName);
    }
    p.setProfile({
      dobDate: input.dobDate,
      genderSelfId: input.genderSelfId,
      pronouns: input.pronouns,
      countryCode: input.countryCode,
      photoUrl: input.photoUrl
    });
    await this.persons.save(p);
    return PersonDto.fromDomain(p);
  }
}

@Injectable()
export class LinkPersonToUserHandler
  implements CommandHandler<{ id: string; userId: string }, PersonDto>
{
  constructor(@Inject(PERSON_REPOSITORY) private readonly persons: PersonRepository) {}
  async execute(input: { id: string; userId: string }): Promise<PersonDto> {
    const p = await this.persons.findById(PersonId.of(input.id));
    if (!p) throw new NotFoundError("Person", input.id);
    p.linkToUser(input.userId);
    await this.persons.save(p);
    return PersonDto.fromDomain(p);
  }
}
