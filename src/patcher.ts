import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import {
    buildBootstrap,
    PATCH_MARKER,
    BOOTSTRAP_VERSION_RE,
    BOOTSTRAP_BLOCK_RE,
    RTL_FILENAME,
    CONFIG_FILENAME,
    CHECKSUM_KEY,
    BACKUP_PREFIX,
    LEGACY_MARKER,
    LEGACY_LOADER_FILENAME,
    LEGACY_BACKUP_PREFIX,
} from './constants';

const SOURCEMAP_ANCHOR = '//# sourceMappingURL=';
const TAIL_CHECK_BYTES = 4096;

// The bootstrap block lives at the end of preload.js, so only the tail needs
// to be read; this also keeps the check exact — a marker mentioned anywhere
// else wouldn't count.
export function isPatched(preloadJsPath: string): boolean {
    try {
        const fd = fs.openSync(preloadJsPath, 'r');
        try {
            const size = fs.fstatSync(fd).size;
            const readSize = Math.min(size, TAIL_CHECK_BYTES);
            const buf = Buffer.alloc(readSize);
            fs.readSync(fd, buf, 0, readSize, size - readSize);
            return buf.toString('utf-8').includes(PATCH_MARKER);
        } finally {
            fs.closeSync(fd);
        }
    } catch {
        return false;
    }
}

// Version of the bootstrap block currently installed in preload.js, or null.
export function getInstalledBootstrapVersion(preloadJsPath: string): string | null {
    try {
        const content = fs.readFileSync(preloadJsPath, 'utf-8');
        const match = content.match(BOOTSTRAP_VERSION_RE);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

function backupName(productVersion: string): string {
    return BACKUP_PREFIX + productVersion;
}

function listBackups(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(BACKUP_PREFIX))
            .sort();
    } catch {
        return [];
    }
}

function stripBootstrap(content: string): string {
    return content.replace(BOOTSTRAP_BLOCK_RE, '\n');
}

// Appends the bootstrap block to preload.js (before the sourcemap comments).
// Idempotent per rtl version: an existing block with the same version is left
// alone, an older one is replaced (that's how an extension update bumps the
// script tag's ?v= cache-buster). Keeps one backup per Cursor version.
// Refuses to patch a file that no longer looks like the sandbox preload.
export function applyPatch(preloadJsPath: string, productVersion: string, rtlVersion: string): void {
    const content = fs.readFileSync(preloadJsPath, 'utf-8');

    if (content.includes(`cursor-rtl-injected v=${rtlVersion} `)) {
        return;
    }

    if (!content.includes('electron')) {
        throw new Error(
            'preload.js does not look like the expected Electron sandbox preload. ' +
            'This Cursor version may be unsupported.'
        );
    }

    const dir = path.dirname(preloadJsPath);
    const backupPath = path.join(dir, backupName(productVersion));
    if (!fs.existsSync(backupPath) && !content.includes(PATCH_MARKER)) {
        fs.copyFileSync(preloadJsPath, backupPath);
    }

    try {
        const base = stripBootstrap(content);
        const block = buildBootstrap(rtlVersion);
        const idx = base.indexOf(SOURCEMAP_ANCHOR);
        const patched =
            idx === -1
                ? base + '\n' + block
                : base.slice(0, idx) + block + base.slice(idx);
        fs.writeFileSync(preloadJsPath, patched, 'utf-8');
    } catch (err) {
        // Roll back only when the write actually landed partially — a failed
        // write (e.g. EPERM on a read-only file) leaves the file untouched,
        // and attempting a rollback then would fail for the same reason and
        // mask the original error's code.
        try {
            if (
                fs.existsSync(backupPath) &&
                fs.readFileSync(preloadJsPath, 'utf-8') !== content
            ) {
                fs.copyFileSync(backupPath, preloadJsPath);
            }
        } catch (rollbackErr) {
            throw new Error(
                `Patch failed and rollback also failed. Backup is at: ${backupPath}. ` +
                `Original error: ${err}. Rollback error: ${rollbackErr}`
            );
        }
        throw err;
    }
}

// Restores preload.js: prefer the backup taken for this exact Cursor
// version, fall back to stripping the bootstrap block.
export function removePatch(preloadJsPath: string, productVersion: string): void {
    const dir = path.dirname(preloadJsPath);
    const exactBackup = path.join(dir, backupName(productVersion));

    if (fs.existsSync(exactBackup)) {
        fs.copyFileSync(exactBackup, preloadJsPath);
    } else {
        const content = fs.readFileSync(preloadJsPath, 'utf-8');
        if (content.includes(PATCH_MARKER)) {
            fs.writeFileSync(preloadJsPath, stripBootstrap(content), 'utf-8');
        }
    }

    for (const b of listBackups(dir)) {
        try {
            fs.rmSync(path.join(dir, b));
        } catch {
            // best-effort
        }
    }
}

export function sha256Base64NoPad(filePath: string): string {
    return createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('base64')
        .replace(/=+$/, '');
}

// Rewrites product.json's checksum entry for preload.js so Cursor's
// integrity check accepts the patched file. JSON.stringify with tabs matches
// the original formatting so a human diff shows one changed line.
export function updateChecksum(productJsonPath: string, patchedFilePath: string): void {
    const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));
    if (!product.checksums || typeof product.checksums !== 'object') {
        return;
    }
    product.checksums[CHECKSUM_KEY] = sha256Base64NoPad(patchedFilePath);
    fs.writeFileSync(productJsonPath, JSON.stringify(product, null, '\t') + '\n', 'utf-8');
}

// Restores product.json's checksum on Disable by recomputing it from the
// (already restored) preload.js — correct for any Cursor version, so no
// product.json backup is needed.
export function restoreChecksum(productJsonPath: string, patchedFilePath: string): void {
    const current = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));

    if (current.checksums && typeof current.checksums === 'object') {
        current.checksums[CHECKSUM_KEY] = sha256Base64NoPad(patchedFilePath);
        fs.writeFileSync(productJsonPath, JSON.stringify(current, null, '\t') + '\n', 'utf-8');
    }
}

export function copyRtlScript(rtlDir: string, extensionPath: string): void {
    const src = path.join(extensionPath, 'resources', 'rtl.js');
    const dest = path.join(rtlDir, RTL_FILENAME);
    fs.copyFileSync(src, dest);
}

export function removeRtlFiles(rtlDir: string): void {
    for (const f of [RTL_FILENAME, CONFIG_FILENAME]) {
        try {
            const p = path.join(rtlDir, f);
            if (fs.existsSync(p)) {
                fs.rmSync(p);
            }
        } catch {
            // best-effort
        }
    }
}

const RTL_VERSION_RE = /var RTL_VERSION = "(\d+\.\d+\.\d+)"/;

// Reads the machine-readable version marker from an rtl.js file. Returns null
// when the file is missing or predates the marker.
export function getRtlScriptVersion(rtlScriptPath: string): string | null {
    try {
        const content = fs.readFileSync(rtlScriptPath, 'utf-8');
        const match = content.match(RTL_VERSION_RE);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

export function getDryRunSummary(preloadJsPath: string, rtlDir: string): string[] {
    const actions: string[] = [];

    if (isPatched(preloadJsPath)) {
        actions.push('RTL patch is already present in preload.js');
    } else {
        actions.push(`Backup preload.js → ${BACKUP_PREFIX}<cursor version>`);
        actions.push('Append a small loader block to preload.js (loads the RTL script in every window)');
    }

    const rtlDest = path.join(rtlDir, RTL_FILENAME);
    actions.push(`${fs.existsSync(rtlDest) ? 'Update' : 'Write'} RTL script: ${rtlDest}`);
    actions.push('Update the preload.js checksum in product.json');

    return actions;
}

// --- 1.2.x migration (plan §3.8) ---------------------------------------

export function isLegacyPatched(mainJsPath: string): boolean {
    try {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        return content.includes(LEGACY_MARKER);
    } catch {
        return false;
    }
}

// Undoes the 1.2.x main-process patch: restores the newest main.js backup
// (or strips the patch line) and deletes the loader. Callers swallow errors —
// the leftover patch is harmless (rtl.js's re-injection guard) and the next
// Cursor update wipes it anyway.
export function removeLegacyPatch(mainJsPath: string): void {
    const dir = path.dirname(mainJsPath);

    const backups = (() => {
        try {
            return fs
                .readdirSync(dir)
                .filter((f) => f.startsWith(LEGACY_BACKUP_PREFIX))
                .sort();
        } catch {
            return [];
        }
    })();

    if (backups.length > 0) {
        fs.copyFileSync(path.join(dir, backups[backups.length - 1]), mainJsPath);
        for (const b of backups) {
            try {
                fs.rmSync(path.join(dir, b));
            } catch {
                // best-effort
            }
        }
    } else {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        if (content.includes(LEGACY_MARKER)) {
            const stripped = content
                .split('\n')
                .filter((line) => !line.includes(LEGACY_MARKER))
                .join('\n');
            fs.writeFileSync(mainJsPath, stripped, 'utf-8');
        }
    }

    try {
        const loader = path.join(dir, LEGACY_LOADER_FILENAME);
        if (fs.existsSync(loader)) {
            fs.rmSync(loader);
        }
    } catch {
        // best-effort
    }
}

export function handlePermissionError(err: unknown): string {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
        if (process.platform === 'win32') {
            return 'Permission denied. Try running Cursor as Administrator (right-click → Run as administrator).';
        } else if (process.platform === 'darwin') {
            return 'Permission denied. Try running: sudo chown -R $USER Cursor.app/Contents/Resources/app/out/';
        } else {
            return 'Permission denied. Try running Cursor with elevated privileges or fixing file permissions.';
        }
    }
    return `Unexpected error: ${err}`;
}
