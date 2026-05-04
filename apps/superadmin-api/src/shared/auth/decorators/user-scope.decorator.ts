import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { UserScope as UserScopeType } from "../scope";

export const UserScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserScopeType => {
    const req = ctx.switchToHttp().getRequest();
    return req.userScope;
  }
);
