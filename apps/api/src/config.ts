import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_MODE: z.enum(['development', 'oidc']).optional(),
  DATA_BACKEND: z.enum(['memory', 'file', 'firestore']).optional(),
  DATA_FILE_PATH: z.string().default('/app/data/link-partner-state.json'),
  KEYCLOAK_AUTHORITY: z.string().url().default('http://localhost:8080/realms/application-hub'),
  KEYCLOAK_CLIENT_ID: z.string().min(1).default('link-partner-frontend'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  FIRESTORE_DATABASE_ID: z.string().default('(default)'),
  BOOTSTRAP_ADMIN_EMAILS: z.string().default(''),
});

const env = schema.parse(process.env);

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  authMode: env.AUTH_MODE || (env.NODE_ENV === 'production' ? 'oidc' : 'development'),
  dataBackend: env.DATA_BACKEND || (env.NODE_ENV === 'production' ? 'firestore' : 'memory'),
  dataFilePath: env.DATA_FILE_PATH,
  keycloakAuthority: env.KEYCLOAK_AUTHORITY.replace(/\/$/, ''),
  keycloakClientId: env.KEYCLOAK_CLIENT_ID,
  corsOrigins: env.CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean),
  googleCloudProject: env.GOOGLE_CLOUD_PROJECT,
  firestoreDatabaseId: env.FIRESTORE_DATABASE_ID,
  bootstrapAdminEmails: new Set(env.BOOTSTRAP_ADMIN_EMAILS.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)),
};
