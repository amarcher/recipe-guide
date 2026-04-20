import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// .env.local is the canonical local env file (synced from Vercel) — load it
// in addition to whatever dotenv/config picked up from .env.
loadEnv({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct (unpooled) connection — pgbouncer can't run
    // certain DDL statements. Runtime client uses pooled URL via
    // PrismaClient({ datasourceUrl }) in app/lib/prisma.ts.
    url: process.env["DATABASE_URL_UNPOOLED"],
  },
});
