import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from '../../config/env.js';
import { AllExceptionsFilter } from '../../shared/errors/all-exceptions.filter.js';

export const API_PREFIX = 'api';

/* HTTP hardening shared by main.ts, the OpenAPI export and e2e tests, so tests run against the real setup. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<Env, true>);
  const express = app as NestExpressApplication;

  express.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '1mb' });

  app.setGlobalPrefix(API_PREFIX);
  const production = config.get('NODE_ENV', { infer: true }) === 'production';
  // Locally the API runs on plain http://localhost, so "upgrade-insecure-requests" would break Swagger UI in Safari.
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: production ? [] : null } } }));
  app.use(cookieParser(config.get('SESSION_COOKIE_SECRET', { infer: true })));
  // Same-origin in Azure (Front Door routes /api); locally the Next.js dev server proxies /api. Only APP_ORIGIN
  // is allowed for any cross-origin call.
  app.enableCors({ origin: new URL(config.get('APP_ORIGIN', { infer: true })).origin, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields…
      forbidNonWhitelisted: true, // …and reject requests that send them (mass-assignment protection)
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
