import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: '/hangabout/',
  resolve: {
    alias: {
      '@opportunity-catalogue': decodeURIComponent(new URL(
        mode === 'test' ? './tests/fixtures/opportunities/catalogue.ts' : './data/opportunities.json',
        import.meta.url,
      ).pathname),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
}));
