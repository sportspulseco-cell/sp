import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb } from "@sportspulse/db";
import { DRIZZLE } from "./database.tokens";

export { DRIZZLE };

/**
 * Seconds an unused pooled connection stays open. api/index.ts keeps the
 * Vercel instance awake this long after each response, so the close runs
 * before the instance is suspended.
 */
export function poolIdleTimeoutSeconds(): number {
  return Number(process.env.DATABASE_IDLE_TIMEOUT_S ?? 2);
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>("DATABASE_POOL_URL");
        // Every serverless instance holds its own pool, and all of them
        // share the Supavisor client cap (200 on staging). 10 per instance
        // kept 20s after use hit EMAXCONN under bursts, failing every route.
        return createDb({
          url,
          prepare: false,
          max: Number(config.get("DATABASE_POOL_MAX") ?? 4),
          idleTimeout: poolIdleTimeoutSeconds()
        });
      }
    }
  ],
  exports: [DRIZZLE]
})
export class DatabaseModule {}
