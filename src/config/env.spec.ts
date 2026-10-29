import { validateEnv } from './env.js';

const key = Buffer.alloc(32, 1).toString('base64');
const production = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://hrms.example.com',
  DATABASE_URL: 'postgresql://hrms@localhost/hrms',
  SESSION_COOKIE_SECRET: 'x'.repeat(32),
  FIELD_ENCRYPTION_KEY: key,
  FIELD_BLIND_INDEX_KEY: key,
};
const entra = {
  ENTRA_TENANT_ID: 'tenant',
  ENTRA_CLIENT_ID: 'client',
  ENTRA_CLIENT_SECRET: 'secret',
  ENTRA_REDIRECT_URI: 'https://hrms.example.com/api/auth/callback',
};

describe('production sign-in configuration', () => {
  it('starts without Microsoft sign-in (the password form is the way in for now)', () => {
    expect(validateEnv(production).DEV_LOGIN_PASSWORD).toBe('demo1234');
    expect(validateEnv({ ...production, ...entra }).ENTRA_TENANT_ID).toBe('tenant');
  });

  it('never allows the persona picker', () => {
    expect(() => validateEnv({ ...production, AUTH_DEV_LOGIN: 'true' })).toThrow(/AUTH_DEV_LOGIN/);
  });
});
