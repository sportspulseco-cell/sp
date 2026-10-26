import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  ExpressAdapter,
  type NestExpressApplication
} from "@nestjs/platform-express";
import { waitUntil } from "@vercel/functions";
import express from "express";
import type { Request, Response } from "express";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";
import { poolIdleTimeoutSeconds } from "../src/shared/database/database.module";

// Vercel serverless functions are invoked many times per "warm" instance.
// Cache the booted Nest app between invocations to avoid paying the bootstrap
// cost on every request. Stored at module scope so it survives across calls.
let cached: express.Express | null = null;
let bootPromise: Promise<express.Express> | null = null;

async function bootstrap(): Promise<express.Express> {
  const expressApp = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp),
    { logger: ["error", "warn"] }
  );
  await configureApp(app);
  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!cached) {
    if (!bootPromise) {
      bootPromise = bootstrap().catch((error) => {
        bootPromise = null;
        throw error;
      });
    }
    cached = await bootPromise;
  }
  // Fluid compute suspends an instance once its last response ends, and a
  // suspended or discarded instance keeps its pooler sockets open. Staging
  // measured 177 of Supavisor's 200 client slots held with no traffic, so
  // bursts failed with EMAXCONN. Stay awake until the pool idle timeout has
  // closed the connections this request used.
  waitUntil(
    new Promise<void>((resolve) =>
      res.once("close", () =>
        setTimeout(resolve, poolIdleTimeoutSeconds() * 1000 + 250)
      )
    )
  );
  return cached(req, res);
}
