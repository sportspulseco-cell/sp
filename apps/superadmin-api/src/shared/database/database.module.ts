import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDb } from "@sportspulse/db";
import { DRIZZLE } from "./database.tokens";

export { DRIZZLE };

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
          idleTimeout: Number(config.get("DATABASE_IDLE_TIMEOUT_S") ?? 5)
        });
      }
    }
  ],
  exports: [DRIZZLE]
})
export class DatabaseModule {}
