/* SNS やチャットにリンクを貼ったときに出る画像 (og.jpg、1200x630) を作る。
   型は scripts/og/og.html。Chromium で撮るので、書体はゲームと同じ Google Fonts がそのまま使える。
   使い方: node scripts/make_og_image.mjs   (playwright が要る。npx playwright install chromium)
   作り直したら index.html / three-play.html の og:image の ?v= を1つ上げる (X や Discord が古い画像を覚えているため) */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// require にすると、プロジェクトに無くても全体に入れた playwright を NODE_PATH で拾える
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(root, process.argv[2] || 'og.jpg');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(path.join(root, 'scripts/og/og.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
await browser.close();
console.log(out, Math.round(fs.statSync(out).size / 1024), 'KB');
