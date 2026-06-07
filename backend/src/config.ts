import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const root = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  // Comma-free single origin or '*' for dev. The frontend default dev origin.
  corsOrigin: process.env.PANOPTES_CORS_ORIGIN || '*',

  // Secret used to derive the AES key that encrypts stored target credentials.
  // MUST be set in production. A default is used only to keep dev frictionless.
  secretKey: process.env.PANOPTES_SECRET_KEY || 'change-me-panoptes-dev-secret',

  jwtSecret: process.env.PANOPTES_JWT_SECRET || process.env.PANOPTES_SECRET_KEY || 'change-me-panoptes-jwt',
  jwtExpiresIn: process.env.PANOPTES_JWT_EXPIRES || '12h',

  // First-run admin account. Created only if no users exist yet.
  adminUser: process.env.PANOPTES_ADMIN_USER || 'admin',
  adminPass: process.env.PANOPTES_ADMIN_PASS || 'panoptes',

  dbPath: process.env.PANOPTES_DB_PATH || path.join(root, 'data', 'panoptes.sqlite'),
  modulesDir: process.env.PANOPTES_MODULES_DIR || path.resolve(root, '..', 'modules'),
  definitionsDir:
    process.env.PANOPTES_DEFINITIONS_DIR || path.resolve(root, '..', 'system-definitions'),
};

export type Config = typeof config;
