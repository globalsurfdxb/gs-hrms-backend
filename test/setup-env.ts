import 'dotenv/config';

// E2E runs always use dev login and never production settings.
process.env['NODE_ENV'] = 'test';
process.env['AUTH_DEV_LOGIN'] = 'true';
process.env['LOG_LEVEL'] = 'error';
