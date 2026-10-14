import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // Both rule suites share the same emulators, so run them one at a time.
    fileParallelism: false,
  },
})
