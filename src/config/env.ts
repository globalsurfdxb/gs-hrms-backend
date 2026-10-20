import { z } from 'zod';

/* Every environment variable the app reads, validated once at startup. The app refuses to boot on an invalid or
   unsafe configuration instead of failing later at request time. Read values through ConfigService<Env, true>. */

const base64Key = z
  .string()
  .refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    'must be a base64-encoded 32-byte key (openssl rand -base64 32)',
  );

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APP_ORIGIN: z.url(),
    /** Reverse proxies in front of the app (Front Door → App Service = 2). 0 locally. Controls req.ip. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),

    DATABASE_URL: z.string().min(1),

    SESSION_COOKIE_SECRET: z.string().min(32),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),

    AUTH_DEV_LOGIN: bool,
    ENTRA_TENANT_ID: z.string().optional(),
    ENTRA_CLIENT_ID: z.string().optional(),
    ENTRA_CLIENT_SECRET: z.string().optional(),
    ENTRA_REDIRECT_URI: z.url().optional(),

    FIELD_ENCRYPTION_KEY: base64Key,
    FIELD_BLIND_INDEX_KEY: base64Key,

    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
    AZURE_STORAGE_ACCOUNT_URL: z.string().optional(),
    SMTP_URL: z.string().optional(),
    GOTENBERG_URL: z.string().optional(),
  })
  .transform((e) => ({
    ...e,
    // Empty strings from .env count as "not set".
    ENTRA_TENANT_ID: e.ENTRA_TENANT_ID || undefined,
    ENTRA_CLIENT_ID: e.ENTRA_CLIENT_ID || undefined,
    ENTRA_CLIENT_SECRET: e.ENTRA_CLIENT_SECRET || undefined,
  }))
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
    if (e.AUTH_DEV_LOGIN)
      ctx.addIssue({ code: 'custom', path: ['AUTH_DEV_LOGIN'], message: 'dev login must be off in production' });
    for (const k of ['ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI'] as const) {
      if (!e[k]) ctx.addIssue({ code: 'custom', path: [k], message: 'required in production' });
    }
    if (!e.APP_ORIGIN.startsWith('https://'))
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'must be https in production' });
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    // Names only — never echo values, they may be secrets.
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}
