import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import fs from 'node:fs';

// APP_VERSION lo pone el workflow de release (tag de GitHub); BASE_PATH = /<repo>/ en GitHub Pages.
const version = process.env.APP_VERSION || 'dev';
const base = process.env.BASE_PATH || '/slices/';

/** Genera sw.js (con la versión y la lista de precache) y version.json en cada build. */
function serviceWorker() {
  return {
    name: 'slices-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const precache = ['./', ...built, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/badge-96.png'];
      const src = fs.readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
    }
  };
}

export default defineConfig({
  base,
  plugins: [preact(), serviceWorker()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  test: { include: ['tests/**/*.test.js'] }
});
