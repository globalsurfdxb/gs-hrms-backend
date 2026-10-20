import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { configureApp } from './core/http/configure-app.js';
import { setupSwagger } from './core/http/swagger.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const config = app.get(ConfigService<Env, true>);
  if (config.get('NODE_ENV', { infer: true }) !== 'production') setupSwagger(app);

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
