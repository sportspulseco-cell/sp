import type { FormPurpose, Page, PageQuery } from "@sportspulse/kernel";
import type { RegistrationForm } from "../entities/registration-form.entity";
import { RegistrationFormId, RegistrationFormVersionId } from "../identifiers";

export interface ListRegistrationFormsQuery extends PageQuery {
  orgId?: string;
  scope?: string;
  scopeId?: string;
  /** Optional filter — narrow listing to a single form purpose. */
  purpose?: FormPurpose;
  /**
   * Optional filter — return forms whose appliesToRoles array contains
   * this role code (or forms with an empty appliesToRoles list, which
   * means "applies to all roles in scope").
   */
  role?: string;
  search?: string;
}

export interface FormVersionRow {
  id: string;
  formId: string;
  versionNumber: number;
  schema: Record<string, unknown>;
  publishedAt: Date | null;
  locked: boolean;
  createdAt: Date;
}

export interface RegistrationFormRepository {
  findById(id: RegistrationFormId): Promise<RegistrationForm | null>;
  list(q: ListRegistrationFormsQuery): Promise<Page<RegistrationForm>>;
  insert(form: RegistrationForm): Promise<void>;
  save(form: RegistrationForm): Promise<void>;

  // Versions
  findVersion(id: RegistrationFormVersionId): Promise<FormVersionRow | null>;
  listVersions(formId: RegistrationFormId): Promise<FormVersionRow[]>;
  insertVersion(row: FormVersionRow): Promise<void>;
  publishVersion(id: RegistrationFormVersionId): Promise<void>;
  nextVersionNumber(formId: RegistrationFormId): Promise<number>;
}

export const REGISTRATION_FORM_REPOSITORY = Symbol(
  "REGISTRATION_FORM_REPOSITORY"
);
