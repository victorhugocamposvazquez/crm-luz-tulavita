import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server-lib/**/*.test.ts', '**/server-lib/**/*.test.ts', 'src/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      // fileURLToPath evita que los espacios de la ruta se codifiquen como %20
      // (URL.pathname los escaparía y rompería la resolución del alias).
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
