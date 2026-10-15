import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'vite-plugin-suppress-hmr-client',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs') || id.includes('vite/dist/client/bundledDevClient.mjs')) {
            return code
              .replaceAll(
                'new WebSocket(',
                'new (class MockHMRWS { constructor() { this.readyState = 3; } addEventListener() {} removeEventListener() {} send() {} close() {} })('
              )
              .replaceAll(
                'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
                'resolve();'
              )
              .replaceAll(
                'e.message.includes("WebSocket closed without opened.")',
                'false'
              );
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          id: '/',
          name: 'MavRent Platform',
          short_name: 'MavRent',
          description: 'Enterprise rental property management SaaS with multi-tenant architecture, rent engine, and Gemini AI.',
          theme_color: '#0a1128',
          background_color: '#020617',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
