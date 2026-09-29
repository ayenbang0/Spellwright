import { defineConfig, type Plugin } from 'vite';
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ASSETS = resolve(__dirname, 'assets');
const MIME: Record<string, string> = { '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.html': 'text/html' };

/** `assets/` is the single source of truth for art: serve it at /assets in dev, copy it into dist/assets on build. */
function artAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'art-assets',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0]);
        const i = url.indexOf('/assets/');
        if (i < 0) return next();
        const file = normalize(join(ASSETS, url.slice(i + '/assets/'.length)));
        if (!file.startsWith(ASSETS) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      cpSync(ASSETS, join(outDir, 'assets'), { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative base: the build works at any GitHub Pages subpath without knowing the repo name.
  base: './',
  build: { assetsDir: 'bundle', target: 'es2022' },
  plugins: [artAssets()],
});
