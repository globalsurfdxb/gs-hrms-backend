import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from './configure-app.js';

const DESCRIPTION = `
API for GS HRMS. **Generated from the code** — every endpoint must be documented (CI checks it).
Business rules and flows: \`docs/modules/*.md\` and the PDFs in \`flow/\`. Testing guide: \`docs/api-guide.md\`.

### Try it in 3 steps
1. Open **Auth → POST /api/auth/dev/login**, click **Try it out**, send \`{ "employeeCode": "GS-120" }\`.
   The session cookie is now set in this browser.
2. Call any endpoint with **Try it out** — you are signed in as that persona.
3. Switch persona by signing in again (GS-119 HR · GS-101 Office Admin · GS-058 Team Lead · GS-087 Employee).

### Errors
Every error has the same body: \`{ statusCode, code, message, details?, requestId }\`. Switch on \`code\`.
`;

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('GS HRMS API')
    .setDescription(DESCRIPTION)
    .setVersion('0.1.0')
    .addCookieAuth('hrms_sid')
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Swagger UI at /api/docs. Never mounted in production (main.ts). */
export function setupSwagger(app: INestApplication) {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    customSiteTitle: 'GS HRMS API',
    swaggerOptions: {
      withCredentials: true,
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      tagsSorter: 'alpha',
      displayRequestDuration: true,
    },
  });
}
