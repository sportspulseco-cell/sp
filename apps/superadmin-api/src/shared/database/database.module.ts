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
        return createDb({ url, prepare: false });
      }
    }
  ],
  exports: [DRIZZLE]
})
export class DatabaseModule {}
