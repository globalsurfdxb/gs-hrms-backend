import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { configureApp } from '../core/http/configure-app.js';
import { buildOpenApiDocument } from '../core/http/swagger.js';

/* `npm run openapi:export` → docs/api/openapi.json. CI regenerates it and fails if the committed file differs,
   so the published contract can never drift from the code. No database connection is needed. */
const app = await NestFactory.create(AppModule, { logger: ['error'] });
configureApp(app);
await app.init();
writeFileSync('docs/api/openapi.json', `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
await app.close();
