import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    // Même alias que tsconfig.json, sinon `@/lib/...` ne résout pas.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
});
