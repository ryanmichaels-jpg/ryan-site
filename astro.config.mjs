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
  vite: {
    // DEV ONLY (vite `server` config never ships in a build): the demo
    // service locks CORS to https://ryanmichaels.dev with no wildcard, so
    // locally the widgets talk to the SAME origin at /demo and the dev
    // server forwards to :3200 with the Origin header removed (the service
    // allows origin-less requests by design). The deployed CORS policy is
    // not widened, and nothing proxies in production.
    server: {
      proxy: {
        '/demo': {
          target: 'http://localhost:3200',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
          },
        },
      },
    },
  },
});
