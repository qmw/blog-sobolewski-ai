// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://example.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  i18n: {
    locales: ['pl', 'en', 'de', 'es', 'fr', 'it', 'ar', 'ja', 'zh'],
    defaultLocale: 'pl',
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    // hreflang lives in each page's <head> (localized slugs differ per language, which
    // the sitemap's i18n mode cannot map). Drafts and the CMS are kept out of the sitemap.
    sitemap({ filter: (page) => !page.includes('/admin') }),
  ],
  vite: { plugins: [tailwindcss()] },
});
