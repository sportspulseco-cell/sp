import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthPrincipal } from "@sportspulse/auth";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const req = ctx.switchToHttp().getRequest();
    return req.principal;
  }
);
