import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseJwtVerifier } from "@sportspulse/auth";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { SuperAdminGuard } from "./guards/super-admin.guard";
import { RolesGuard } from "./guards/roles.guard";
import { AuthorizedAccessGuard } from "./guards/authorized-access.guard";
import { JWT_VERIFIER } from "./auth.tokens";

export { JWT_VERIFIER };

@Global()
@Module({
  providers: [
    {
      provide: JWT_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const supabaseUrl = config.getOrThrow<string>("SUPABASE_URL");
        const jwksUrl =
          config.get<string>("SUPABASE_JWKS_URL") ??
          `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/.well-known/jwks.json`;
        return new SupabaseJwtVerifier({
          jwksUrl,
          // Optional fallback for legacy HS256 tokens during migration
          jwtSecret: config.get<string>("SUPABASE_JWT_SECRET"),
          audience: config.get<string>("SUPABASE_JWT_AUDIENCE") ?? "authenticated"
        });
      }
    },
    JwtAuthGuard,
    SuperAdminGuard,
    RolesGuard,
    AuthorizedAccessGuard
  ],
  exports: [
    JWT_VERIFIER,
    JwtAuthGuard,
    SuperAdminGuard,
    RolesGuard,
    AuthorizedAccessGuard
  ]
})
export class AuthModule {}
