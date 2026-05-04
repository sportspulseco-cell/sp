import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import {
  BaseError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError
} from "@sportspulse/kernel";

// Maps domain/application errors to HTTP responses without leaking internals.
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    const { status, code, message } = this.mapException(exception);

    if (status >= 500) {
      this.logger.error(message, (exception as Error)?.stack);
    }

    res.status(status).send({ error: { code, message } });
  }

  private mapException(exception: unknown): {
    status: number;
    code: string;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === "string"
          ? response
          : (response as { message?: string }).message ?? exception.message;
      return {
        status: exception.getStatus(),
        code: exception.name.replace(/Exception$/, "").toUpperCase(),
        message: Array.isArray(message) ? message.join("; ") : message
      };
    }
    if (exception instanceof NotFoundError) {
      return { status: HttpStatus.NOT_FOUND, code: exception.code, message: exception.message };
    }
    if (exception instanceof UnauthorizedError) {
      return { status: HttpStatus.UNAUTHORIZED, code: exception.code, message: exception.message };
    }
    if (exception instanceof ForbiddenError) {
      return { status: HttpStatus.FORBIDDEN, code: exception.code, message: exception.message };
    }
    if (exception instanceof ConflictError) {
      return { status: HttpStatus.CONFLICT, code: exception.code, message: exception.message };
    }
    if (exception instanceof ValidationError) {
      return { status: HttpStatus.BAD_REQUEST, code: exception.code, message: exception.message };
    }
    if (exception instanceof DomainError) {
      return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: exception.code, message: exception.message };
    }
    if (exception instanceof BaseError) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: exception.code, message: exception.message };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred"
    };
  }
}
