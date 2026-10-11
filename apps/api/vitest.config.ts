import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // A dummy OpenF1 login so the live feed can be exercised; tests answer /token themselves.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, OPENF1_USERNAME: "test", OPENF1_PASSWORD: "test" } },
      }),
    ],
    test: { setupFiles: ["./test/setup.ts"] },
  };
});
