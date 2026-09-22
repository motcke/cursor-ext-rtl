// Sends a prompt in the running lab's chat composer and waits for the reply
// to settle. Default prompt: the issue #18 sentences, so a real 3.21 assistant
// reply can be inspected with cdp-eval.mjs. Needs a logged-in lab profile.
//   node scripts/lab/send-prompt.mjs [--glass] ["custom prompt"]
import { chromium } from 'playwright';
const glass = process.argv.includes('--glass');
const PROMPT = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ') || [
'Reply with EXACTLY the following seven lines, verbatim, as a markdown bulleted list (one bullet per line), then a level-2 heading "משפטי בדיקה" and the same seven lines again as plain paragraphs. Do not add anything else.',
'A. שלום, זה משפט עברית טהור לבדיקת יישור ימין.',
'B. Please summarize your findings.',
'C. OK, תתקן את הכותרת במובייל עכשיו.',
'D. Please check if EN is inside the menu, not the header. הכפתור כרגע בחוץ.',
'E. The WhatsApp button is too large. הכפתור גדול מדי וחוסם קריאה.',
'F. הלוגו חייב להיות הסימן, לא המילים eyal amit.',
'G. This is a long English paragraph that happens to mention אחד Hebrew word and should stay LTR.',
].join('\n');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const pages = browser.contexts()[0].pages().filter((p) => p.url().includes('workbench.html'));
const titles = await Promise.all(pages.map((p) => p.evaluate(() => document.title).catch(() => '?')));
const page = pages.find((p, i) => glass ? /agents/i.test(titles[i]) : !/agents/i.test(titles[i])) ?? pages[0];
const sel = '.aislash-editor-input, .ui-prompt-input-editor__input [contenteditable="true"], .ui-prompt-input-editor__input, [contenteditable="true"].tiptap';
const handle = await page.$(sel);
if (!handle) throw new Error('composer not found');
await handle.click();
await page.waitForTimeout(300);
for (const line of PROMPT.split('\n')) {
    await page.keyboard.insertText(line);
    await page.keyboard.press('Shift+Enter');
}
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
console.log('sent; waiting for reply...');
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 180_000) {
    await page.waitForTimeout(3000);
    const txt = await page.evaluate(() => Array.from(document.querySelectorAll('.markdown-root, .composer-rendered-message')).map((e) => e.textContent).join('\n').slice(-200));
    if (txt && txt === last) break;
    last = txt;
}
console.log('reply tail:', last);
await browser.close();
