import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // One .prisma file per module, all in prisma/schema/.
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
