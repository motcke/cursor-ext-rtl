// Runs outside the extension host (vscode:uninstall hook), so Cursor's app
// root is discovered from well-known install locations instead of the API.
// The actual restore logic lives in patcher.ts (vscode-free) and is reused
// here so both paths stay identical.
import * as fs from 'fs';
import * as path from 'path';
import { LEGACY_LOADER_FILENAME } from './constants';
import {
    removePatch,
    restoreChecksum,
    removeRtlFiles,
    isLegacyPatched,
    removeLegacyPatch,
} from './patcher';

function findAppRootCandidates(): string[] {
    const candidates: string[] = [];

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        if (localAppData) {
            candidates.push(path.join(localAppData, 'Programs', 'cursor', 'resources', 'app'));
        }
        const programFiles = process.env['ProgramFiles'] || '';
        if (programFiles) {
            candidates.push(path.join(programFiles, 'Cursor', 'resources', 'app'));
        }
        const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
        if (programFilesX86) {
            candidates.push(path.join(programFilesX86, 'Cursor', 'resources', 'app'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Cursor.app/Contents/Resources/app');
        const home = process.env.HOME || '';
        if (home) {
            candidates.push(path.join(home, 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app'));
        }
    } else {
        const home = process.env.HOME || '';
        candidates.push('/opt/Cursor/resources/app');
        candidates.push('/usr/share/cursor/resources/app');
        if (home) {
            candidates.push(path.join(home, '.local', 'share', 'cursor', 'resources', 'app'));
        }
    }

    return candidates;
}

function readProductVersion(productJsonPath: string): string {
    try {
        const version = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8')).version;
        return typeof version === 'string' ? version : 'unknown';
    } catch {
        return 'unknown';
    }
}

function cleanupAppRoot(appRoot: string): void {
    const preloadJs = path.join(
        appRoot, 'out', 'vs', 'base', 'parts', 'sandbox', 'electron-sandbox', 'preload.js'
    );
    const productJson = path.join(appRoot, 'product.json');

    if (fs.existsSync(preloadJs)) {
        removePatch(preloadJs, readProductVersion(productJson));
        try {
            restoreChecksum(productJson, preloadJs);
        } catch {
            // best-effort
        }
        removeRtlFiles(path.join(appRoot, 'out', 'vs', 'workbench'));
    }

    const mainJs = path.join(appRoot, 'out', 'main.js');
    if (fs.existsSync(mainJs) && isLegacyPatched(mainJs)) {
        removeLegacyPatch(mainJs);
    }
    try {
        // An orphaned loader (main.js already clean) is still worth deleting.
        fs.rmSync(path.join(appRoot, 'out', LEGACY_LOADER_FILENAME), { force: true });
    } catch {
        // best-effort
    }
}

for (const appRoot of findAppRootCandidates()) {
    if (!fs.existsSync(appRoot)) {
        continue;
    }
    try {
        cleanupAppRoot(appRoot);
    } catch {
        // best-effort — don't crash the uninstall process
    }
}
