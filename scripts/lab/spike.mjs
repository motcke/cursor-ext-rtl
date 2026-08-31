// One-off spike (plan §7.2): applies §3.1/§3.2/§3.5 to the LAB copy with plain
// Node code (no extension), launches the lab with CDP, and runs the six checks
// from the plan's spike table.
//
//   node scripts/lab/spike.mjs [--skip-patch] [--keep-open]
//
// Never touches the real install; everything happens under C:\cursor-rtl-lab.
//
// Flow: launch a regular window first (checks 1, 3, 4, 5 and probe-extension
// sanity), then open the Agents window from the same instance via the --glass
// CLI flag (checks 2 and 6). Console output is collected through a raw CDP
// Runtime.enable, which replays messages buffered since page load — no reload
// needed.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launch, buildArgs, waitForWorkbench, CDP_PORT } from './launch.mjs';
import { spawn } from 'node:child_process';

const LAB = 'C:\\cursor-rtl-lab';
const APP = path.join(LAB, 'cursor', 'resources', 'app');
const CURSOR_EXE = path.join(LAB, 'cursor', 'Cursor.exe');
const PRELOAD_JS = path.join(APP, 'out', 'vs', 'base', 'parts', 'sandbox', 'electron-sandbox', 'preload.js');
const RTL_DIR = path.join(APP, 'out', 'vs', 'workbench');
const PRODUCT_JSON = path.join(APP, 'product.json');
const CLEAN = path.join(LAB, 'clean');
const PROBE_DIR = path.join(LAB, 'probe');
const PROBE_LOG = path.join(LAB, 'spike-exthost.log');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CHECKSUM_KEY = 'vs/base/parts/sandbox/electron-sandbox/preload.js';

// Same bootstrap the extension installs (see src/constants.ts). The original
// spike patched workbench.js; that was abandoned after the reload-cache
// finding (plan §3.1) and this script now mirrors the preload approach.
function buildBootstrap(rtlVersion) {
    return `
;(function(){/* cursor-rtl-injected v=${rtlVersion} */
    function inject() {
        try {
            var policy = null;
            if (typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy) {
                policy = trustedTypes.createPolicy('amdLoader', { createScriptURL: function (u) { return u; } });
            }
            var s = document.createElement('script');
            var url = '../../../workbench/cursor-rtl.js?v=${rtlVersion}';
            s.src = policy ? policy.createScriptURL(url) : url;
            s.setAttribute('data-cursor-rtl-bootstrap', '${rtlVersion}');
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            console.error('[Cursor RTL] bootstrap failed:', e);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();/* cursor-rtl-end */
`;
}

const skipPatch = process.argv.includes('--skip-patch');
const keepOpen = process.argv.includes('--keep-open');

function log(...args) {
    console.log('[spike]', ...args);
}

function killLabCursor() {
    spawnSync('powershell', [
        '-NoProfile', '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='Cursor.exe'\" | " +
        "Where-Object { $_.ExecutablePath -like 'C:\\cursor-rtl-lab\\*' } | " +
        'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ]);
}

function sha256Base64NoPad(filePath) {
    return createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('base64')
        .replace(/=+$/, '');
}

function applySpikePatch() {
    // Always start from the clean snapshots so the spike is idempotent.
    fs.copyFileSync(path.join(CLEAN, 'preload.js'), PRELOAD_JS);
    fs.copyFileSync(path.join(CLEAN, 'product.json'), PRODUCT_JSON);

    const rtlVersion = (fs.readFileSync(path.join(REPO_ROOT, 'resources', 'rtl.js'), 'utf-8')
        .match(/var RTL_VERSION = "(\d+\.\d+\.\d+)"/) ?? [null, '0.0.0'])[1];
    const content = fs.readFileSync(PRELOAD_JS, 'utf-8');
    const anchor = '//# sourceMappingURL=';
    const idx = content.indexOf(anchor);
    if (idx === -1) throw new Error('preload.js has no sourceMappingURL anchor');
    const block = buildBootstrap(rtlVersion);
    const patched = content.slice(0, idx) + block + content.slice(idx);
    fs.writeFileSync(PRELOAD_JS, patched, 'utf-8');
    log('patched preload.js with bootstrap v=' + rtlVersion);

    fs.copyFileSync(path.join(REPO_ROOT, 'resources', 'rtl.js'), path.join(RTL_DIR, 'cursor-rtl.js'));
    fs.writeFileSync(path.join(RTL_DIR, 'cursor-rtl-config.json'), JSON.stringify({ editorRtl: 'auto' }));
    log('wrote cursor-rtl.js + cursor-rtl-config.json to', RTL_DIR);

    const product = JSON.parse(fs.readFileSync(PRODUCT_JSON, 'utf-8'));
    product.checksums[CHECKSUM_KEY] = sha256Base64NoPad(PRELOAD_JS);
    fs.writeFileSync(PRODUCT_JSON, JSON.stringify(product, null, '\t'), 'utf-8');
    log('updated product.json checksum:', product.checksums[CHECKSUM_KEY]);
}

function writeProbeExtension() {
    // Minimal extension used only to answer "does the glass window run an
    // extension host that activates onStartupFinished extensions?" (§3.7).
    fs.mkdirSync(PROBE_DIR, { recursive: true });
    fs.writeFileSync(
        path.join(PROBE_DIR, 'package.json'),
        JSON.stringify({
            name: 'spike-probe',
            publisher: 'lab',
            version: '0.0.1',
            engines: { vscode: '^1.85.0' },
            main: './extension.js',
            activationEvents: ['onStartupFinished'],
        }, null, 2)
    );
    fs.writeFileSync(
        path.join(PROBE_DIR, 'extension.js'),
        [
            "const fs = require('fs');",
            "const vscode = require('vscode');",
            "const LOG = '" + PROBE_LOG.replace(/\\/g, '\\\\') + "';",
            "const TRIGGER = '" + path.join(LAB, 'glass-trigger.txt').replace(/\\/g, '\\\\') + "';",
            'let timer;',
            'exports.activate = function () {',
            '    fs.appendFileSync(LOG,',
            "        JSON.stringify({ pid: process.pid, time: new Date().toISOString() }) + '\\n');",
            '    timer = setInterval(function () {',
            '        if (!fs.existsSync(TRIGGER)) return;',
            '        try { fs.rmSync(TRIGGER); } catch (e) { return; }',
            "        vscode.commands.executeCommand('cursor.openOrFocusGlassWindow').then(",
            "            function () { fs.appendFileSync(LOG, JSON.stringify({ glassCommand: 'ok', pid: process.pid }) + '\\n'); },",
            "            function (err) { fs.appendFileSync(LOG, JSON.stringify({ glassCommand: String(err), pid: process.pid }) + '\\n'); }",
            '        );',
            '    }, 500);',
            '};',
            'exports.deactivate = function () { clearInterval(timer); };',
        ].join('\n')
    );
    fs.rmSync(PROBE_LOG, { force: true });
    fs.rmSync(path.join(LAB, 'glass-trigger.txt'), { force: true });
    log('probe extension written to', PROBE_DIR);
}

function readProbeLog() {
    try {
        return fs.readFileSync(PROBE_LOG, 'utf-8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch {
        return [];
    }
}

async function collectConsole(page, settleMs = 3_000) {
    // Runtime.enable replays console messages buffered since page load.
    const messages = [];
    const session = await page.context().newCDPSession(page);
    session.on('Runtime.consoleAPICalled', (ev) => {
        if (ev.type !== 'error' && ev.type !== 'warning') return;
        const text = (ev.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
        messages.push(`[${ev.type}] ${text}`);
    });
    session.on('Runtime.exceptionThrown', (ev) => {
        messages.push(`[exception] ${ev.exceptionDetails?.text ?? ''} ${ev.exceptionDetails?.exception?.description ?? ''}`);
    });
    await session.send('Runtime.enable');
    await new Promise((r) => setTimeout(r, settleMs));
    await session.detach().catch(() => {});
    return messages;
}

async function probePage(page) {
    const consoleMessages = await collectConsole(page);
    const state = await page.evaluate(async () => {
        const configUrl = new URL('../../../workbench/cursor-rtl-config.json', document.baseURI).href;
        let fetchResult;
        try {
            const res = await fetch(configUrl);
            fetchResult = { ok: res.ok, status: res.status, body: res.ok ? await res.text() : null };
        } catch (err) {
            fetchResult = { ok: false, status: null, error: String(err) };
        }
        const notifications = Array.from(
            document.querySelectorAll('.notification-toast, .notifications-list-container .notification-list-item')
        ).map((el) => (el.textContent || '').trim()).filter(Boolean);
        return {
            title: document.title,
            scanAllType: typeof window.__cursorRtlScanAll,
            styleInjected: Boolean(document.querySelector('style[data-cursor-rtl-style]')),
            workbenchBuilt: Boolean(document.querySelector('.monaco-workbench')),
            fetchResult,
            notifications,
        };
    });
    const badConsole = consoleMessages.filter((m) =>
        /content security policy|trusted types?|failed to fetch|refused to/i.test(m) ||
        /cursor-rtl(?!-lab)/i.test(m)
    );
    return { ...state, consoleCount: consoleMessages.length, badConsole };
}

async function waitFor(fn, { timeoutMs = 60_000, intervalMs = 1_000, label = 'condition' } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = await fn();
        if (value) return value;
        await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`timed out waiting for ${label}`);
}

async function main() {
    killLabCursor();
    await new Promise((r) => setTimeout(r, 2_000));

    if (!skipPatch) {
        applySpikePatch();
    }
    writeProbeExtension();

    // --- Phase 1: regular window ---
    launch({ devPath: PROBE_DIR });
    await waitForWorkbench({ minCount: 1, timeoutMs: 120_000 });

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    const context = browser.contexts()[0];
    if (!context) throw new Error('no CDP context');

    const mainPage = await waitFor(
        () => context.pages().find((p) => p.url().includes('workbench.html')),
        { label: 'main workbench page' }
    );
    await waitFor(
        () => mainPage.evaluate(() => Boolean(document.querySelector('.monaco-workbench'))).catch(() => false),
        { label: 'main workbench DOM' }
    );
    await new Promise((r) => setTimeout(r, 5_000));
    const mainReport = await probePage(mainPage);
    const probeAfterMain = readProbeLog();

    // --- Phase 2: open the Agents (glass) window in the same instance, by
    // asking the probe extension to run cursor.openOrFocusGlassWindow ---
    fs.writeFileSync(path.join(LAB, 'glass-trigger.txt'), 'go');

    let glassReport = null;
    let probeAfterGlass = probeAfterMain;
    try {
        const glassPage = await waitFor(
            async () => {
                const pages = context.pages().filter((p) => p.url().includes('workbench.html'));
                for (const p of pages) {
                    if (p === mainPage) continue;
                    return p;
                }
                return null;
            },
            { timeoutMs: 60_000, label: 'glass workbench page' }
        );
        await waitFor(
            () => glassPage.evaluate(() => Boolean(document.querySelector('.monaco-workbench'))).catch(() => false),
            { label: 'glass workbench DOM' }
        );
        // Give a potential glass extension host generous time to spin up and
        // activate onStartupFinished extensions before concluding it has none.
        await new Promise((r) => setTimeout(r, 25_000));
        glassReport = await probePage(glassPage);
        probeAfterGlass = readProbeLog();
    } catch (err) {
        log('glass window did not appear:', err.message);
    }

    console.log('\n===== SPIKE RESULTS =====');
    const printReport = (name, r) => {
        if (!r) {
            console.log(`\n--- ${name}: WINDOW DID NOT OPEN`);
            return;
        }
        console.log(`\n--- ${name} (title: ${r.title})`);
        console.log(`  __cursorRtlScanAll: ${r.scanAllType}`);
        console.log(`  rtl <style> injected: ${r.styleInjected}`);
        console.log(`  workbench built: ${r.workbenchBuilt}`);
        console.log(`  config fetch: ${JSON.stringify(r.fetchResult)}`);
        console.log(`  notifications: ${JSON.stringify(r.notifications)}`);
        console.log(`  console messages (err/warn): ${r.consoleCount}, suspicious: ${r.badConsole.length}`);
        for (const m of r.badConsole) console.log(`    ${m}`);
    };
    printReport('main window', mainReport);
    printReport('glass window', glassReport);
    const activations = (entries) => entries.filter((e) => e.time);
    console.log(`\nprobe activations after main window: ${activations(probeAfterMain).length}`);
    console.log(`probe activations after glass window: ${activations(probeAfterGlass).length}`);
    for (const e of probeAfterGlass) console.log(`  ${JSON.stringify(e)}`);

    await browser.close();
    if (!keepOpen) {
        killLabCursor();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
