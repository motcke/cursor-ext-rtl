import * as fs from 'fs';
import * as path from 'path';
import {
    PATCH_LINE,
    PATCH_MARKER,
    RTL_FILENAME,
    BACKUP_PREFIX,
} from './constants';

export function verifySignature(mainJsPath: string): boolean {
    try {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        return content.includes('Copyright (C) Microsoft Corporation');
    } catch {
        return false;
    }
}

export function isPatched(mainJsPath: string): boolean {
    try {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        return content.includes(PATCH_MARKER);
    } catch {
        return false;
    }
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
        const lines = content.split('\n');
        const filtered = lines.filter((line) => !line.includes(PATCH_MARKER));
        fs.writeFileSync(mainJsPath, filtered.join('\n'), 'utf-8');
    }

    removeRtlScript(dir);
}

export function copyRtlScript(targetDir: string, extensionPath: string): void {
    const src = path.join(extensionPath, 'resources', RTL_FILENAME);
    const dest = path.join(targetDir, RTL_FILENAME);
    fs.copyFileSync(src, dest);
}

export function removeRtlScript(targetDir: string): void {
    const rtlPath = path.join(targetDir, RTL_FILENAME);
    try {
        if (fs.existsSync(rtlPath)) {
            fs.unlinkSync(rtlPath);
        }
    } catch {
        // Ignore if file doesn't exist or can't be deleted
    }
}

export function getDryRunSummary(
    mainJsPath: string,
    extensionPath: string
): string[] {
    const dir = path.dirname(mainJsPath);
    const actions: string[] = [];

    if (isPatched(mainJsPath)) {
        actions.push('RTL patch is already applied (no changes needed to main.js)');
    } else {
        actions.push(`Backup main.js → ${BACKUP_PREFIX}<timestamp>`);
        actions.push(`Insert RTL patch line into: ${mainJsPath}`);
    }

    const rtlDest = path.join(dir, RTL_FILENAME);
    if (fs.existsSync(rtlDest)) {
        actions.push(`Overwrite existing ${RTL_FILENAME} in: ${dir}`);
    } else {
        actions.push(`Copy ${RTL_FILENAME} to: ${dir}`);
    }

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
