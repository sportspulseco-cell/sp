import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { SupabaseJwtVerifier } from "@sportspulse/auth";
import { JWT_VERIFIER } from "../auth.tokens";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JWT_VERIFIER) private readonly verifier: SupabaseJwtVerifier) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    try {
      req.principal = await this.verifier.verify(header.slice("Bearer ".length));
      return true;
    } catch (err) {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
