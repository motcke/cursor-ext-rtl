import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// The Agents window runs only an allowlist of Cursor's own extensions, so this
// extension never runs there. An Agents window that was open while the patch
// went on (after a Cursor update, or on first enable) keeps running without
// the RTL runtime, and nothing inside Cursor lets an extension reload or close
// another window. A full restart is the one thing that reaches it.

const STATUS_TIMEOUT_MS = 20_000;
const RELAUNCH_WAIT_MS = 60_000;

// <userData>/User/globalStorage/<publisher.name> → <userData>, as the exact
// string Cursor built it from. Cursor finds its running instance by a hash of
// that string, so case matters. Uri.fsPath lowercases a Windows drive letter
// ("c:\..."), which matches no instance; Uri.path keeps the original
// ("/C:/..."), so the native path is rebuilt from it instead.
function getUserDataDir(context: vscode.ExtensionContext): string {
    return path.join(uriPathToNative(context.globalStorageUri.path), '..', '..', '..');
}

// Uri.path is always "/"-separated: "/C:/Users/..." on Windows,
// "/Users/..." on macOS and Linux. Only Windows needs the leading "/"
// before the drive letter dropped; then each "/" becomes the OS separator.
function uriPathToNative(uriPath: string): string {
    const withoutDriveSlash = process.platform === 'win32'
        ? uriPath.replace(/^\/([A-Za-z]:)/, '$1')
        : uriPath;
    return withoutDriveSlash.split('/').join(path.sep);
}

function getCliPath(): string | null {
    const bin = path.join(vscode.env.appRoot, 'bin');
    const candidates = process.platform === 'win32'
        ? ['cursor.cmd']
        : ['cursor'];
    for (const name of candidates) {
        const p = path.join(bin, name);
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

// Env for processes that must not inherit the extension host's identity:
// VSCODE_* variables (entry points, IPC handles, NLS config) would make a new
// Cursor main process or CLI behave like a child of this extension host.
function cleanEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('VSCODE_') || key.startsWith('CURSOR_') || key === 'ELECTRON_RUN_AS_NODE') {
            continue;
        }
        env[key] = value;
    }
    return env;
}

// Window titles from `cursor --status`, which asks the running Cursor main
// process for its process tree: lines like "window [1] (Cursor Agents)".
// null when the status could not be read.
function getOpenWindowTitles(context: vscode.ExtensionContext): Promise<string[] | null> {
    const cli = getCliPath();
    if (!cli) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        let out = '';
        let settled = false;
        const finish = (value: string[] | null) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        try {
            const child = spawn(
                `"${cli}"`,
                ['--status', `"--user-data-dir=${getUserDataDir(context)}"`],
                { shell: true, windowsHide: true, env: cleanEnv() }
            );
            const timer = setTimeout(() => {
                child.kill();
                finish(null);
            }, STATUS_TIMEOUT_MS);
            child.stdout?.on('data', (d) => (out += d.toString()));
            child.on('error', () => {
                clearTimeout(timer);
                finish(null);
            });
            child.on('close', () => {
                clearTimeout(timer);
                // The process table is sometimes missing from the output
                // (seen once on 3.30.8); report that as unknown.
                const titles = [...out.matchAll(/\bwindow \[\d+\] \((.*)\)\s*$/gm)].map((m) => m[1]);
                finish(out.includes('cursor main') && titles.length > 0 ? titles : null);
            });
        } catch {
            finish(null);
        }
    });
}

// true / false when known, null when the window list could not be read.
export async function isAgentsWindowOpen(context: vscode.ExtensionContext): Promise<boolean | null> {
    const titles = (await getOpenWindowTitles(context)) ?? (await getOpenWindowTitles(context));
    if (!titles) {
        return null;
    }
    return titles.some((t) => /^Cursor Agents\b/.test(t) || /\bCursor Agents$/.test(t));
}

interface LaunchCommand {
    exe: string;
    // Arguments placed before the Cursor arguments (macOS: `open -a <app> --args`).
    prefix: string[];
}

function getLaunchCommand(): LaunchCommand | null {
    const appRoot = vscode.env.appRoot;
    if (process.platform === 'darwin') {
        // .../Cursor.app/Contents/Resources/app → .../Cursor.app, started
        // through LaunchServices like a Dock click (activation, Dock icon).
        const bundle = path.resolve(appRoot, '..', '..', '..');
        return bundle.endsWith('.app') && fs.existsSync(bundle)
            ? { exe: '/usr/bin/open', prefix: ['-a', bundle, '--args'] }
            : null;
    }
    const exe = getAppExecutable();
    return exe ? { exe, prefix: [] } : null;
}

function getAppExecutable(): string | null {
    const appRoot = vscode.env.appRoot;
    const candidates: string[] = [];
    if (process.platform === 'win32') {
        // The extension host is a utility process of the main executable.
        candidates.push(process.execPath, path.resolve(appRoot, '..', '..', 'Cursor.exe'));
    } else {
        if (process.env.APPIMAGE) {
            candidates.push(process.env.APPIMAGE);
        }
        candidates.push(path.resolve(appRoot, '..', '..', 'cursor'));
    }
    for (const p of candidates) {
        if (p && fs.existsSync(p) && (process.platform !== 'win32' || /cursor\.exe$/i.test(p))) {
            return p;
        }
    }
    return null;
}

function getRelaunchArgs(context: vscode.ExtensionContext): string[] {
    const args = [`--user-data-dir=${getUserDataDir(context)}`];
    if (context.extensionMode === vscode.ExtensionMode.Development) {
        args.push(`--extensionDevelopmentPath=${context.extensionPath}`);
    } else {
        args.push(`--extensions-dir=${path.dirname(context.extensionPath)}`);
    }
    return args;
}

// Waits (detached, outside Cursor) for the main process to exit, then starts
// Cursor again. If the quit is cancelled (an unsaved-file prompt), the helper
// gives up after RELAUNCH_WAIT_MS without starting anything.
const RELAUNCH_HELPER = `
const { spawn } = require('child_process');
const [pid, exe, args, waitMs] = JSON.parse(process.argv[process.argv.length - 1]);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const deadline = Date.now() + waitMs;
(function tick() {
    let alive = true;
    try { process.kill(pid, 0); } catch { alive = false; }
    if (!alive) {
        setTimeout(() => {
            spawn(exe, args, { detached: true, stdio: 'ignore', env }).unref();
            process.exit(0);
        }, 1000);
        return;
    }
    if (Date.now() > deadline) process.exit(0);
    setTimeout(tick, 300);
})();
`;

// Returns false when Cursor can't be restarted from here (unknown executable);
// the caller then asks the user to restart by hand.
export async function restartCursor(context: vscode.ExtensionContext): Promise<boolean> {
    const launch = getLaunchCommand();
    if (!launch) {
        return false;
    }
    const env = cleanEnv();
    env.ELECTRON_RUN_AS_NODE = '1';
    const payload = JSON.stringify([
        process.ppid,
        launch.exe,
        [...launch.prefix, ...getRelaunchArgs(context)],
        RELAUNCH_WAIT_MS,
    ]);
    const helper = spawn(process.execPath, ['-e', RELAUNCH_HELPER, payload], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env,
    });
    helper.unref();
    await vscode.commands.executeCommand('workbench.action.quit');
    return true;
}
