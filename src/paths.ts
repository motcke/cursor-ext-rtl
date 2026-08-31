import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RTL_FILENAME, CONFIG_FILENAME } from './constants';

export function getAppOutDir(): string {
    const appRoot = vscode.env.appRoot;

    const candidate = path.join(appRoot, 'out');
    if (fs.existsSync(candidate)) {
        return candidate;
    }

    const altCandidate = path.join(appRoot, 'resources', 'app', 'out');
    if (fs.existsSync(altCandidate)) {
        return altCandidate;
    }

    const parentCandidate = path.join(path.dirname(appRoot), 'out');
    if (fs.existsSync(parentCandidate)) {
        return parentCandidate;
    }

    return candidate;
}

// The file we patch: the sandbox preload, read from disk by the main process
// for every window (regular and Agents/glass alike) and on every reload.
export function getPreloadJsPath(): string {
    return path.join(
        getAppOutDir(),
        'vs',
        'base',
        'parts',
        'sandbox',
        'electron-sandbox',
        'preload.js'
    );
}

// Where the extension drops cursor-rtl.js and cursor-rtl-config.json. Chosen
// so the bootstrap's script URL ("../../../workbench/cursor-rtl.js", relative
// to workbench.html) resolves here, and fetch() counts as 'self' under CSP.
export function getRtlDir(): string {
    return path.join(getAppOutDir(), 'vs', 'workbench');
}

export function getRtlScriptDestPath(): string {
    return path.join(getRtlDir(), RTL_FILENAME);
}

// Runtime config read by rtl.js via fetch (plan §3.3, option 1 — verified in
// the spike). Lives next to cursor-rtl.js so the renderer can reach it.
export function getConfigPath(): string {
    return path.join(getRtlDir(), CONFIG_FILENAME);
}

export function getProductJsonPath(): string {
    return path.join(path.dirname(getAppOutDir()), 'product.json');
}

// Kept for the 1.2.x migration only.
export function getMainJsPath(): string {
    return path.join(getAppOutDir(), 'main.js');
}

export interface PathValidation {
    valid: boolean;
    preloadJsPath: string;
    error?: string;
}

export function validatePaths(): PathValidation {
    const preloadJsPath = getPreloadJsPath();

    for (const p of [preloadJsPath, getRtlDir(), getProductJsonPath()]) {
        if (!fs.existsSync(p)) {
            return {
                valid: false,
                preloadJsPath,
                error: `Not found: ${p}`,
            };
        }
    }

    try {
        fs.accessSync(preloadJsPath, fs.constants.R_OK);
    } catch {
        return {
            valid: false,
            preloadJsPath,
            error: `No read permission for: ${preloadJsPath}`,
        };
    }

    return { valid: true, preloadJsPath };
}
