// Layered error taxonomy. Domain errors describe rule violations; application
// errors describe orchestration failures; infra errors describe adapter issues.

export abstract class BaseError extends Error {
  abstract readonly code: string;
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.cause = cause;
  }
}

export class DomainError extends BaseError {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause);
    this.code = code;
  }
}

export class ApplicationError extends BaseError {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause);
    this.code = code;
  }
}

export class InfrastructureError extends BaseError {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, cause);
    this.code = code;
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} not found: ${id}`);
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message = "Unauthorized") {
    super("UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message = "Forbidden") {
    super("FORBIDDEN", message);
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, public readonly issues?: unknown) {
    super("VALIDATION", message);
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super("CONFLICT", message);
  }
}
