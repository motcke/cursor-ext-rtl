// cursorRtl.editorRtlByFile: { fileNamePattern: mode } (issue #20), the
// 2.1.0 → 2.2.0 migration from cursorRtl.editorRtlByLanguage, and the warning
// for keys that won't match what the user meant.

import * as vscode from 'vscode';
import { findKey, findSuspectPattern, SuspectPattern } from './filePatterns';
import { action } from './actions';

export type EditorRtlMode = 'auto' | 'always' | 'off';

export function toEditorRtlMode(value: unknown): EditorRtlMode | null {
    return value === 'auto' || value === 'always' || value === 'off' ? value : null;
}

// Trimmed keys, valid modes only. Keys keep their case; matching ignores it.
export function getEditorRtlByFile(): Record<string, EditorRtlMode> {
    const raw = vscode.workspace
        .getConfiguration('cursorRtl')
        .get<Record<string, unknown>>('editorRtlByFile', {});
    const result: Record<string, EditorRtlMode> = {};
    for (const [pattern, value] of Object.entries(raw ?? {})) {
        const mode = toEditorRtlMode(value);
        const key = pattern.trim();
        if (mode && key) {
            result[key] = mode;
        }
    }
    return result;
}

// Languages registered in core rather than by an extension, plus languages
// whose extensions list is longer than anyone would want in their settings
// (markdown-basics registers nine).
const CURATED_LANGUAGE_PATTERNS: Record<string, string[]> = {
    plaintext: ['*.txt'],
    markdown: ['*.md', '*.markdown'],
};

// Extension-less files people commonly open; a bare key with one of these
// names is meant literally.
const COMMON_FILE_NAMES = [
    'authors', 'changelog', 'codeowners', 'contributing', 'license', 'notice',
    'readme', 'todo',
];

interface LanguageContribution {
    id?: unknown;
    extensions?: unknown;
    filenames?: unknown;
}

function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// languageId (lowercase) → file name patterns, from every installed
// extension's contributes.languages, and the extension-less file names those
// languages claim (Dockerfile, Makefile...).
function readLanguages(): { patterns: Map<string, string[]>; fileNames: Set<string> } {
    const patterns = new Map<string, string[]>();
    const fileNames = new Set<string>(COMMON_FILE_NAMES);
    for (const ext of vscode.extensions.all) {
        const languages = ext.packageJSON?.contributes?.languages;
        if (!Array.isArray(languages)) {
            continue;
        }
        for (const lang of languages as LanguageContribution[]) {
            if (typeof lang.id !== 'string') {
                continue;
            }
            const id = lang.id.toLowerCase();
            const list = patterns.get(id) ?? [];
            for (const extension of stringList(lang.extensions)) {
                list.push(`*${extension.startsWith('.') ? '' : '.'}${extension}`);
            }
            for (const name of stringList(lang.filenames)) {
                list.push(name);
                fileNames.add(name.toLowerCase());
            }
            patterns.set(id, list);
        }
    }
    for (const [id, list] of patterns) {
        patterns.set(id, dedupe(list));
    }
    for (const [id, list] of Object.entries(CURATED_LANGUAGE_PATTERNS)) {
        patterns.set(id, list);
    }
    return { patterns, fileNames };
}

function dedupe(list: string[]): string[] {
    const seen = new Set<string>();
    return list.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

type Scope = { target: vscode.ConfigurationTarget; value: Record<string, unknown> | undefined };

function scopesOf(setting: string): Scope[] {
    const inspected = vscode.workspace
        .getConfiguration('cursorRtl')
        .inspect<Record<string, unknown>>(setting);
    return [
        { target: vscode.ConfigurationTarget.Global, value: inspected?.globalValue },
        { target: vscode.ConfigurationTarget.Workspace, value: inspected?.workspaceValue },
    ];
}

// 2.1.0 keyed the setting by language ID. Each entry becomes the language's
// file name patterns at the same settings scope ("markdown" → "*.md",
// "*.markdown"); a language no installed extension registers is guessed from
// its ID ("prisma" → "*.prisma"). Existing editorRtlByFile entries win. The
// old setting is removed afterwards.
export async function migrateEditorRtlByLanguage(): Promise<void> {
    const { patterns } = readLanguages();
    const moved: string[] = [];
    const guessed: string[] = [];
    for (const scope of scopesOf('editorRtlByLanguage')) {
        if (!scope.value || typeof scope.value !== 'object') {
            continue;
        }
        const current = scopesOf('editorRtlByFile').find((s) => s.target === scope.target)?.value;
        const next: Record<string, unknown> = { ...(current ?? {}) };
        for (const [lang, value] of Object.entries(scope.value)) {
            const mode = toEditorRtlMode(value);
            const id = lang.trim().toLowerCase();
            if (!mode || !id) {
                continue;
            }
            const known = patterns.get(id);
            const list = known && known.length > 0 ? known : [`*.${id}`];
            for (const pattern of list) {
                if (!findKey(next, pattern)) {
                    next[pattern] = mode;
                }
            }
            (known && known.length > 0 ? moved : guessed).push(`${id} → ${list.join(', ')}`);
        }
        const config = vscode.workspace.getConfiguration('cursorRtl');
        try {
            await config.update('editorRtlByFile', next, scope.target);
            await config.update('editorRtlByLanguage', undefined, scope.target);
        } catch {
            return;
        }
    }
    if (moved.length === 0 && guessed.length === 0) {
        return;
    }
    action('editor_rtl_migrated', { moved: String(moved.length), guessed: String(guessed.length) });
    const lines = [...moved, ...guessed.map((g) => `${g} (guessed from the name)`)];
    const choice = await vscode.window.showInformationMessage(
        'Cursor RTL: per-file-type editor direction now uses file name patterns ' +
            `(Editor Rtl By File). Your settings were moved: ${lines.join('; ')}.`,
        'Open Settings'
    );
    if (choice === 'Open Settings') {
        await openEditorRtlByFileSettings();
    }
}

export async function openEditorRtlByFileSettings(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'cursorRtl.editorRtlByFile');
}

const KEPT_PATTERNS_KEY = 'editorRtlByFile.keptPatterns';
const warnedThisSession = new Set<string>();

function describeSuspect(suspect: SuspectPattern): string {
    const key = `"${suspect.pattern}"`;
    switch (suspect.reason) {
        case 'language':
            return `Cursor RTL: ${key} in Editor Rtl By File looks like a file type. ` +
                `Rules match file names, so it only applies to a file named exactly ${key}. ` +
                `For files of that type use ${suspect.suggestions.join(', ')}.`;
        case 'bareName':
            return `Cursor RTL: ${key} in Editor Rtl By File only applies to a file named exactly ${key}. ` +
                `For files ending in .${suspect.pattern.toLowerCase()} use ${suspect.suggestions[0]}.`;
        case 'path':
            return `Cursor RTL: ${key} in Editor Rtl By File contains a folder. ` +
                'Rules match the file name only, so it never applies' +
                (suspect.suggestions.length ? `. Use ${suspect.suggestions[0]} instead.` : '.');
    }
}

// Warns about the first suspect key not yet answered, once per session. "Use
// …" swaps the key for the suggested patterns at the scope that defines it;
// "Keep" remembers the key so it is never flagged again.
export async function checkEditorRtlByFile(context: vscode.ExtensionContext): Promise<void> {
    const kept = new Set(context.globalState.get<string[]>(KEPT_PATTERNS_KEY, []));
    const { patterns, fileNames } = readLanguages();
    for (const scope of scopesOf('editorRtlByFile')) {
        for (const key of Object.keys(scope.value ?? {})) {
            const pattern = key.trim();
            if (!pattern || kept.has(pattern) || warnedThisSession.has(pattern)) {
                continue;
            }
            const suspect = findSuspectPattern(pattern, patterns, fileNames);
            if (!suspect) {
                continue;
            }
            warnedThisSession.add(pattern);
            action('editor_rtl_pattern_warning', { reason: suspect.reason });
            const fix = suspect.suggestions.length
                ? `Use ${suspect.suggestions.join(', ')}`
                : undefined;
            const buttons = fix ? [fix, 'Keep'] : ['Open Settings', 'Keep'];
            const choice = await vscode.window.showWarningMessage(describeSuspect(suspect), ...buttons);
            if (choice === fix && fix) {
                await replacePattern(scope, key, suspect.suggestions);
                action('editor_rtl_pattern_fixed', { reason: suspect.reason });
            } else if (choice === 'Open Settings') {
                await openEditorRtlByFileSettings();
            } else if (choice === 'Keep') {
                kept.add(pattern);
                await context.globalState.update(KEPT_PATTERNS_KEY, [...kept]);
            }
            return;
        }
    }
}

async function replacePattern(scope: Scope, key: string, suggestions: string[]): Promise<void> {
    const next: Record<string, unknown> = {};
    const mode = scope.value?.[key];
    for (const [k, v] of Object.entries(scope.value ?? {})) {
        if (k === key) {
            for (const suggestion of suggestions) {
                if (!findKey(next, suggestion) && !findKey(scope.value ?? {}, suggestion)) {
                    next[suggestion] = mode;
                }
            }
        } else {
            next[k] = v;
        }
    }
    await vscode.workspace
        .getConfiguration('cursorRtl')
        .update('editorRtlByFile', next, scope.target);
}
