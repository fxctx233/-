import { cpSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../pc-web/dist-pages/', import.meta.url));
const target = fileURLToPath(new URL('./app/src/main/assets/web/', import.meta.url));
if (!existsSync(source + '/index.html')) throw new Error('First run npm run build:pages in pc-web');
mkdirSync(target, { recursive: true });
// Remove only old generated bundles; repeated builds must not grow the APK.
const assetDir = join(target, 'assets');
if (existsSync(assetDir)) {
  for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
    if (entry.isFile() && /^index-[\w-]+\.(js|css)$/.test(entry.name)) {
      unlinkSync(join(assetDir, entry.name));
    }
  }
}
cpSync(source, target, { recursive: true });
console.log('Bundled offline web assets.');
