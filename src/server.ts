import "dotenv/config";
import { assertJwtSecret } from "./auth.js";
import { app } from "./app.js";

try {
  assertJwtSecret();
} catch (error) {
  console.error(error instanceof Error ? error.message : "JWT_SECRET is not configured");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
app.listen(port, host, () => console.log(`Property Portal API listening on http://${host}:${port}`));
