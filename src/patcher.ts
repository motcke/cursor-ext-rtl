import * as fs from 'fs';
import * as path from 'path';
import {
    PATCH_LINE,
    PATCH_MARKER,
    LOADER_FILENAME,
    BACKUP_PREFIX,
} from './constants';

export function isPatched(mainJsPath: string): boolean {
    try {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        return content.includes(PATCH_MARKER);
    } catch {
        return false;
    }
}

function stripPatchLines(content: string): string {
    const lines = content.split('\n');
    return lines
        .filter((line) => !line.includes(PATCH_MARKER))
        .join('\n');
}

function formatTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        'T' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
    );
}

export function backup(mainJsPath: string): string {
    const dir = path.dirname(mainJsPath);
    const backupName = BACKUP_PREFIX + formatTimestamp();
    const backupPath = path.join(dir, backupName);
    fs.copyFileSync(mainJsPath, backupPath);
    return backupPath;
}

function findLatestBackup(mainJsDir: string): string | null {
    try {
        const files = fs.readdirSync(mainJsDir);
        const backups = files
            .filter((f) => f.startsWith(BACKUP_PREFIX))
            .sort()
            .reverse();
        return backups.length > 0 ? path.join(mainJsDir, backups[0]) : null;
    } catch {
        return null;
    }
}

export function hasBackups(mainJsPath: string): boolean {
    return findLatestBackup(path.dirname(mainJsPath)) !== null;
}

export function applyPatch(mainJsPath: string): void {
    const content = fs.readFileSync(mainJsPath, 'utf-8');

    if (!content.includes('Copyright (C) Microsoft Corporation')) {
        throw new Error(
            'main.js does not contain the expected Microsoft copyright signature. ' +
            'This file may be corrupted or from an unsupported Cursor version.'
        );
    }

    if (content.includes(PATCH_MARKER)) {
        return;
    }

    const backupPath = backup(mainJsPath);

    try {
        const copyrightEnd = content.indexOf('*/');
        if (copyrightEnd === -1) {
            throw new Error('Could not find end of copyright comment in main.js');
        }

        const insertPos = copyrightEnd + 2;
        const patched = content.substring(0, insertPos) + '\n' + PATCH_LINE + content.substring(insertPos);

        fs.writeFileSync(mainJsPath, patched, 'utf-8');
    } catch (err) {
        try {
            fs.copyFileSync(backupPath, mainJsPath);
        } catch (rollbackErr) {
            throw new Error(
                `Patch failed and rollback also failed. Backup is at: ${backupPath}. ` +
                `Original error: ${err}. Rollback error: ${rollbackErr}`
            );
        }
        throw err;
    }
}

export function removePatch(mainJsPath: string): void {
    const dir = path.dirname(mainJsPath);
    const latestBackup = findLatestBackup(dir);

    if (latestBackup) {
        fs.copyFileSync(latestBackup, mainJsPath);
    } else {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        if (!content.includes(PATCH_MARKER)) {
            return;
        }
        fs.writeFileSync(mainJsPath, stripPatchLines(content), 'utf-8');
    }

    removeLoader(dir);
}

export function copyLoader(outDir: string, extensionPath: string): void {
    const src = path.join(extensionPath, 'resources', LOADER_FILENAME);
    const dest = path.join(outDir, LOADER_FILENAME);
    fs.copyFileSync(src, dest);
}

export function removeLoader(outDir: string): void {
    const p = path.join(outDir, LOADER_FILENAME);
    try {
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
        }
    } catch {
        // best-effort
    }
}

export function getDryRunSummary(mainJsPath: string): string[] {
    const actions: string[] = [];
    const dir = path.dirname(mainJsPath);

    if (isPatched(mainJsPath)) {
        actions.push('RTL patch is already up to date in main.js');
    } else {
        actions.push(`Backup main.js → ${BACKUP_PREFIX}<timestamp>`);
        actions.push('Insert one-line loader require into main.js');
    }

    const loaderDest = path.join(dir, LOADER_FILENAME);
    if (fs.existsSync(loaderDest)) {
        actions.push(`Update loader script: ${loaderDest}`);
    } else {
        actions.push(`Write loader script: ${loaderDest}`);
    }

    actions.push('RTL script stays in extension directory (auto-updates with extension)');

    return actions;
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
