// File name patterns for cursorRtl.editorRtlByFile (issue #20).
//
// A pattern matches the file name only (never the folder), case-insensitively,
// with * (any run of characters) and ? (one character) as the only wildcards.
// When several patterns match, the one with the most literal characters wins,
// so "CHANGELOG.md" beats "*.md". resources/rtl.js applies the same rule in the
// renderer; keep the two in sync.

export function compileFilePattern(pattern: string): RegExp {
    let source = '';
    for (const ch of pattern) {
        if (ch === '*') {
            source += '.*';
        } else if (ch === '?') {
            source += '.';
        } else {
            source += ch.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`, 'i');
}

interface RankedPattern {
    pattern: string;
    literal: number;
    wildcards: number;
    order: number;
}

// The pattern in `patterns` that decides `fileName`, or undefined when none
// matches.
export function findMatchingPattern(patterns: string[], fileName: string): string | undefined {
    const ranked: RankedPattern[] = patterns.map((pattern, order) => {
        const literal = pattern.replace(/[*?]/g, '').length;
        return { pattern, literal, wildcards: pattern.length - literal, order };
    });
    ranked.sort((a, b) => (b.literal - a.literal) || (a.wildcards - b.wildcards) || (a.order - b.order));
    return ranked.find((r) => compileFilePattern(r.pattern).test(fileName))?.pattern;
}

// The pattern the Code Editor Direction command offers for the open file:
// its extension ("*.prisma"), or the exact name when it has none
// ("Dockerfile", ".env").
export function patternForFileName(fileName: string): string | undefined {
    if (!fileName) {
        return undefined;
    }
    const dot = fileName.lastIndexOf('.');
    return dot > 0 && dot < fileName.length - 1 ? `*${fileName.slice(dot)}` : fileName;
}

export function hasWildcard(pattern: string): boolean {
    return /[*?]/.test(pattern);
}

// The same key in `map`, compared case-insensitively (patterns match
// case-insensitively, so "*.MD" and "*.md" are one rule).
export function findKey(map: Record<string, unknown>, pattern: string): string | undefined {
    const wanted = pattern.toLowerCase();
    return Object.keys(map).find((key) => key.toLowerCase() === wanted);
}

export interface SuspectPattern {
    pattern: string;
    reason: 'language' | 'bareName' | 'path';
    suggestions: string[];
}

// Keys that probably don't mean what the user wants:
// - a language ID such as "markdown" (the 2.1.0 format), which only matches a
//   file literally named "markdown";
// - a bare word such as "prisma", which also matches only that exact name;
// - a path such as "docs/*.md", while only file names are matched.
// Known extension-less file names (Dockerfile, Makefile...) are not suspect.
export function findSuspectPattern(
    pattern: string,
    languagePatterns: Map<string, string[]>,
    knownFileNames: Set<string>
): SuspectPattern | undefined {
    if (/[\\/]/.test(pattern)) {
        const name = pattern.split(/[\\/]/).pop() ?? '';
        return { pattern, reason: 'path', suggestions: name ? [name] : [] };
    }
    if (hasWildcard(pattern) || pattern.includes('.')) {
        return undefined;
    }
    if (knownFileNames.has(pattern.toLowerCase())) {
        return undefined;
    }
    const fromLanguage = languagePatterns.get(pattern.toLowerCase());
    if (fromLanguage && fromLanguage.length > 0) {
        return { pattern, reason: 'language', suggestions: fromLanguage };
    }
    return { pattern, reason: 'bareName', suggestions: [`*.${pattern.toLowerCase()}`] };
}
