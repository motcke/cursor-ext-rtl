// Shared helpers for the e2e suite (plan §7.3).

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launch, CDP_PORT } from '../lab/launch.mjs';

export const LAB = 'C:\\cursor-rtl-lab';
export const APP = path.join(LAB, 'cursor', 'resources', 'app');
export const PRELOAD_JS = path.join(APP, 'out', 'vs', 'base', 'parts', 'sandbox', 'electron-sandbox', 'preload.js');
export const PRELOAD_DIR = path.dirname(PRELOAD_JS);
export const WORKBENCH_JS = path.join(APP, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.js');
export const RTL_DIR = path.join(APP, 'out', 'vs', 'workbench');
export const PRODUCT_JSON = path.join(APP, 'product.json');
export const MAIN_JS = path.join(APP, 'out', 'main.js');
export const CLEAN = path.join(LAB, 'clean');
export const LAB_SETTINGS = path.join(LAB, 'data', 'User', 'settings.json');
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VISUAL_DIR = path.join(REPO_ROOT, 'visual');

export const PATCH_MARKER = 'cursor-rtl-injected';
export const CHECKSUM_KEY = 'vs/base/parts/sandbox/electron-sandbox/preload.js';

export const HEBREW_COMPOSER_TEXT = 'בדיקת כיוון טקסט בעברית עם מונח באנגלית CDP בתוך המשפט';

export function log(...args) {
    console.log('[e2e]', ...args);
}

export function killLabCursor() {
    spawnSync('powershell', [
        '-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='Cursor.exe'\" | " +
        "Where-Object { $_.ExecutablePath -like 'C:\\cursor-rtl-lab\\*' } | " +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ]);
}

export function sha256(filePath) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('base64').replace(/=+$/, '');
}

export function readProductChecksum(productJsonPath = PRODUCT_JSON) {
    const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));
    return product.checksums?.[CHECKSUM_KEY] ?? null;
}

export function isLabPatched() {
    return fs.readFileSync(PRELOAD_JS, 'utf-8').includes(PATCH_MARKER);
}

// Simulates a Cursor update: the clean preload.js and product.json replace
// the patched ones (a real update also wipes cursor-rtl.js — do that too).
export function simulateCursorUpdate() {
    fs.copyFileSync(path.join(CLEAN, 'preload.js'), PRELOAD_JS);
    fs.copyFileSync(path.join(CLEAN, 'workbench.js'), WORKBENCH_JS);
    fs.copyFileSync(path.join(CLEAN, 'product.json'), PRODUCT_JSON);
    for (const f of ['cursor-rtl.js', 'cursor-rtl-config.json']) {
        fs.rmSync(path.join(RTL_DIR, f), { force: true });
    }
    for (const f of fs.readdirSync(PRELOAD_DIR)) {
        if (f.startsWith('preload.js.rtl-backup-')) {
            fs.rmSync(path.join(PRELOAD_DIR, f), { force: true });
        }
    }
    fs.rmSync(PRODUCT_JSON + '.rtl-backup', { force: true });
}

export async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function waitFor(fn, { timeoutMs = 60_000, intervalMs = 500, label = 'condition' } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
        try {
            last = await fn();
            if (last) return last;
        } catch {
            // keep polling
        }
        await sleep(intervalMs);
    }
    throw new Error(`timed out waiting for ${label}`);
}

// Clears the extension's auto-reload guard (globalState.lastAutoReload) so
// scenarios exercise the deterministic auto-reload path regardless of what
// ran in the previous 10 minutes. Cursor must be closed. Uses python's
// sqlite3 (state.vscdb is sqlite; node has no built-in driver).
export function resetAutoReloadGuard() {
    const db = path.join(LAB, 'data', 'User', 'globalStorage', 'state.vscdb');
    if (!fs.existsSync(db)) return;
    const script = [
        'import sqlite3, json',
        `con = sqlite3.connect(r'${db}')`,
        "row = con.execute(\"SELECT value FROM ItemTable WHERE key='motcke.cursor-rtl'\").fetchone()",
        'if row:',
        '    v = json.loads(row[0])',
        "    v.pop('lastAutoReload', None)",
        "    con.execute(\"UPDATE ItemTable SET value=? WHERE key='motcke.cursor-rtl'\", (json.dumps(v),))",
        '    con.commit()',
        'con.close()',
    ].join('\n');
    const res = spawnSync('python', ['-c', script]);
    if (res.status !== 0) {
        log('resetAutoReloadGuard failed:', String(res.stderr).slice(0, 200));
    }
}

// Cursor persists the last window's kind in storage.json; once a session
// ends in the Agents (glass) window, every next launch reopens as glass —
// which has no extension host and swallows keyboard input. Force the next
// launch back to a regular window.
export function sanitizeWindowState(dataDir = path.join(LAB, 'data')) {
    const p = path.join(dataDir, 'User', 'globalStorage', 'storage.json');
    try {
        const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
        let changed = false;
        for (const entry of Object.values(d.windowsState ?? {})) {
            if (entry && typeof entry === 'object' && entry.uiState?.glassMode) {
                entry.uiState.glassMode = false;
                changed = true;
            }
        }
        if (changed) {
            fs.writeFileSync(p, JSON.stringify(d));
            log('sanitized windowsState (glassMode → false)');
        }
    } catch {
        // storage.json missing on a fresh profile — nothing to sanitize
    }
}

// Launches the lab and returns { browser, context, page } for the first
// workbench window, with the workbench DOM built.
export async function launchAndConnect(opts = {}) {
    if (!opts.glass) {
        sanitizeWindowState(opts.dataDir);
    }
    // Stale harness requests from a killed session must not be claimed and
    // executed by the new one.
    for (const f of fs.readdirSync(LAB)) {
        if (f.startsWith('e2e-cmd.json') || f === 'e2e-res.json') {
            fs.rmSync(path.join(LAB, f), { force: true });
        }
    }
    launch(opts);
    await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).catch(() => null);
        if (!res) return false;
        const targets = await res.json();
        return targets.some((t) => t.type === 'page' && (t.url ?? '').includes('workbench.html'));
    }, { timeoutMs: 120_000, label: 'CDP workbench target' });

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const context = browser.contexts()[0];
    const page = await waitFor(
        () => context.pages().find((p) => p.url().includes('workbench.html')),
        { label: 'workbench page' }
    );
    return { browser, context, page };
}

export function workbenchPages(context) {
    return context.pages().filter((p) => p.url().includes('workbench.html'));
}

// A window reload (workbench.action.reloadWindow) replaces the CDP target, so
// a held page handle goes dead — and a stale hidden target can linger and
// still answer evaluate() while receiving no real input. Prefer the page
// whose document is actually visible.
export async function currentWorkbenchPage(context, { exclude = [], timeoutMs = 60_000 } = {}) {
    return waitFor(
        async () => {
            const candidates = workbenchPages(context).filter((p) => !exclude.includes(p) && !p.isClosed());
            let fallback = null;
            for (const p of candidates) {
                try {
                    const visible = await p.evaluate(() => document.visibilityState === 'visible');
                    if (visible) return p;
                    fallback = fallback ?? p;
                } catch {
                    // navigating
                }
            }
            return candidates.length === 1 ? fallback : null;
        },
        { timeoutMs, label: 'visible workbench page' }
    );
}

// Polls across current workbench pages until the RTL runtime is up in one of
// them; returns that page. Survives target replacement during reloads.
export async function waitForRtlOn(context, timeoutMs = 90_000) {
    return waitFor(async () => {
        let hiddenMatch = null;
        for (const p of workbenchPages(context)) {
            try {
                const state = await p.evaluate(() => ({
                    scan: typeof window.__cursorRtlScanAll,
                    visible: document.visibilityState === 'visible',
                }));
                if (state.scan === 'function') {
                    if (state.visible) return p;
                    hiddenMatch = p;
                }
            } catch {
                // page navigating or closed — keep polling
            }
        }
        return hiddenMatch;
    }, { timeoutMs, label: 'RTL runtime' });
}

export async function waitForWorkbenchDom(page, timeoutMs = 90_000) {
    await waitFor(
        () => page.evaluate(() => Boolean(document.querySelector('.monaco-workbench'))).catch(() => false),
        { timeoutMs, label: 'workbench DOM' }
    );
}

// Fixed window size so screenshots are comparable run to run (plan §7.3).
export async function setWindowBounds(browser, page, width = 1600, height = 1000) {
    const pageSession = await page.context().newCDPSession(page);
    try {
        // Try the Browser domain on the page session first (Electron exposes
        // it there), then on a browser-level session.
        const { targetInfo } = await pageSession.send('Target.getTargetInfo');
        let sent = false;
        for (const session of [pageSession, await browser.newBrowserCDPSession().catch(() => null)]) {
            if (!session) continue;
            try {
                const { windowId } = await session.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
                await session.send('Browser.setWindowBounds', {
                    windowId,
                    bounds: { left: 50, top: 50, width, height, windowState: 'normal' },
                });
                sent = true;
                break;
            } catch {
                // try next session
            }
        }
        if (!sent) {
            log('setWindowBounds unsupported — relying on the profile-restored window size');
        }
        await sleep(1_000);
        return sent;
    } catch (err) {
        log('setWindowBounds failed:', err.message);
        return false;
    } finally {
        await pageSession.detach().catch(() => {});
    }
}

// Executes a VS Code command inside the lab through the e2e harness
// extension (scripts/e2e/harness-ext) — deterministic, unlike keyboard-driven
// palette automation which reloaded dev-host windows sometimes swallow.
// Args of the form {__uri: 'C:\\path'} are revived to vscode.Uri.file.
let execCounter = 0;
export async function execCommand(command, args = [], { timeoutMs = 20_000 } = {}) {
    const id = `${Date.now()}-${++execCounter}`;
    const cmdFile = path.join(LAB, 'e2e-cmd.json');
    const resFile = path.join(LAB, 'e2e-res.json');
    fs.rmSync(resFile, { force: true });
    fs.writeFileSync(cmdFile, JSON.stringify({ id, command, args }));
    const res = await waitFor(() => {
        try {
            const parsed = JSON.parse(fs.readFileSync(resFile, 'utf-8'));
            return parsed.id === id ? parsed : null;
        } catch {
            return null;
        }
    }, { timeoutMs, intervalMs: 200, label: `command ${command}` });
    if (!res.ok) {
        throw new Error(`command ${command} failed: ${res.error}`);
    }
    return res;
}

// Closes any open quick-input / palette overlay so it can't swallow keys or
// intercept clicks meant for the workbench.
export async function dismissQuickInput(page) {
    for (let i = 0; i < 2; i++) {
        const open = await page.evaluate(() => {
            const w = document.querySelector('.quick-input-widget');
            return Boolean(w && w.style.display !== 'none');
        }).catch(() => false);
        if (!open) return;
        await page.keyboard.press('Escape');
        await sleep(300);
    }
}

// Moves DOM focus out of any webview iframe (e.g. the logged-out "Sign in"
// agent tab), which otherwise swallows every keyboard shortcut. Focusing the
// chat composer or clicking the status bar both land on regular DOM.
export async function focusNeutral(page) {
    const focused = await page.evaluate(() => {
        const el = document.querySelector('.aislash-editor-input, .ui-prompt-input-editor__input');
        if (el && el.focus) {
            el.focus();
            return true;
        }
        return false;
    }).catch(() => false);
    if (!focused) {
        const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })).catch(() => null);
        if (size) {
            await page.mouse.click(Math.round(size.w * 0.5), size.h - 8).catch(() => {});
        }
    }
    await sleep(300);
}

async function openQuickInput(page, key) {
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.keyboard.press(key);
        try {
            await page.waitForSelector('.quick-input-widget:not([style*="display: none"]) input', { timeout: 5_000 });
            return;
        } catch {
            await page.evaluate(() => window.focus()).catch(() => {});
            await focusNeutral(page);
        }
    }
    const diag = await page.evaluate(() => ({
        active: document.activeElement ? document.activeElement.tagName + '.' + String(document.activeElement.className).slice(0, 60) : null,
        title: document.title,
        hasFocus: document.hasFocus(),
    })).catch(() => null);
    throw new Error(`quick input did not open on ${key} (focus: ${JSON.stringify(diag)})`);
}

// Runs a command through the command palette (keyboard-driven, no extension
// APIs needed on the driver side). Verifies the top match actually relates to
// the requested label — Enter on an unrelated match could run anything.
export async function runPaletteCommand(page, label) {
    await dismissQuickInput(page);
    await openQuickInput(page, 'F1');
    await page.keyboard.type(label, { delay: 15 });
    await sleep(1_000);
    const topMatch = await page.evaluate(() => {
        const row = document.querySelector('.quick-input-widget .monaco-list-row');
        return row ? (row.textContent || '').trim() : '';
    });
    const wanted = label.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const got = topMatch.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!got.includes(wanted)) {
        await page.keyboard.press('Escape');
        await sleep(300);
        throw new Error(`palette command "${label}" not found (top match: "${topMatch.slice(0, 60)}")`);
    }
    await page.keyboard.press('Enter');
    await sleep(500);
}

// Opens a workspace file (harness command first, Quick Open as fallback).
export async function openFile(page, fileName) {
    try {
        await execCommand('vscode.open', [{ __uri: path.join(LAB, 'workspace', fileName) }]);
        await sleep(1_500);
        return;
    } catch (err) {
        log('openFile via harness failed, falling back to Quick Open:', err.message);
    }
    await dismissQuickInput(page);
    await openQuickInput(page, 'Control+KeyP');
    await page.keyboard.type(fileName, { delay: 15 });
    await sleep(800);
    await page.keyboard.press('Enter');
    await sleep(1_500);
}

// Closes every open editor tab (restored "New Agent" tabs included), so the
// editor area starts deterministic and no agent tab swallows shortcuts.
export async function closeAllEditorTabs(page) {
    try {
        await execCommand('workbench.action.closeAllEditors');
        await sleep(800);
        return;
    } catch {
        // harness not loaded (e.g. --no-ext) — fall back to the DOM
    }
    for (let i = 0; i < 6; i++) {
        const tabs = await page.evaluate(() => document.querySelectorAll('.tabs-container .tab').length).catch(() => 0);
        if (tabs === 0) return;
        // A focused webview tab swallows Ctrl+W — click the tab's close
        // button through the DOM instead of relying on the keyboard.
        const closed = await page.evaluate(() => {
            const btn = document.querySelector('.tabs-container .tab .action-label.codicon-close, .tabs-container .tab a.action-label[title*="Close"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        }).catch(() => false);
        if (!closed) {
            await focusNeutral(page);
            await page.keyboard.press('Control+KeyW');
        }
        await sleep(800);
    }
}

export async function clearNotifications(page) {
    try {
        await execCommand('notifications.clearAll', [], { timeoutMs: 8_000 });
        return;
    } catch {
        // harness not loaded — try the palette
    }
    try {
        await runPaletteCommand(page, 'Clear All Notifications');
    } catch {
        // non-critical
    }
}

export async function getNotifications(page) {
    return page.evaluate(() =>
        Array.from(
            document.querySelectorAll('.notification-toast .notification-list-item, .notifications-list-container .notification-list-item')
        ).map((el) => (el.textContent || '').trim()).filter(Boolean)
    );
}

// Clicks a button by (partial) label in a custom-style modal dialog.
export async function clickDialogButton(page, label, timeoutMs = 30_000) {
    await waitFor(
        () => page.evaluate((wanted) => {
            const buttons = Array.from(
                document.querySelectorAll('.monaco-dialog-box a.monaco-button, .monaco-dialog-box .monaco-button')
            );
            const target = buttons.find((b) => (b.textContent || '').trim().includes(wanted));
            if (target) {
                target.click();
                return true;
            }
            return false;
        }, label),
        { timeoutMs, label: `dialog button "${label}"` }
    );
}

// Clicks a button by (partial) label inside a notification toast.
export async function clickNotificationButton(page, label, timeoutMs = 30_000) {
    return waitFor(
        () => page.evaluate((wanted) => {
            const buttons = Array.from(
                document.querySelectorAll('.notification-list-item .monaco-button, .notification-toast .monaco-button')
            );
            const target = buttons.find((b) => (b.textContent || '').trim().includes(wanted));
            if (target) {
                target.click();
                return true;
            }
            return false;
        }, label),
        { timeoutMs, label: `notification button "${label}"` }
    );
}

export async function getRtlState(page) {
    return page.evaluate(() => ({
        scanAllType: typeof window.__cursorRtlScanAll,
        styleInjected: Boolean(document.querySelector('style[data-cursor-rtl-style]')),
        dirRtlCount: document.querySelectorAll('[dir="rtl"]').length,
    }));
}

// Opens the chat pane. Cursor's chat toggles with Ctrl+L; fall back to the
// command palette if the pane doesn't appear.
export async function openChatPane(page) {
    const paneSelector = '.aislash-editor-input, .ui-prompt-input-editor__input, [id="workbench.panel.aichat"], .composer-bar';
    const visible = () => page.evaluate((sel) => Boolean(document.querySelector(sel)), paneSelector);
    if (await visible()) return true;
    await page.keyboard.press('Control+KeyL');
    await sleep(2_000);
    if (await visible()) return true;
    try {
        await runPaletteCommand(page, 'New Chat');
        await sleep(2_000);
    } catch {
        // fall through
    }
    return visible();
}

// Types Hebrew into the chat composer WITHOUT sending. Returns false when no
// composer input could be found (e.g. chat pane missing).
export async function typeInComposer(page, text = HEBREW_COMPOSER_TEXT) {
    await dismissQuickInput(page);
    const inputSelector = '.aislash-editor-input, .ui-prompt-input-editor__input [contenteditable="true"], .ui-prompt-input-editor__input, .aislash-editor-input [contenteditable="true"]';
    const handle = await page.$(inputSelector);
    if (!handle) return false;
    await handle.click({ timeout: 10_000 }).catch(() => {});
    await sleep(300);
    await page.keyboard.type(text, { delay: 10 });
    await sleep(1_000);
    return true;
}

// Opens the first Hebrew conversation from the chat history. Depends on the
// manually-created chat fixture; returns 'pending' while it doesn't exist.
export async function openHebrewChatFromHistory(page) {
    try {
        await runPaletteCommand(page, 'Show Chat History');
        await sleep(1_500);
        const opened = await page.evaluate(() => {
            const items = Array.from(
                document.querySelectorAll('.compact-agent-history-react-menu-label, .quick-input-list .monaco-list-row')
            );
            const rtl = /[\u0590-\u05FF]/;
            const target = items.find((el) => rtl.test(el.textContent || ''));
            if (target) {
                target.click();
                return true;
            }
            return false;
        });
        if (opened) {
            await sleep(2_000);
            return 'ok';
        }
        await page.keyboard.press('Escape');
        return 'pending';
    } catch {
        return 'pending';
    }
}

async function clipOf(page, selector) {
    const box = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
    if (!box || box.width < 5 || box.height < 5) return null;
    return {
        x: Math.max(0, Math.round(box.x) - 4),
        y: Math.max(0, Math.round(box.y) - 4),
        width: Math.round(box.width) + 8,
        height: Math.round(box.height) + 8,
    };
}

// Real screenshots through CDP (plan §7.3 step 6). Missing panes are skipped
// (recorded in the returned map as null).
export async function captureScreens(page, outDir, which = ['full', 'chat-pane', 'composer', 'editor', 'preview']) {
    fs.mkdirSync(outDir, { recursive: true });
    const captured = {};
    for (const name of which) {
        const file = path.join(outDir, `${name}.png`);
        try {
            if (name === 'full' || name === 'agents') {
                await page.screenshot({ path: file, scale: 'css' });
                captured[name] = file;
                continue;
            }
            const selector = {
                'chat-pane': '[id="workbench.panel.aichat"], .pane-composite-part.auxiliarybar, .part.auxiliarybar',
                composer: '.aislash-editor-input, .ui-prompt-input-editor__input',
                editor: '.editor-group-container .monaco-editor',
                preview: '.webview.ready, .markdown-preview',
            }[name];
            const clip = await clipOf(page, selector);
            if (!clip) {
                captured[name] = null;
                continue;
            }
            await page.screenshot({ path: file, clip, scale: 'css' });
            captured[name] = file;
        } catch (err) {
            log(`screenshot ${name} failed:`, err.message);
            captured[name] = null;
        }
    }
    return captured;
}

export async function writeInspection(page, outDir, extra = {}) {
    const inspection = await page.evaluate(() => ({
        title: document.title,
        scanAllType: typeof window.__cursorRtlScanAll,
        styleInjected: Boolean(document.querySelector('style[data-cursor-rtl-style]')),
        dirRtlCount: document.querySelectorAll('[dir="rtl"]').length,
        dirAutoCount: document.querySelectorAll('[dir="auto"]').length,
        marks: performance.getEntriesByType('mark')
            .filter((m) => /didStartWorkbench|willStartWorkbench|didLoadWorkbenchMain/.test(m.name))
            .map((m) => ({ name: m.name, startTime: Math.round(m.startTime) })),
        timeOrigin: performance.timeOrigin,
    }));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
        path.join(outDir, 'inspection.json'),
        JSON.stringify({ capturedAt: new Date().toISOString(), ...inspection, ...extra }, null, 2) + '\n'
    );
    return inspection;
}

export function readStartupMark(pageInspection) {
    const mark = (pageInspection.marks ?? []).find((m) => m.name === 'code/didStartWorkbench');
    return mark ? mark.startTime : null;
}

// --- visual comparison (same mechanism as visual-cursor-compare.mjs) -----

export async function compareScenario(scenario, { approve = false, threshold = 0.02 } = {}) {
    const { PNG } = await import('pngjs');
    const { default: pixelmatch } = await import('pixelmatch');

    const actualDir = path.join(VISUAL_DIR, 'actual', scenario);
    const baselineDir = path.join(VISUAL_DIR, 'baseline', scenario);
    const diffDir = path.join(VISUAL_DIR, 'diff', scenario);

    if (!fs.existsSync(actualDir)) {
        return { status: 'no-actuals' };
    }
    const actuals = fs.readdirSync(actualDir).filter((f) => f.endsWith('.png'));

    if (approve || !fs.existsSync(baselineDir)) {
        fs.mkdirSync(baselineDir, { recursive: true });
        for (const f of actuals) {
            fs.copyFileSync(path.join(actualDir, f), path.join(baselineDir, f));
        }
        return { status: 'baseline-created', files: actuals };
    }

    const results = [];
    for (const f of actuals) {
        const baselinePath = path.join(baselineDir, f);
        if (!fs.existsSync(baselinePath)) {
            fs.copyFileSync(path.join(actualDir, f), baselinePath);
            results.push({ file: f, status: 'baseline-created' });
            continue;
        }
        const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
        const actual = PNG.sync.read(fs.readFileSync(path.join(actualDir, f)));
        if (baseline.width !== actual.width || baseline.height !== actual.height) {
            results.push({ file: f, status: 'size-mismatch' });
            continue;
        }
        const diff = new PNG({ width: baseline.width, height: baseline.height });
        const differentPixels = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
        const ratio = differentPixels / (baseline.width * baseline.height);
        fs.mkdirSync(diffDir, { recursive: true });
        fs.writeFileSync(path.join(diffDir, f), PNG.sync.write(diff));
        results.push({ file: f, status: ratio <= threshold ? 'pass' : 'fail', ratio });
    }
    const failed = results.filter((r) => r.status === 'fail' || r.status === 'size-mismatch');
    return { status: failed.length > 0 ? 'visual-diff' : 'pass', results };
}
