// Evaluates a JS expression in the running lab window (IDE window by default,
// Agents window with --glass) and prints the JSON result. Async IIFEs work.
//   node scripts/lab/cdp-eval.mjs [--glass] "<js expression>"
//   node scripts/lab/cdp-eval.mjs [--glass] --file snippet.js
import fs from 'node:fs';
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const glass = args.includes('--glass');
const fileIdx = args.indexOf('--file');
const code = fileIdx >= 0 ? fs.readFileSync(args[fileIdx + 1], 'utf-8') : args.filter((a) => !a.startsWith('--')).join(' ');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const pages = browser.contexts()[0].pages().filter((p) => p.url().includes('workbench.html'));
const titles = await Promise.all(pages.map((p) => p.evaluate(() => document.title).catch(() => '?')));
let page = pages.find((p, i) => glass ? /agents/i.test(titles[i]) : !/agents/i.test(titles[i])) ?? pages[0];
console.error('pages:', titles.join(' | '));
const result = await page.evaluate(code);
console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
await browser.close();
