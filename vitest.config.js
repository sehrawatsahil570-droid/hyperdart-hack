// Separate from vite.config.js (the template's build config, which must not be changed).
// The tests cover the plain-JS logic in src/frontend/lib, so they run in Node.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
