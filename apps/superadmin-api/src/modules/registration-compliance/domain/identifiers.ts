import { EntityId } from "@sportspulse/kernel";

export class RegistrationFormId extends EntityId<"RegistrationForm"> {
  static of(v: string): RegistrationFormId {
    return new RegistrationFormId(v);
  }
}
export class RegistrationFormVersionId extends EntityId<"RegistrationFormVersion"> {
  static of(v: string): RegistrationFormVersionId {
    return new RegistrationFormVersionId(v);
  }
}
export class RegistrationId extends EntityId<"Registration"> {
  static of(v: string): RegistrationId {
    return new RegistrationId(v);
  }
}
export class DocumentId extends EntityId<"Document"> {
  static of(v: string): DocumentId {
    return new DocumentId(v);
  }
}
export class DocumentVersionId extends EntityId<"DocumentVersion"> {
  static of(v: string): DocumentVersionId {
    return new DocumentVersionId(v);
  }
}
export class ConsentSignatureId extends EntityId<"ConsentSignature"> {
  static of(v: string): ConsentSignatureId {
    return new ConsentSignatureId(v);
  }
}
export class EligibilityRecordId extends EntityId<"EligibilityRecord"> {
  static of(v: string): EligibilityRecordId {
    return new EligibilityRecordId(v);
  }
}
export class BackgroundCheckId extends EntityId<"BackgroundCheck"> {
  static of(v: string): BackgroundCheckId {
    return new BackgroundCheckId(v);
  }
}
export class IdentityVerificationId extends EntityId<"IdentityVerification"> {
  static of(v: string): IdentityVerificationId {
    return new IdentityVerificationId(v);
  }
}
