// TypeScript port of the weighted direction detection from resources/rtl.js
// (getTextDir + getLtrTokenWeight). Keep the two in sync — same Unicode
// ranges, same token weights — so chat and Markdown preview classify
// identical text identically.

const RTL_TEXT =
    /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿߀-߿ࡰ-࢟ࢠ-ࣿיִ-ﭏﭐ-﷿ﹰ-﻾]/g;

const LTR_TOKEN = /[A-Za-z][A-Za-z0-9._/\\:-]*/g;

export type TextDir = 'ltr' | 'rtl';

// Identifiers, paths, ALL-CAPS and camelCase tokens are usually code and
// shouldn't pull a Hebrew/Arabic sentence back to LTR as hard as prose words.
function getLtrTokenWeight(token: string): number {
    if (/[._/\\:]/.test(token)) return 0.25;
    if (/^[A-Z0-9-]{2,}$/.test(token)) return 0.5;
    if (/^[a-z]+[A-Z]/.test(token)) return 0.5;
    return 1;
}

export function getTextDir(text: string): TextDir {
    const value = text || '';
    const rtlRuns = value.match(RTL_TEXT) || [];
    const ltrTokens = value.match(LTR_TOKEN) || [];
    if (rtlRuns.length === 0) return 'ltr';
    if (ltrTokens.length === 0) return 'rtl';

    const rtlScore = rtlRuns.length * 1.5;
    let ltrScore = 0;
    for (const token of ltrTokens) {
        ltrScore += getLtrTokenWeight(token);
    }
    return rtlScore >= ltrScore ? 'rtl' : 'ltr';
}
