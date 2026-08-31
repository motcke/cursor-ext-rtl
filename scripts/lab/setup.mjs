// Prepares the isolated Cursor lab under C:\cursor-rtl-lab (plan §7.1).
//
//   node scripts/lab/setup.mjs [--reset]
//
// - Copies the real Cursor install to C:\cursor-rtl-lab\cursor (once; --reset
//   deletes the copy first). The real install is only ever read.
// - In the copy: restores main.js from the newest main.js.rtl-backup-* and
//   deletes cursor-rtl-loader.cjs, so the lab starts from a clean install.
// - Snapshots clean workbench.js + product.json into C:\cursor-rtl-lab\clean\
//   for the cursor-update simulation.
// - Creates data\ (user-data-dir with settings.json), ext\ (extensions-dir)
//   and workspace\ (fixture files from scripts/lab/fixtures).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LAB = 'C:\\cursor-rtl-lab';
const LAB_CURSOR = path.join(LAB, 'cursor');
const LAB_CLEAN = path.join(LAB, 'clean');
const LAB_DATA = path.join(LAB, 'data');
const LAB_EXT = path.join(LAB, 'ext');
const LAB_WORKSPACE = path.join(LAB, 'workspace');

const SOURCE = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'cursor');
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const reset = process.argv.includes('--reset');

function log(...args) {
    console.log('[lab-setup]', ...args);
}

function copyInstall() {
    if (fs.existsSync(LAB_CURSOR)) {
        if (!reset) {
            log('lab copy already exists, skipping copy (use --reset to recreate)');
            return false;
        }
        log('removing existing lab copy...');
        fs.rmSync(LAB_CURSOR, { recursive: true, force: true });
    }

    if (!fs.existsSync(path.join(SOURCE, 'Cursor.exe'))) {
        throw new Error(`Cursor install not found at ${SOURCE}`);
    }

    log(`copying ${SOURCE} -> ${LAB_CURSOR} (robocopy, may take a few minutes)...`);
    const result = spawnSync(
        'robocopy',
        [SOURCE, LAB_CURSOR, '/E', '/MT:16', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NP'],
        { stdio: 'inherit' }
    );
    // robocopy exit codes 0-7 mean success.
    if (result.status === null || result.status > 7) {
        throw new Error(`robocopy failed with exit code ${result.status}`);
    }
    log('copy done');
    return true;
}

function cleanLabInstall() {
    const outDir = path.join(LAB_CURSOR, 'resources', 'app', 'out');

    const backups = fs
        .readdirSync(outDir)
        .filter((f) => f.startsWith('main.js.rtl-backup-'))
        .sort();
    if (backups.length > 0) {
        const latest = path.join(outDir, backups[backups.length - 1]);
        fs.copyFileSync(latest, path.join(outDir, 'main.js'));
        log(`restored main.js from ${backups[backups.length - 1]}`);
        for (const b of backups) {
            fs.rmSync(path.join(outDir, b));
        }
    }

    const loader = path.join(outDir, 'cursor-rtl-loader.cjs');
    if (fs.existsSync(loader)) {
        fs.rmSync(loader);
        log('deleted cursor-rtl-loader.cjs');
    }

    const mainJs = fs.readFileSync(path.join(outDir, 'main.js'), 'utf-8');
    if (mainJs.includes('cursor-rtl-loader.cjs')) {
        throw new Error('main.js still contains the legacy patch after restore');
    }
    log('lab main.js is clean');
}

function snapshotClean() {
    fs.mkdirSync(LAB_CLEAN, { recursive: true });
    const app = path.join(LAB_CURSOR, 'resources', 'app');
    const sources = {
        'preload.js': path.join(app, 'out', 'vs', 'base', 'parts', 'sandbox', 'electron-sandbox', 'preload.js'),
        'workbench.js': path.join(app, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.js'),
        'product.json': path.join(app, 'product.json'),
    };
    // Snapshot only once: a later setup run may find the lab copy already
    // patched, and re-snapshotting would contaminate the clean baseline.
    for (const [name, src] of Object.entries(sources)) {
        const dest = path.join(LAB_CLEAN, name);
        if (fs.existsSync(dest)) {
            if (fs.readFileSync(dest, 'utf-8').includes('cursor-rtl-injected')) {
                throw new Error(`${dest} is contaminated with the patch — delete ${LAB_CLEAN} and rerun setup on a clean lab`);
            }
            continue;
        }
        if (fs.readFileSync(src, 'utf-8').includes('cursor-rtl-injected')) {
            throw new Error(`lab ${name} is already patched — cannot take a clean snapshot`);
        }
        fs.copyFileSync(src, dest);
        log(`clean snapshot saved: ${name}`);
    }
}

function createDataDirs() {
    fs.mkdirSync(path.join(LAB_DATA, 'User'), { recursive: true });
    fs.mkdirSync(LAB_EXT, { recursive: true });

    // Rewritten on every setup run: settings are owned by the lab scripts
    // (the chat-history fixture lives elsewhere in data\ and is untouched).
    // dialogStyle=custom renders modal dialogs in the DOM so e2e can click
    // them through CDP; native dialogs would be invisible to it.
    const settingsPath = path.join(LAB_DATA, 'User', 'settings.json');
    fs.writeFileSync(
        settingsPath,
        JSON.stringify(
            {
                'update.mode': 'none',
                'workbench.startupEditor': 'none',
                'telemetry.telemetryLevel': 'off',
                'window.restoreWindows': 'none',
                'security.workspace.trust.enabled': false,
                'window.dialogStyle': 'custom',
            },
            null,
            4
        )
    );
    log('wrote lab settings.json');
}

function createWorkspace() {
    fs.mkdirSync(LAB_WORKSPACE, { recursive: true });
    for (const f of fs.readdirSync(FIXTURES)) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(LAB_WORKSPACE, f));
    }
    log(`workspace fixtures copied to ${LAB_WORKSPACE}`);
}

copyInstall();
cleanLabInstall();
snapshotClean();
createDataDirs();
createWorkspace();
log('setup complete');
