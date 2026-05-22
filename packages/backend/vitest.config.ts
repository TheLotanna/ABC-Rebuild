import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Backend tests are pure-Node; no DOM needed.
    environment: 'node',
    // Pick up `*.test.ts` co-located beside the source modules under src/lib/.
    include: ['src/**/*.test.ts'],
    // Backend is ESM (`"type": "module"`) and tests import `./pii.js` etc.
    // Let Vitest resolve those .js specifiers to the .ts sources.
    server: {
      deps: {
        // Allows .ts files to satisfy `./foo.js` import specifiers.
        inline: [],
      },
    },
  },
  resolve: {
    // Map .js specifiers used by ESM TS source back to their .ts files so
    // Vitest can resolve them in dev (where there's no compiled output).
    extensions: ['.ts', '.js', '.mjs'],
  },
});
