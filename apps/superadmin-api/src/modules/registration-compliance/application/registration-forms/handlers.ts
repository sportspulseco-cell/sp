import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  clampLimit,
  NotFoundError,
  type CommandHandler,
  type FormPurpose,
  type QueryHandler
} from "@sportspulse/kernel";
import {
  REGISTRATION_FORM_REPOSITORY,
  type RegistrationFormRepository
} from "../../domain/repositories/registration-form.repository";
import {
  RegistrationFormId,
  RegistrationFormVersionId
} from "../../domain/identifiers";
import {
  RegistrationForm,
  type FormScope
} from "../../domain/entities/registration-form.entity";
import {
  FormVersionDto,
  RegistrationFormDto,
  RegistrationFormPageDto
} from "../dtos/registration.dto";

export interface ListFormsInput {
  limit?: number;
  cursor?: string;
  orgId?: string;
  scope?: string;
  scopeId?: string;
  purpose?: FormPurpose;
  role?: string;
  search?: string;
}

@Injectable()
export class ListFormsHandler
  implements QueryHandler<ListFormsInput, RegistrationFormPageDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: ListFormsInput): Promise<RegistrationFormPageDto> {
    const page = await this.forms.list({
      limit: clampLimit(input.limit),
      cursor: input.cursor,
      orgId: input.orgId,
      scope: input.scope,
      scopeId: input.scopeId,
      purpose: input.purpose,
      role: input.role,
      search: input.search
    });
    return {
      items: page.items.map(RegistrationFormDto.fromDomain),
      nextCursor: page.nextCursor
    };
  }
}

@Injectable()
export class GetFormHandler
  implements QueryHandler<{ id: string }, RegistrationFormDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: { id: string }): Promise<RegistrationFormDto> {
    const f = await this.forms.findById(RegistrationFormId.of(input.id));
    if (!f) throw new NotFoundError("RegistrationForm", input.id);
    return RegistrationFormDto.fromDomain(f);
  }
}

export interface CreateFormInput {
  orgId: string;
  scope: FormScope;
  scopeId?: string | null;
  name: string;
  description?: string | null;
  purpose?: FormPurpose;
  appliesToRoles?: string[];
}

@Injectable()
export class CreateFormHandler
  implements CommandHandler<CreateFormInput, RegistrationFormDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: CreateFormInput): Promise<RegistrationFormDto> {
    const form = RegistrationForm.create({
      id: RegistrationFormId.of(randomUUID()),
      orgId: input.orgId,
      scope: input.scope,
      scopeId: input.scopeId,
      name: input.name,
      description: input.description,
      purpose: input.purpose,
      appliesToRoles: input.appliesToRoles
    });
    await this.forms.insert(form);
    return RegistrationFormDto.fromDomain(form);
  }
}

export interface UpdateFormInput {
  id: string;
  name?: string;
  description?: string | null;
  purpose?: FormPurpose;
  appliesToRoles?: string[];
}

@Injectable()
export class UpdateFormHandler
  implements CommandHandler<UpdateFormInput, RegistrationFormDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: UpdateFormInput): Promise<RegistrationFormDto> {
    const form = await this.forms.findById(RegistrationFormId.of(input.id));
    if (!form) throw new NotFoundError("RegistrationForm", input.id);
    if (input.name !== undefined) form.rename(input.name, input.description);
    if (input.purpose !== undefined) form.setPurpose(input.purpose);
    if (input.appliesToRoles !== undefined)
      form.setAppliesToRoles(input.appliesToRoles);
    await this.forms.save(form);
    return RegistrationFormDto.fromDomain(form);
  }
}

// ---- Versions ----

export interface CreateFormVersionInput {
  formId: string;
  schema: Record<string, unknown>;
}

@Injectable()
export class CreateFormVersionHandler
  implements CommandHandler<CreateFormVersionInput, FormVersionDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: CreateFormVersionInput): Promise<FormVersionDto> {
    const formId = RegistrationFormId.of(input.formId);
    const form = await this.forms.findById(formId);
    if (!form) throw new NotFoundError("RegistrationForm", input.formId);
    const version = await this.forms.nextVersionNumber(formId);
    const row = {
      id: randomUUID(),
      formId: input.formId,
      versionNumber: version,
      schema: input.schema,
      publishedAt: null,
      locked: false,
      createdAt: new Date()
    };
    await this.forms.insertVersion(row);
    return FormVersionDto.fromRow(row);
  }
}

export interface PublishFormVersionInput {
  formId: string;
  versionId: string;
}

@Injectable()
export class PublishFormVersionHandler
  implements CommandHandler<PublishFormVersionInput, RegistrationFormDto>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: PublishFormVersionInput): Promise<RegistrationFormDto> {
    const formId = RegistrationFormId.of(input.formId);
    const versionId = RegistrationFormVersionId.of(input.versionId);
    const form = await this.forms.findById(formId);
    if (!form) throw new NotFoundError("RegistrationForm", input.formId);
    const version = await this.forms.findVersion(versionId);
    if (!version || version.formId !== input.formId) {
      throw new NotFoundError("FormVersion", input.versionId);
    }
    await this.forms.publishVersion(versionId);
    form.setActiveVersion(input.versionId);
    await this.forms.save(form);
    return RegistrationFormDto.fromDomain(form);
  }
}

@Injectable()
export class ListFormVersionsHandler
  implements QueryHandler<{ formId: string }, FormVersionDto[]>
{
  constructor(
    @Inject(REGISTRATION_FORM_REPOSITORY)
    private readonly forms: RegistrationFormRepository
  ) {}
  async execute(input: { formId: string }): Promise<FormVersionDto[]> {
    const rows = await this.forms.listVersions(
      RegistrationFormId.of(input.formId)
    );
    return rows.map(FormVersionDto.fromRow);
  }
}
