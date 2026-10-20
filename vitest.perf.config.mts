import { defineConfig } from "vitest/config";

// The load test: a database filled like a busy church after two years, and
// the app's heaviest queries timed against it. Run with `npm run test:perf`.
// Not part of `npm test`: it takes a minute or two.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/perf/**/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
