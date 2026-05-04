import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  ConflictError,
  NotFoundError,
  type CommandHandler,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  ORG_REPOSITORY,
  type OrgRepository
} from "../../domain/repositories/org.repository";
import { OrgId } from "../../domain/identifiers";
import { Org } from "../../domain/entities/org.entity";
import {
  type OrgType,
  assertOrgStatus,
  assertOrgType
} from "../../domain/value-objects/org-status.vo";
import { OrgDto, OrgPageDto } from "../dtos/org.dto";

export interface ListOrgsInput {
  limit?: number;
  cursor?: string;
  status?: string;
  countryCode?: string;
  orgType?: string;
  search?: string;
}

@Injectable()
export class ListOrgsHandler
  implements QueryHandler<ListOrgsInput, OrgPageDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: ListOrgsInput): Promise<OrgPageDto> {
    const page = await this.orgs.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      status: input.status,
      countryCode: input.countryCode,
      orgType: input.orgType,
      search: input.search
    });
    return {
      items: page.items.map(OrgDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetOrgHandler implements QueryHandler<{ id: string }, OrgDto> {
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: { id: string }): Promise<OrgDto> {
    const org = await this.orgs.findById(OrgId.of(input.id));
    if (!org) throw new NotFoundError("Org", input.id);
    return OrgDto.fromDomain(org);
  }
}

export interface CreateOrgInput {
  slug: string;
  legalName: string;
  displayName: string;
  orgType: OrgType;
  countryCode: string;
  defaultLocale: string;
  defaultCurrency: string;
  defaultTimezone?: string;
}

@Injectable()
export class CreateOrgHandler
  implements CommandHandler<CreateOrgInput, OrgDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: CreateOrgInput): Promise<OrgDto> {
    const existing = await this.orgs.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`Org slug already taken: ${input.slug}`);
    }
    const org = Org.create({
      id: OrgId.of(randomUUID()),
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
      orgType: assertOrgType(input.orgType),
      countryCode: input.countryCode,
      defaultLocale: input.defaultLocale,
      defaultCurrency: input.defaultCurrency,
      defaultTimezone: input.defaultTimezone
    });
    await this.orgs.insert(org);
    return OrgDto.fromDomain(org);
  }
}

export interface UpdateOrgInput {
  id: string;
  legalName?: string;
  displayName?: string;
  countryCode?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  defaultTimezone?: string;
  branding?: Record<string, unknown>;
}

@Injectable()
export class UpdateOrgHandler
  implements CommandHandler<UpdateOrgInput, OrgDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: UpdateOrgInput): Promise<OrgDto> {
    const org = await this.orgs.findById(OrgId.of(input.id));
    if (!org) throw new NotFoundError("Org", input.id);
    if (input.legalName !== undefined || input.displayName !== undefined) {
      org.rename(input.legalName, input.displayName);
    }
    if (input.countryCode !== undefined) org.setCountry(input.countryCode);
    if (input.defaultLocale !== undefined) org.setLocale(input.defaultLocale);
    if (input.defaultCurrency !== undefined) org.setCurrency(input.defaultCurrency);
    if (input.defaultTimezone !== undefined) org.setTimezone(input.defaultTimezone);
    if (input.branding !== undefined) org.setBranding(input.branding);
    await this.orgs.save(org);
    return OrgDto.fromDomain(org);
  }
}

@Injectable()
export class SuspendOrgHandler
  implements CommandHandler<{ id: string }, OrgDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: { id: string }): Promise<OrgDto> {
    const org = await this.orgs.findById(OrgId.of(input.id));
    if (!org) throw new NotFoundError("Org", input.id);
    org.suspend();
    await this.orgs.save(org);
    return OrgDto.fromDomain(org);
  }
}

@Injectable()
export class ReactivateOrgHandler
  implements CommandHandler<{ id: string }, OrgDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: { id: string }): Promise<OrgDto> {
    const org = await this.orgs.findById(OrgId.of(input.id));
    if (!org) throw new NotFoundError("Org", input.id);
    org.reactivate();
    await this.orgs.save(org);
    return OrgDto.fromDomain(org);
  }
}

@Injectable()
export class ArchiveOrgHandler
  implements CommandHandler<{ id: string }, OrgDto>
{
  constructor(@Inject(ORG_REPOSITORY) private readonly orgs: OrgRepository) {}
  async execute(input: { id: string }): Promise<OrgDto> {
    const org = await this.orgs.findById(OrgId.of(input.id));
    if (!org) throw new NotFoundError("Org", input.id);
    org.archive();
    await this.orgs.save(org);
    return OrgDto.fromDomain(org);
  }
}
