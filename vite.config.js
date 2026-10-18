import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: false,
    testTimeout: 20000,
    // `npx vitest run --project unit` needs nothing but Node; the integration project starts a real Django server.
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.{js,jsx}'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.{js,jsx}'],
          globalSetup: ['./tests/integration/globalSetup.js'],
          setupFiles: ['./tests/setup.js', './tests/integration/setup.js'],
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
})
