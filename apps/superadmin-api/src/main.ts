import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, type NextFunction, type Request, type Response } from "express";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./shared/filters/domain-exception.filter";

/**
 * Configures pipes, filters, CORS, prefix, and Swagger on a Nest app.
 * Shared between the local-dev `bootstrap()` (which then `listen()`s) and
 * the Vercel serverless handler (which calls `app.init()`).
 */
export async function configureApp(app: INestApplication): Promise<void> {
  // Compliance document uploads (COMP-3) carry a base64 file: 3 MiB
  // decoded, about 4.2 MB encoded. Only that path gets the larger JSON
  // limit; every other route keeps the default 100 kB. Registered before
  // Nest's own parsers (they are added at init), and the wrapper has its
  // own name so Nest still registers the default `jsonParser` for
  // everything else; the default then skips bodies already parsed here.
  const complianceUploadJson = json({ limit: "4500kb" });
  app.use(
    "/api/compliance/self/documents/uploads",
    function complianceUploadJsonParser(req: Request, res: Response, next: NextFunction) {
      complianceUploadJson(req, res, next);
    }
  );

  // UC-19 announcement attachments: same 3 MiB file, same larger limit.
  app.use(
    "/api/org-admin/broadcast/attachments",
    function broadcastAttachmentJsonParser(req: Request, res: Response, next: NextFunction) {
      complianceUploadJson(req, res, next);
    }
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim()),
    credentials: true
  });
  app.setGlobalPrefix("api");

  if (process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true") {
    const swagger = new DocumentBuilder()
      .setTitle("SportsPulse — Super Admin API")
      .setVersion("0.0.1")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await configureApp(app);
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  Logger.log(`API listening on http://localhost:${port}/api`, "Bootstrap");
}

// Only run the listen() bootstrap when invoked directly (local dev,
// `node dist/main.js`). Skipped when imported by the Vercel handler.
if (require.main === module) {
  bootstrap();
}
