import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../pc-web/dist-pages/', import.meta.url));
const target = fileURLToPath(new URL('./app/src/main/assets/web/', import.meta.url));
if (!existsSync(source + '/index.html')) throw new Error('First run npm run build:pages in pc-web');
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log('Bundled offline web assets.');
