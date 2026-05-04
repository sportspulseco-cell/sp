import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  ExpressAdapter,
  type NestExpressApplication
} from "@nestjs/platform-express";
import express from "express";
import type { Request, Response } from "express";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/main";

// Vercel serverless functions are invoked many times per "warm" instance.
// Cache the booted Nest app between invocations to avoid paying the bootstrap
// cost on every request. Stored at module scope so it survives across calls.
let cached: express.Express | null = null;
let bootPromise: Promise<express.Express> | null = null;

async function bootstrap(): Promise<express.Express> {
  const expressApp = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp)
  );
  await configureApp(app);
  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!cached) {
    if (!bootPromise) bootPromise = bootstrap();
    cached = await bootPromise;
  }
  return cached(req, res);
}
