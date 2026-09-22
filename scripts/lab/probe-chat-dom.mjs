// Lab probe for a new Cursor version: launches the lab (IDE window, or the
// Agents window with --glass), opens the chat pane and dumps the DOM shape of
// every Hebrew text block (class chain, dir attr, computed bidi/direction) to
// C:\cursor-rtl-lab\probe\dom-<ide|glass>.json plus a screenshot.
// --keep leaves Cursor running so cdp-eval.mjs / send-prompt.mjs can follow.
//   node scripts/lab/probe-chat-dom.mjs [--glass] [--keep]
import fs from 'node:fs';
import path from 'node:path';
import { launchAndConnect, waitForRtlOn, waitForWorkbenchDom, sleep, killLabCursor, openChatPane, openHebrewChatFromHistory, closeAllEditorTabs, setWindowBounds, LAB } from '../e2e/lib.mjs';

const glass = process.argv.includes('--glass');
const OUT = path.join(LAB, 'probe');
fs.mkdirSync(OUT, { recursive: true });

killLabCursor();
await sleep(1500);
const { browser, context, page: firstPage } = await launchAndConnect({ glass });
let page = firstPage;
if (!glass) {
    page = await waitForRtlOn(context);
} else {
    await waitForWorkbenchDom(page);
}
await sleep(5000);
await setWindowBounds(browser, page);
const title = await page.evaluate(() => document.title);
console.log('title:', title);
if (!glass) {
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Escape');
        await sleep(500);
        await page.evaluate(() => { const b = document.querySelector('.monaco-dialog-box .codicon-dialog-close, [role="dialog"] [aria-label="Close"], [role="dialog"] button[aria-label*="lose" i]'); if (b) b.click(); });
        await sleep(500);
    }
    await closeAllEditorTabs(page);
    await openChatPane(page);
    await sleep(1000);
    await page.keyboard.press('Escape');
    await sleep(500);
    console.log('history:', await openHebrewChatFromHistory(page));
    await sleep(3000);
}
const dump = await page.evaluate(() => {
    const rtl = /[֐-׿]/;
    const chain = (el) => { const parts = []; let c = el; while (c && c !== document.body && parts.length < 12) { parts.push(c.tagName.toLowerCase() + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (c.getAttribute('dir') ? '[dir=' + c.getAttribute('dir') + ']' : '')); c = c.parentElement; } return parts.join(' < '); };
    const blocks = Array.from(document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')).filter((el) => rtl.test(el.textContent || '') && !el.closest('.monaco-editor'));
    return {
        rtlState: typeof window.__cursorRtlScanAll,
        markdownRoot: document.querySelectorAll('.markdown-root').length,
        renderedMsg: document.querySelectorAll('.composer-rendered-message').length,
        humanMsg: document.querySelectorAll('.composer-human-message').length,
        dirRtl: document.querySelectorAll('[dir="rtl"]').length,
        blocks: blocks.slice(0, 40).map((el) => ({
            text: (el.textContent || '').slice(0, 60),
            dir: el.getAttribute('dir'),
            bidi: getComputedStyle(el).unicodeBidi,
            direction: getComputedStyle(el).direction,
            chain: chain(el),
        })),
    };
});
fs.writeFileSync(path.join(OUT, `dom-${glass ? 'glass' : 'ide'}.json`), JSON.stringify(dump, null, 2));
console.log(JSON.stringify({ ...dump, blocks: dump.blocks.length }, null, 2));
await page.screenshot({ path: path.join(OUT, `shot-${glass ? 'glass' : 'ide'}.png`), scale: 'css' });
await browser.close();
if (!process.argv.includes('--keep')) killLabCursor();
