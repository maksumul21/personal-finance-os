import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrations) uses the direct connection; the app runtime uses DATABASE_URL
// (Supabase pooler) through the pg driver adapter in src/server/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
    // Local prisma dev exposes a separate shadow server; Supabase can leave this unset.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] || undefined,
  },
});
