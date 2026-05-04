import { ValueObject } from "@sportspulse/kernel";
import { DomainError } from "@sportspulse/kernel";

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private static readonly RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(props: EmailProps) {
    super(props);
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (!Email.RX.test(value)) {
      throw new DomainError("INVALID_EMAIL", `Invalid email: ${raw}`);
    }
    return new Email({ value });
  }

  get value(): string {
    return this.props.value;
  }

  override toString(): string {
    return this.props.value;
  }
}
