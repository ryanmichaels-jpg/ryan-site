import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Change this to your real domain when you buy one.
  site: 'https://ryanmichaels.dev',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: { theme: 'vitesse-light', wrap: true },
  },
});
