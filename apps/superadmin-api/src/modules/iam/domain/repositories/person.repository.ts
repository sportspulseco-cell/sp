import type { Page, PageQuery } from "@sportspulse/kernel";
import type { Person, PersonId } from "../entities/person.entity";

export interface ListPersonsQuery extends PageQuery {
  countryCode?: string;
  search?: string;
  hasUserAccount?: boolean;
}

export interface PersonRepository {
  findById(id: PersonId): Promise<Person | null>;
  list(q: ListPersonsQuery): Promise<Page<Person>>;
  insert(person: Person): Promise<void>;
  save(person: Person): Promise<void>;
}

export const PERSON_REPOSITORY = Symbol("PERSON_REPOSITORY");
