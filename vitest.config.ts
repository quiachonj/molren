import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    alias: {
      // Route `import ... from "obsidian"` to our lightweight test double.
      obsidian: new URL("./test/__mocks__/obsidian.ts", import.meta.url)
        .pathname,
    },
  },
});
