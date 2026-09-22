// Automated e2e suite for the renderer injection (plan §7.3).
//
//   npm run e2e                 -- run all scenarios
//   npm run e2e -- --scenario=cursor-update,disable
//   npm run e2e:approve         -- approve current actuals as baseline
//
// Every scenario drives the isolated lab (C:\cursor-rtl-lab) over CDP port
// 9333, captures real screenshots into visual/actual/<scenario>/ and compares
// them against visual/baseline/<scenario>/. Scenario asserts are listed next
// to each implementation. Scenarios that depend on the manually-created
// Hebrew chat history report 'pending' for those parts until it exists.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
    LAB, APP, PRELOAD_JS, PRELOAD_DIR, WORKBENCH_JS, RTL_DIR, PRODUCT_JSON, MAIN_JS, CLEAN,
    LAB_SETTINGS, REPO_ROOT, VISUAL_DIR, PATCH_MARKER, CHECKSUM_KEY,
    log, killLabCursor, sha256, readProductChecksum, isLabPatched, simulateCursorUpdate,
    sleep, waitFor, launchAndConnect, waitForWorkbenchDom, setWindowBounds,
    workbenchPages, currentWorkbenchPage, waitForRtlOn,
    runPaletteCommand, openFile, clearNotifications, getNotifications,
    clickDialogButton, clickNotificationButton, getRtlState, openChatPane,
    typeInComposer, openHebrewChatFromHistory, captureScreens, writeInspection,
    closeAllEditorTabs, resetAutoReloadGuard, execCommand, compareScenario,
    checkMixedTextFixture,
} from './lib.mjs';

const argv = process.argv.slice(2);
const approve = argv.includes('--approve');
const scenarioFilter = (argv.find((a) => a.startsWith('--scenario=')) ?? '').replace('--scenario=', '')
    .split(',').filter(Boolean);

const DATA_FIRST = path.join(LAB, 'data-first');
const results = [];
let historyStatus = 'pending';

function actualDir(scenario) {
    return path.join(VISUAL_DIR, 'actual', scenario);
}

function record(scenario, status, details, screenshots = []) {
    results.push({ scenario, status, details, screenshots });
    log(`RESULT ${scenario}: ${status}${details ? ` — ${details}` : ''}`);
}

function assertTrue(conditions) {
    const failed = Object.entries(conditions).filter(([, v]) => !v).map(([k]) => k);
    return failed;
}

function clearReadonly(p) {
    try {
        fs.chmodSync(p, 0o666);
    } catch {
        // best-effort
    }
}

function restoreCleanFiles() {
    // The permissions scenario leaves read-only attributes behind (a backup
    // taken from a read-only file inherits the attribute, and restoring that
    // backup spreads it) — clear them before writing.
    clearReadonly(PRELOAD_JS);
    fs.copyFileSync(path.join(CLEAN, 'preload.js'), PRELOAD_JS);
    fs.copyFileSync(path.join(CLEAN, 'workbench.js'), WORKBENCH_JS);
    fs.copyFileSync(path.join(CLEAN, 'product.json'), PRODUCT_JSON);
    for (const f of fs.readdirSync(PRELOAD_DIR)) {
        if (f.startsWith('preload.js.rtl-backup-')) {
            const p = path.join(PRELOAD_DIR, f);
            clearReadonly(p);
            try {
                fs.rmSync(p, { force: true });
            } catch {
                // best-effort
            }
        }
    }
    fs.rmSync(PRODUCT_JSON + '.rtl-backup', { force: true });
}

// Common per-scenario capture (plan §7.3 steps 3-7): chat pane + history
// conversation (pending until the fixture exists), Hebrew typed into the
// composer without sending, hebrew.md in Monaco + its Markdown preview.
async function captureCommon(page, scenario) {
    const dir = actualDir(scenario);
    fs.rmSync(dir, { recursive: true, force: true });

    // Restored "New Agent" tabs show a full-pane login prompt while the lab
    // profile is logged out; close every tab so the editor area is
    // deterministic and shortcuts reach the workbench.
    log('capture: close restored tabs');
    await closeAllEditorTabs(page);

    // File + preview first: once focus lands in the chat composer, Ctrl+P is
    // captured by the chat UI and Quick Open no longer opens.
    log('capture: open hebrew.md');
    await openFile(page, 'hebrew.md');
    log('capture: open markdown preview');
    await execCommand('markdown.showPreviewToSide').catch((e) => log('preview skipped:', e.message));
    await sleep(3_000);
    await clearNotifications(page);
    log('capture: open chat pane');
    await openChatPane(page);
    log('capture: open Hebrew chat from history');
    historyStatus = await openHebrewChatFromHistory(page);
    await openChatPane(page);
    log('capture: type in composer');
    const composerOk = await typeInComposer(page);
    await sleep(1_000);

    const shots = await captureScreens(page, dir);
    await writeInspection(page, dir, { historyStatus, composerOk });
    return { shots, composerOk };
}

async function captureFullOnly(page, scenario, name = 'full') {
    const dir = actualDir(scenario);
    fs.rmSync(dir, { recursive: true, force: true });
    await clearNotifications(page);
    await sleep(500);
    const shots = await captureScreens(page, dir, [name]);
    await writeInspection(page, dir);
    return shots;
}

// --- scenarios ----------------------------------------------------------

// first-install: fresh profile, clean lab → consent dialog → Enable → auto
// reload → RTL on, checksum matches, no "corrupt" notification.
async function scnFirstInstall() {
    killLabCursor();
    await sleep(1_500);
    restoreCleanFiles();
    fs.rmSync(path.join(RTL_DIR, 'cursor-rtl.js'), { force: true });
    fs.rmSync(path.join(RTL_DIR, 'cursor-rtl-config.json'), { force: true });
    fs.rmSync(DATA_FIRST, { recursive: true, force: true });
    fs.mkdirSync(path.join(DATA_FIRST, 'User'), { recursive: true });
    fs.copyFileSync(LAB_SETTINGS, path.join(DATA_FIRST, 'User', 'settings.json'));

    const { browser, context, page: initialPage } = await launchAndConnect({ dataDir: DATA_FIRST });
    await waitForWorkbenchDom(initialPage);
    await clickDialogButton(initialPage, 'Enable', 60_000);

    // Auto reload follows and replaces the CDP target; re-resolve the page.
    const page = await waitForRtlOn(context);
    await waitForWorkbenchDom(page);
    await sleep(3_000);

    const notifications = await getNotifications(page);
    const failed = assertTrue({
        markerInPreloadJs: fs.readFileSync(PRELOAD_JS, 'utf-8').includes(PATCH_MARKER),
        checksumMatches: readProductChecksum() === sha256(PRELOAD_JS),
        scanAllPresent: (await getRtlState(page)).scanAllType === 'function',
        noCorruptWarning: !notifications.some((n) => /corrupt/i.test(n)),
    });

    // The fresh profile shows Cursor's login/onboarding screen, which covers
    // the workbench UI — the rich capture set runs in cursor-update (main
    // profile) instead. Here a full screenshot documents the end state.
    await setWindowBounds(browser, page);
    const shots = await captureFullOnly(page, 'first-install');
    await browser.close();
    killLabCursor();

    record('first-install', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// Unreported bootstrap: make sure the MAIN profile has enabled at least once
// (sets everEnabled so later scenarios exercise the automatic path).
async function bootstrapMainProfile() {
    killLabCursor();
    await sleep(1_500);
    restoreCleanFiles();
    resetAutoReloadGuard();

    const { browser, context, page } = await launchAndConnect({});
    await waitForWorkbenchDom(page);
    // Either the first-install consent dialog (fresh profile) or an automatic
    // re-apply (everEnabled) happens; handle both.
    try {
        await clickDialogButton(page, 'Enable', 20_000);
    } catch {
        // no dialog — automatic path
    }
    try {
        await waitForRtlOn(context, 45_000);
    } catch {
        // The auto-reload guard (same Cursor version <10 min ago) suppresses
        // the reload and offers a notification instead — click it.
        const p = await currentWorkbenchPage(context);
        await clickNotificationButton(p, 'Reload Window', 15_000).catch(() => {});
        await waitForRtlOn(context, 60_000);
    }
    await browser.close();
    killLabCursor();
    log('main profile bootstrapped (patched, everEnabled)');
}

// migration-from-1.2: legacy main.js patch + loader present → startup cleans
// them, RTL stays active.
async function scnMigration() {
    killLabCursor();
    await sleep(1_500);

    // Forge the 1.2.4 state: backup, patch line after the copyright header,
    // loader file next to main.js.
    const mainContent = fs.readFileSync(MAIN_JS, 'utf-8');
    if (!mainContent.includes('cursor-rtl-loader.cjs')) {
        fs.copyFileSync(MAIN_JS, path.join(path.dirname(MAIN_JS), 'main.js.rtl-backup-20260830T000000'));
        const copyrightEnd = mainContent.indexOf('*/') + 2;
        const legacyLine = 'import{createRequire}from"module";try{createRequire(import.meta.url)("./cursor-rtl-loader.cjs")}catch(e){console.error("[Cursor RTL] error loading ./cursor-rtl-loader.cjs: ", e)}';
        fs.writeFileSync(MAIN_JS, mainContent.slice(0, copyrightEnd) + '\n' + legacyLine + mainContent.slice(copyrightEnd), 'utf-8');
    }
    fs.writeFileSync(path.join(path.dirname(MAIN_JS), 'cursor-rtl-loader.cjs'), '// legacy loader placeholder for migration e2e\n');

    const { browser, context } = await launchAndConnect({});
    const page = await waitForRtlOn(context);
    // Migration runs inside activate; give it a moment.
    await waitFor(() => !fs.readFileSync(MAIN_JS, 'utf-8').includes('cursor-rtl-loader.cjs'),
        { timeoutMs: 30_000, label: 'main.js restored' });

    const failed = assertTrue({
        mainJsRestored: !fs.readFileSync(MAIN_JS, 'utf-8').includes('cursor-rtl-loader.cjs'),
        loaderDeleted: !fs.existsSync(path.join(path.dirname(MAIN_JS), 'cursor-rtl-loader.cjs')),
        legacyBackupsRemoved: !fs.readdirSync(path.dirname(MAIN_JS)).some((f) => f.startsWith('main.js.rtl-backup-')),
        rtlActive: (await getRtlState(page)).scanAllType === 'function',
    });

    const shots = await captureFullOnly(page, 'migration-from-1.2');
    await browser.close();
    killLabCursor();
    record('migration-from-1.2', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// cursor-update: clean files dropped over a patched lab (as an update does)
// → extension re-patches and reloads by itself; reload happens at most once.
async function scnCursorUpdate() {
    killLabCursor();
    await sleep(1_500);
    simulateCursorUpdate();
    resetAutoReloadGuard();

    const { browser, context } = await launchAndConnect({});

    // Track reloads through performance.timeOrigin changes; the reload
    // replaces the CDP target, so poll whichever workbench page is alive.
    const timeOrigins = new Set();
    const started = Date.now();
    let autoReloaded = false;
    while (Date.now() - started < 90_000) {
        for (const p of workbenchPages(context)) {
            try {
                const s = await p.evaluate(() => ({
                    t: performance.timeOrigin,
                    scan: typeof window.__cursorRtlScanAll,
                }));
                timeOrigins.add(s.t);
                if (s.scan === 'function') {
                    autoReloaded = true;
                }
            } catch {
                // navigating / closed
            }
        }
        if (autoReloaded) break;
        await sleep(1_000);
    }

    let page = await currentWorkbenchPage(context);
    if (!autoReloaded) {
        // Auto-reload guard may have suppressed the reload (a previous suite
        // run patched the same Cursor version <10 minutes ago). The offered
        // notification path is the designed fallback: click it.
        try {
            await clickNotificationButton(page, 'Reload Window', 15_000);
            page = await waitForRtlOn(context);
        } catch {
            // fall through to asserts
        }
    }
    await waitForWorkbenchDom(page);
    await sleep(3_000);

    const failed = assertTrue({
        markerInPreloadJs: fs.readFileSync(PRELOAD_JS, 'utf-8').includes(PATCH_MARKER),
        checksumMatches: readProductChecksum() === sha256(PRELOAD_JS),
        rtlActive: (await getRtlState(page)).scanAllType === 'function',
        noReloadLoop: timeOrigins.size <= 2,
    });

    await setWindowBounds(browser, page);
    const { shots } = await captureCommon(page, 'cursor-update');
    await browser.close();
    killLabCursor();

    record('cursor-update', failed.length === 0 ? 'pass' : 'fail',
        [...failed, `reloads observed: ${Math.max(0, timeOrigins.size - 1)}`, autoReloaded ? 'auto-reload' : 'guarded → manual reload'].join(', '),
        Object.values(shots).filter(Boolean));
}

// agents-window: --glass opens the Agents window; the shared workbench.js
// patch must be active there (no extension host runs in it — plan §3.7).
async function scnAgentsWindow() {
    killLabCursor();
    await sleep(1_500);

    const { browser, page } = await launchAndConnect({ glass: true });
    await waitForWorkbenchDom(page);
    await sleep(5_000);

    const state = await getRtlState(page);
    const title = await page.evaluate(() => document.title);
    const failed = assertTrue({
        isAgentsWindow: /agents/i.test(title),
        scanAllPresent: state.scanAllType === 'function',
        styleInjected: state.styleInjected,
    });

    const dir = actualDir('agents-window');
    fs.rmSync(dir, { recursive: true, force: true });
    await setWindowBounds(browser, page);
    const shots = await captureScreens(page, dir, ['agents']);
    // Mixed HE/EN assistant markup must get per-block direction here too
    // (issue #18 reported the Agents window specifically).
    const mixed = await checkMixedTextFixture(page, dir);
    failed.push(...mixed.failed);
    shots.mixed = mixed.screenshot;
    await writeInspection(page, dir, { title, mixedDirs: mixed.dirs });
    await browser.close();
    killLabCursor();
    record('agents-window', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// second-window: a new window of the same instance also gets RTL.
async function scnSecondWindow() {
    killLabCursor();
    await sleep(1_500);

    const { browser, context, page } = await launchAndConnect({});
    await waitForWorkbenchDom(page);
    await sleep(3_000);

    await execCommand('workbench.action.newWindow');
    const secondPage = await waitFor(
        () => context.pages().find((p) => p !== page && p.url().includes('workbench.html')),
        { timeoutMs: 60_000, label: 'second window' }
    );
    await waitForWorkbenchDom(secondPage);
    await sleep(5_000);

    const first = await getRtlState(page);
    const second = await getRtlState(secondPage);
    const failed = assertTrue({
        firstWindowRtl: first.scanAllType === 'function',
        secondWindowRtl: second.scanAllType === 'function',
    });

    const dir = actualDir('second-window');
    fs.rmSync(dir, { recursive: true, force: true });
    const shots = await captureScreens(secondPage, dir, ['full']);
    // Same mixed HE/EN check as agents-window, in a regular IDE window.
    const mixed = await checkMixedTextFixture(secondPage, dir);
    failed.push(...mixed.failed);
    shots.mixed = mixed.screenshot;
    await writeInspection(secondPage, dir, { mixedDirs: mixed.dirs });
    await browser.close();
    killLabCursor();
    record('second-window', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// editor-mode: flipping cursorRtl.editorRtl to 'always' through settings.json
// reaches the open window without a reload (config fetch, §3.3 option 1).
async function scnEditorMode() {
    killLabCursor();
    await sleep(1_500);

    const settings = JSON.parse(fs.readFileSync(LAB_SETTINGS, 'utf-8'));
    delete settings['cursorRtl.editorRtl'];
    fs.writeFileSync(LAB_SETTINGS, JSON.stringify(settings, null, 4));

    const { browser, page } = await launchAndConnect({});
    await waitForWorkbenchDom(page);
    await waitFor(async () => (await getRtlState(page)).scanAllType === 'function',
        { timeoutMs: 90_000, label: 'RTL runtime' });
    await setWindowBounds(browser, page);
    await openFile(page, 'mixed.ts');
    await sleep(2_000);

    settings['cursorRtl.editorRtl'] = 'always';
    fs.writeFileSync(LAB_SETTINGS, JSON.stringify(settings, null, 4));

    let liveApply = true;
    try {
        await waitFor(
            () => page.evaluate(() => Boolean(document.querySelector('.monaco-editor[data-cursor-rtl-dir="rtl"]'))),
            { timeoutMs: 10_000, label: 'editor flips to RTL' }
        );
    } catch {
        liveApply = false;
    }

    const dir = actualDir('editor-mode');
    fs.rmSync(dir, { recursive: true, force: true });
    const shots = await captureScreens(page, dir, ['full', 'editor']);
    await writeInspection(page, dir, { liveApply });

    // Flip to 'off' and confirm the attribute clears live too. ('auto' would
    // keep mixed.ts RTL — the fixture is deliberately Hebrew-dominant.)
    settings['cursorRtl.editorRtl'] = 'off';
    fs.writeFileSync(LAB_SETTINGS, JSON.stringify(settings, null, 4));
    let reverts = true;
    try {
        await waitFor(
            () => page.evaluate(() => !document.querySelector('.monaco-editor[data-cursor-rtl-dir="rtl"]')),
            { timeoutMs: 15_000, label: 'editor reverts' }
        );
    } catch {
        reverts = false;
    }
    settings['cursorRtl.editorRtl'] = 'auto';
    fs.writeFileSync(LAB_SETTINGS, JSON.stringify(settings, null, 4));

    await browser.close();
    killLabCursor();
    const failed = assertTrue({ liveApplyWithin10s: liveApply, revertsOnOff: reverts });
    record('editor-mode', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// extension-update: installed cursor-rtl.js is older than the bundled one →
// refreshed on activation, workbench.js untouched, reload offered.
async function scnExtensionUpdate() {
    killLabCursor();
    await sleep(1_500);
    if (!isLabPatched()) {
        throw new Error('extension-update expects a patched lab (run after bootstrap)');
    }

    const installedRtl = path.join(RTL_DIR, 'cursor-rtl.js');
    const bundledVersion = (fs.readFileSync(path.join(REPO_ROOT, 'resources', 'rtl.js'), 'utf-8')
        .match(/var RTL_VERSION = "(\d+\.\d+\.\d+)"/) ?? [])[1];
    // Forge an install made by an older extension: both the script and the
    // bootstrap block carry the older version.
    fs.writeFileSync(installedRtl, fs.readFileSync(installedRtl, 'utf-8')
        .replace(/var RTL_VERSION = "\d+\.\d+\.\d+"/, 'var RTL_VERSION = "1.2.9"'), 'utf-8');
    fs.writeFileSync(PRELOAD_JS, fs.readFileSync(PRELOAD_JS, 'utf-8')
        .replace(/cursor-rtl-injected v=\d+\.\d+\.\d+/, 'cursor-rtl-injected v=1.2.9')
        .replace(/cursor-rtl\.js\?v=\d+\.\d+\.\d+/, 'cursor-rtl.js?v=1.2.9'), 'utf-8');

    const { browser, page } = await launchAndConnect({});
    await waitForWorkbenchDom(page);

    // Wait for the refresh while sampling notifications — toasts hide after
    // ~15s, so a one-shot read at the end can miss the Reload offer.
    const seenNotifications = new Set();
    const deadline = Date.now() + 90_000;
    let versionsOk = false;
    while (Date.now() < deadline) {
        for (const n of await getNotifications(page).catch(() => [])) {
            seenNotifications.add(n);
        }
        const rtlNow = (fs.readFileSync(installedRtl, 'utf-8').match(/var RTL_VERSION = "([\d.]+)"/) ?? [])[1];
        const bootNow = (fs.readFileSync(PRELOAD_JS, 'utf-8').match(/cursor-rtl-injected v=([\d.]+)/) ?? [])[1];
        if (rtlNow === bundledVersion && bootNow === bundledVersion) {
            versionsOk = true;
            if ([...seenNotifications].some((n) => /reload/i.test(n))) break;
        }
        await sleep(2_000);
    }
    const preloadAfter = fs.readFileSync(PRELOAD_JS, 'utf-8');

    const failed = assertTrue({
        scriptAndBootstrapRefreshed: versionsOk,
        singleBootstrapBlock: (preloadAfter.match(/cursor-rtl-injected v=/g) ?? []).length === 1,
        checksumMatches: readProductChecksum() === sha256(PRELOAD_JS),
        reloadOffered: [...seenNotifications].some((n) => /reload/i.test(n)),
    });

    const shots = await captureFullOnly(page, 'extension-update');
    await browser.close();
    killLabCursor();
    record('extension-update', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// permissions: read-only workbench.js → apply fails with a clear permission
// message and the file is untouched.
async function scnPermissions() {
    killLabCursor();
    await sleep(1_500);
    restoreCleanFiles();
    const cleanDigest = sha256(PRELOAD_JS);
    spawnSync('attrib', ['+R', PRELOAD_JS]);

    try {
        const { browser, page } = await launchAndConnect({});
        await waitForWorkbenchDom(page);
        // The automatic re-apply fails; wait for the error notification
        // (sampled continuously — toasts hide after ~15s).
        const notification = await waitFor(async () => {
            const all = await getNotifications(page);
            return all.find((n) => /permission denied/i.test(n)) ?? null;
        }, { timeoutMs: 60_000, label: 'permission error notification' });

        const failed = assertTrue({
            permissionMessageShown: /permission denied/i.test(notification ?? ''),
            preloadJsUntouched: sha256(PRELOAD_JS) === cleanDigest,
            notPatched: !isLabPatched(),
        });

        const shots = await captureFullOnly(page, 'permissions');
        await browser.close();
        killLabCursor();
        record('permissions', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
    } finally {
        spawnSync('attrib', ['-R', PRELOAD_JS]);
        // A backup taken while preload.js was read-only inherits the
        // attribute; restoring it later would spread read-only onward.
        // Drop such backups entirely.
        for (const f of fs.readdirSync(PRELOAD_DIR)) {
            if (f.startsWith('preload.js.rtl-backup-')) {
                const p = path.join(PRELOAD_DIR, f);
                spawnSync('attrib', ['-R', p]);
                try {
                    fs.rmSync(p, { force: true });
                } catch {
                    // best-effort
                }
            }
        }
    }
}

// disable: the Disable command restores workbench.js and product.json to the
// clean state, removes cursor-rtl.js, and after a reload no RTL remains.
// Re-enables at the end so the lab stays patched for later scenarios.
async function scnDisable() {
    killLabCursor();
    await sleep(1_500);
    // The lab may be unpatched after the permissions scenario; clear the
    // auto-reload guard so the automatic re-apply path can run right away.
    resetAutoReloadGuard();

    const { browser, context } = await launchAndConnect({});
    // The lab may be unpatched here — either the permissions scenario ran
    // before (auto re-apply kicks in) or an earlier disable left
    // rtlDisabledByUser set (no auto re-apply; enable explicitly).
    let page;
    try {
        page = await waitForRtlOn(context, 45_000);
    } catch {
        for (let i = 0; i < 4 && !isLabPatched(); i++) {
            await execCommand('cursorRtl.enable', [], { timeoutMs: 15_000 })
                .catch((e) => log('pre-enable attempt:', e.message));
            await sleep(3_000);
        }
        page = await waitForRtlOn(context, 90_000);
    }
    await waitForWorkbenchDom(page);
    await sleep(3_000);

    execCommand('cursorRtl.disable').catch(() => { /* resolves only after the dialog */ });
    await clickDialogButton(page, 'Disable', 30_000);
    await waitFor(() => !isLabPatched(), { timeoutMs: 30_000, label: 'patch removed' });
    await sleep(2_000);

    const cleanChecksum = JSON.parse(fs.readFileSync(path.join(CLEAN, 'product.json'), 'utf-8')).checksums[CHECKSUM_KEY];
    const fileAsserts = assertTrue({
        preloadMatchesClean: sha256(PRELOAD_JS) === sha256(path.join(CLEAN, 'preload.js')),
        checksumRestored: readProductChecksum() === cleanChecksum,
        rtlScriptDeleted: !fs.existsSync(path.join(RTL_DIR, 'cursor-rtl.js')),
        configDeleted: !fs.existsSync(path.join(RTL_DIR, 'cursor-rtl-config.json')),
    });

    // Reload and confirm no RTL runtime survives. The reload replaces the
    // CDP target — re-resolve the page afterwards.
    await clickNotificationButton(page, 'Reload Window', 20_000).catch(() => {});
    await sleep(8_000);
    page = await currentWorkbenchPage(context);
    await waitForWorkbenchDom(page);
    const after = await getRtlState(page);
    const failed = [
        ...fileAsserts,
        ...assertTrue({ noRtlAfterReload: after.scanAllType === 'undefined' && !after.styleInjected }),
    ];

    const shots = await captureFullOnly(page, 'disable');

    // Restore: enable again (no dialog — everEnabled is set). Retried — the
    // freshly reloaded window may not have activated the harness yet.
    for (let i = 0; i < 4 && !isLabPatched(); i++) {
        execCommand('cursorRtl.enable', [], { timeoutMs: 15_000 })
            .catch((e) => log('re-enable attempt:', e.message));
        try {
            await waitFor(() => isLabPatched(), { timeoutMs: 20_000, label: 're-enabled' });
        } catch {
            // retry
        }
    }
    if (!isLabPatched()) {
        throw new Error('could not re-enable the patch after the disable scenario');
    }
    await sleep(5_000);
    await browser.close();
    killLabCursor();

    record('disable', failed.length === 0 ? 'pass' : 'fail', failed.join(', '), Object.values(shots).filter(Boolean));
}

// startup: median code/didStartWorkbench over 5 patched and 5 clean runs
// (both without the extension, isolating the renderer cost of rtl.js).
async function scnStartup() {
    killLabCursor();
    await sleep(1_500);
    if (!isLabPatched()) {
        throw new Error('startup scenario expects a patched lab');
    }

    async function measureOnce() {
        // One retry: an occasional launch fails to expose CDP (port not
        // released fast enough after the previous kill).
        for (let attempt = 0; ; attempt++) {
            try {
                const { browser, page } = await launchAndConnect({ noExt: true });
                const mark = await waitFor(
                    () => page.evaluate(() => {
                        const m = performance.getEntriesByType('mark').find((x) => x.name === 'code/didStartWorkbench');
                        return m ? Math.round(m.startTime) : null;
                    }),
                    { timeoutMs: 120_000, label: 'didStartWorkbench mark' }
                );
                await browser.close();
                killLabCursor();
                await sleep(3_000);
                return mark;
            } catch (err) {
                killLabCursor();
                await sleep(5_000);
                if (attempt >= 1) throw err;
                log('startup run retry:', err.message);
            }
        }
    }

    // Interleave patched and clean runs (P C P C ...) so slow drift over the
    // measurement window (OS caches, background load) cancels out instead of
    // landing entirely on one side. Two blocks of 5 sequential runs showed
    // run-to-run medians straddling the threshold on pure noise.
    const stash = path.join(LAB, 'stash-startup');
    fs.mkdirSync(stash, { recursive: true });
    fs.copyFileSync(PRELOAD_JS, path.join(stash, 'preload.js'));
    fs.copyFileSync(PRODUCT_JSON, path.join(stash, 'product.json'));

    const setPatched = () => {
        fs.copyFileSync(path.join(stash, 'preload.js'), PRELOAD_JS);
        fs.copyFileSync(path.join(stash, 'product.json'), PRODUCT_JSON);
    };

    const patchedRuns = [];
    const cleanRuns = [];
    try {
        for (let i = 0; i < 5; i++) {
            setPatched();
            patchedRuns.push(await measureOnce());
            log(`startup patched run ${i + 1}: ${patchedRuns[i]}ms`);
            restoreCleanFiles();
            cleanRuns.push(await measureOnce());
            log(`startup clean run ${i + 1}: ${cleanRuns[i]}ms`);
        }
    } finally {
        setPatched();
        fs.rmSync(stash, { recursive: true, force: true });
    }

    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const delta = median(patchedRuns) - median(cleanRuns);
    const failed = assertTrue({ medianDeltaUnder100ms: delta < 100 });

    const dir = actualDir('startup');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'startup.json'), JSON.stringify({
        patchedRuns, cleanRuns,
        medianPatched: median(patchedRuns), medianClean: median(cleanRuns), deltaMs: delta,
    }, null, 2) + '\n');
    record('startup', failed.length === 0 ? 'pass' : 'fail',
        `median patched ${median(patchedRuns)}ms vs clean ${median(cleanRuns)}ms (delta ${delta}ms)`);
}

// --- driver -------------------------------------------------------------

const SCENARIOS = [
    ['first-install', scnFirstInstall],
    ['bootstrap-main', bootstrapMainProfile, { hidden: true }],
    ['migration-from-1.2', scnMigration],
    ['cursor-update', scnCursorUpdate],
    ['agents-window', scnAgentsWindow],
    ['second-window', scnSecondWindow],
    ['editor-mode', scnEditorMode],
    ['extension-update', scnExtensionUpdate],
    ['permissions', scnPermissions],
    ['disable', scnDisable],
    ['startup', scnStartup],
];

async function main() {
    if (approve && scenarioFilter.length === 0) {
        // Approve every scenario that has actuals.
        const actualRoot = path.join(VISUAL_DIR, 'actual');
        for (const scenario of fs.existsSync(actualRoot) ? fs.readdirSync(actualRoot) : []) {
            // Loose files from the legacy visual workflow live next to the
            // scenario directories — only directories are scenarios.
            if (!fs.statSync(path.join(actualRoot, scenario)).isDirectory()) {
                continue;
            }
            const res = await compareScenario(scenario, { approve: true });
            log(`approved baseline for ${scenario}: ${res.status}`);
        }
        return;
    }

    for (const [name, fn, opts] of SCENARIOS) {
        if (scenarioFilter.length > 0 && !scenarioFilter.includes(name) && !opts?.hidden) {
            continue;
        }
        if (opts?.hidden && scenarioFilter.length > 0 &&
            !scenarioFilter.some((s) => SCENARIOS.findIndex(([n]) => n === s) > SCENARIOS.findIndex(([n]) => n === name))) {
            continue;
        }
        log(`=== scenario: ${name} ===`);
        try {
            await fn();
        } catch (err) {
            // Best-effort failure screenshot before tearing the lab down.
            try {
                const { chromium } = await import('playwright');
                const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
                const p = b.contexts()[0]?.pages().find((pg) => pg.url().includes('workbench.html'));
                if (p) {
                    fs.mkdirSync(actualDir(name), { recursive: true });
                    await p.screenshot({ path: path.join(actualDir(name), 'failure.png'), scale: 'css' });
                }
                await b.close();
            } catch {
                // lab already gone
            }
            killLabCursor();
            if (!opts?.hidden) {
                record(name, 'fail', `exception: ${err.message}`);
            } else {
                log(`bootstrap failed: ${err.message}`);
            }
        }
    }

    // Visual comparison for scenarios that produced screenshots.
    for (const r of results) {
        if (r.screenshots.length === 0) continue;
        const cmp = await compareScenario(r.scenario, { approve: false });
        r.visual = cmp.status;
    }

    console.log('\n===== E2E RESULTS =====');
    for (const r of results) {
        console.log(`${r.status.toUpperCase().padEnd(5)} ${r.scenario.padEnd(20)} ${r.details ?? ''}${r.visual ? ` [visual: ${r.visual}]` : ''}`);
    }
    console.log(`chat-history fixture: ${historyStatus}`);
    fs.mkdirSync(VISUAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(VISUAL_DIR, 'e2e-results.json'), JSON.stringify({
        finishedAt: new Date().toISOString(),
        historyStatus,
        results,
    }, null, 2) + '\n');

    if (results.some((r) => r.status === 'fail')) {
        process.exitCode = 1;
    }
}

main().catch((err) => {
    console.error(err);
    killLabCursor();
    process.exit(1);
});
