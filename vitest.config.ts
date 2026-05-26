import { defineConfig } from 'vitest/config'

// Single root config for the whole monorepo. Unit tests live in each package's
// `test/` tree (outside `src`, so `tsc` build/typecheck ignore them). The
// existing `packages/server/test/*.mjs` files are end-to-end smoke scripts that
// need a running server, so they are deliberately excluded from the unit run.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/shared/test/**/*.test.ts',
      'packages/server/test/unit/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/shared/src/**/*.ts',
        'packages/server/src/**/*.ts',
      ],
      exclude: [
        // Entry point and DI wiring.
        'packages/server/src/main.ts',
        'packages/server/src/**/*.module.ts',
        // HTTP/WebSocket transport — exercised by the e2e .mjs smoke scripts, not unit tests.
        'packages/server/src/**/*.controller.ts',
        'packages/server/src/rooms/rooms.gateway.ts',
        'packages/server/src/prisma/prisma.service.ts',
        // Trivial metadata decorators and static word data.
        'packages/server/src/**/*.decorator.ts',
        'packages/server/src/users/word-list.ts',
        // Type-only module (interfaces compile to nothing).
        'packages/shared/src/events.ts',
      ],
    },
  },
})
