// Launches the isolated lab Cursor with CDP on port 9333 (plan §7.1).
//
//   node scripts/lab/launch.mjs [--glass] [--no-ext] [--vsix]
//
// - Default: loads the extension from this repo via --extensionDevelopmentPath.
// - --no-ext: launches without the extension (spike / clean runs).
// - --vsix:  relies on whatever is installed in the lab extensions dir
//            (install a VSIX there first with --install-extension).
// - --glass: also opens the Agents (glass) window.
//
// Waits until http://127.0.0.1:9333/json lists a workbench.html target, prints
// the targets, and exits (Cursor keeps running detached).

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LAB = 'C:\\cursor-rtl-lab';
const CURSOR_EXE = path.join(LAB, 'cursor', 'Cursor.exe');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CDP_PORT = 9333;

const argv = process.argv.slice(2);
const glass = argv.includes('--glass');
const noExt = argv.includes('--no-ext');
const vsix = argv.includes('--vsix');

export function buildArgs({ glass = false, noExt = false, vsix = false, devPath = null, dataDir = null } = {}) {
    const args = [
        `--user-data-dir=${dataDir ?? path.join(LAB, 'data')}`,
        `--extensions-dir=${path.join(LAB, 'ext')}`,
        `--remote-debugging-port=${CDP_PORT}`,
    ];
    if (devPath) {
        args.push(`--extensionDevelopmentPath=${devPath}`);
    } else if (!noExt && !vsix) {
        args.push(`--extensionDevelopmentPath=${REPO_ROOT}`);
        // e2e command bridge (see scripts/e2e/harness-ext) — loaded next to
        // the real extension so the suite can execute workbench commands
        // without relying on keyboard-driven UI automation.
        args.push(`--extensionDevelopmentPath=${path.join(REPO_ROOT, 'scripts', 'e2e', 'harness-ext')}`);
    }
    if (glass) {
        args.push('--glass');
    }
    args.push(path.join(LAB, 'workspace'));
    return args;
}

export async function fetchTargets() {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
    return res.json();
}

export async function waitForWorkbench({ timeoutMs = 90_000, minCount = 1 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const targets = await fetchTargets();
            const workbenches = targets.filter(
                (t) => t.type === 'page' && (t.url ?? '').includes('workbench.html')
            );
            if (workbenches.length >= minCount) {
                return targets;
            }
        } catch (err) {
            lastError = err;
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
        `Timed out waiting for workbench target on port ${CDP_PORT}` +
        (lastError ? ` (last error: ${lastError.message})` : '')
    );
}

export function launch(opts = {}) {
    const args = buildArgs(opts);
    console.log('[lab-launch]', CURSOR_EXE);
    for (const a of args) console.log('  ', a);
    // When this script itself runs inside an Electron-hosted shell (e.g. a
    // VS Code terminal), ELECTRON_RUN_AS_NODE leaks into the child and makes
    // Cursor parse our flags as Node options ("bad option: --user-data-dir").
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    const child = spawn(CURSOR_EXE, args, { detached: true, stdio: 'ignore', env });
    child.unref();
    return child;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    launch({ glass, noExt, vsix });
    const targets = await waitForWorkbench({ minCount: glass ? 2 : 1 });
    console.log('[lab-launch] CDP targets:');
    for (const t of targets) {
        console.log(`  [${t.type}] ${t.title ?? '(untitled)'} :: ${(t.url ?? '').slice(0, 100)}`);
    }
    console.log(`[lab-launch] ready on http://127.0.0.1:${CDP_PORT}`);
}
