import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// .env lives at the repo root; in Docker the vars come from the environment instead.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
