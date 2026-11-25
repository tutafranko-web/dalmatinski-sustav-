import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // prvi test u datoteci diže cijeli Postgres (PGlite) i pokreće migracije; na sporijem laptopu to traje i 10 s
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
