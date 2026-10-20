import { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../app.js';

/* Every route must be documented in Swagger: a summary, a success response and its error responses.
   Undocumented endpoints fail CI. Routes hidden with @ApiExcludeEndpoint (browser redirects) are skipped. */
const OPERATION = 'swagger/apiOperation';
const RESPONSES = 'swagger/apiResponse';
const EXCLUDED = 'swagger/apiExcludeEndpoint';

describe('API documentation', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('every route has a summary, a success response and documented errors', () => {
    const problems: string[] = [];
    for (const wrapper of app.get(DiscoveryService).getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of app.get(MetadataScanner).getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[name] as object;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
        if (Reflect.getMetadata(EXCLUDED, handler)) continue;

        const where = `${wrapper.name}.${name}`;
        const op = Reflect.getMetadata(OPERATION, handler) as { summary?: string } | undefined;
        if (!op?.summary) problems.push(`${where}: missing @ApiOperation({ summary })`);

        const responses = Object.keys((Reflect.getMetadata(RESPONSES, handler) as object | undefined) ?? {});
        if (!responses.some((s) => /^2\d\d$/.test(s))) problems.push(`${where}: missing success response`);
        if (!responses.some((s) => /^[45]\d\d$/.test(s))) problems.push(`${where}: missing @ApiErrors(...)`);
      }
    }
    expect(problems).toEqual([]);
  });
});
