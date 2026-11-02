import "dotenv/config";

// Integration tests run against DATABASE_URL (local `prisma dev`). Each test creates its own
// random users and removes them afterwards, so existing dev data is never touched.
process.env.DEV_AUTH_EMAIL = "";
