// TypeScript port of the weighted direction detection from resources/rtl.js
// (getTextDir + getLtrTokenWeight). Keep the two in sync — same Unicode
// ranges, same token weights — so chat and Markdown preview classify
// identical text identically.

const RTL_TEXT =
    /[֐-׿؀-ۿ܀-ݏݐ-ݿހ-޿߀-߿ࡰ-࢟ࢠ-ࣿיִ-ﭏﭐ-﷿ﹰ-﻾]/g;

// A run of RTL characters: one Hebrew/Arabic word.
const RTL_WORD = new RegExp(RTL_TEXT.source + '+', 'g');

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

// Both sides are counted in words: each Hebrew/Arabic word scores 2, each
// English word 1 (less for code-like tokens).
export function getTextDir(text: string): TextDir {
    const value = text || '';
    const rtlWords = value.match(RTL_WORD) || [];
    const ltrTokens = value.match(LTR_TOKEN) || [];
    if (rtlWords.length === 0) return 'ltr';
    if (ltrTokens.length === 0) return 'rtl';

    const rtlScore = rtlWords.length * 2;
    let ltrScore = 0;
    for (const token of ltrTokens) {
        ltrScore += getLtrTokenWeight(token);
    }
    return rtlScore >= ltrScore ? 'rtl' : 'ltr';
}
