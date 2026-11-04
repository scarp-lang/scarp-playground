import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages does not offer custom HTTP response headers for this static
// deployment. Insert a restrictive CSP meta tag into *production HTML only*;
// Vite's dev/HMR client requires different directives and must remain usable.
//
// WASM requires 'wasm-unsafe-eval'; Monaco inserts inline styles and needs
// 'unsafe-inline' in style-src. Neither exception permits inline JS or eval().
export const productionCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ');

export default defineConfig({
  base: '/scarp-playground/',
  plugins: [
    {
      name: 'scarp-production-csp',
      apply: 'build',
      enforce: 'pre',
      transformIndexHtml(html) {
        const charset = '<meta charset="UTF-8" />';
        if (!html.includes(charset)) {
          throw new Error('Cannot inject Content Security Policy before assets');
        }
        return html.replace(
          charset,
          charset + '\n    <meta http-equiv="Content-Security-Policy" content="' +
            productionCsp + '" />',
        );
      },
    },
    react(),
    tailwindcss(),
  ],
});
