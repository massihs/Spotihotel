import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config();

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the React server runtime; it is a no-op guard in tests.
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/helpers/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://spotifood:spotifood@localhost:5432/spotifood_test",
      // The realtime listener must watch the test database too.
      DATABASE_URL_DIRECT:
        process.env.TEST_DATABASE_URL ?? "postgres://spotifood:spotifood@localhost:5432/spotifood_test",
    },
    // Integration tests share one database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
