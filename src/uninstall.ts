import * as fs from 'fs';
import * as path from 'path';
import { PATCH_MARKER, LOADER_FILENAME, BACKUP_PREFIX } from './constants';

function findMainJsCandidates(): string[] {
    const candidates: string[] = [];

    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        if (localAppData) {
            candidates.push(path.join(localAppData, 'Programs', 'cursor', 'resources', 'app', 'out', 'main.js'));
        }
        const programFiles = process.env['ProgramFiles'] || '';
        if (programFiles) {
            candidates.push(path.join(programFiles, 'Cursor', 'resources', 'app', 'out', 'main.js'));
        }
        const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
        if (programFilesX86) {
            candidates.push(path.join(programFilesX86, 'Cursor', 'resources', 'app', 'out', 'main.js'));
        }
    } else if (process.platform === 'darwin') {
        candidates.push('/Applications/Cursor.app/Contents/Resources/app/out/main.js');
        const home = process.env.HOME || '';
        if (home) {
            candidates.push(path.join(home, 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'main.js'));
        }
    } else {
        const home = process.env.HOME || '';
        candidates.push('/opt/Cursor/resources/app/out/main.js');
        candidates.push('/usr/share/cursor/resources/app/out/main.js');
        if (home) {
            candidates.push(path.join(home, '.local', 'share', 'cursor', 'resources', 'app', 'out', 'main.js'));
        }
    }

    return candidates;
}

function findPatchedMainJs(): string | null {
    for (const candidate of findMainJsCandidates()) {
        try {
            if (!fs.existsSync(candidate)) continue;
            const content = fs.readFileSync(candidate, 'utf-8');
            if (content.includes(PATCH_MARKER)) {
                return candidate;
            }
        } catch {
            continue;
        }
    }
    return null;
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

function removePatch(mainJsPath: string): void {
    const dir = path.dirname(mainJsPath);
    const latestBackup = findLatestBackup(dir);

    if (latestBackup) {
        fs.copyFileSync(latestBackup, mainJsPath);
    } else {
        const content = fs.readFileSync(mainJsPath, 'utf-8');
        if (!content.includes(PATCH_MARKER)) return;
        const lines = content.split('\n');
        const filtered = lines.filter(
            (line) => !line.includes(PATCH_MARKER)
        );
        fs.writeFileSync(mainJsPath, filtered.join('\n'), 'utf-8');
    }

    try {
        const p = path.join(dir, LOADER_FILENAME);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
        }
    } catch {
        // best-effort
    }
}

const mainJsPath = findPatchedMainJs();
if (mainJsPath) {
    try {
        removePatch(mainJsPath);
    } catch {
        // best-effort — don't crash the uninstall process
    }
}
