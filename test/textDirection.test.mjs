import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    SENTENCES,
    SENTENCES_AR,
    MIXED_HE_EN_EXPECTED,
} from '../scripts/e2e/fixtures/mixed-he-en.mjs';
import { QUESTIONS, OPTIONS } from '../scripts/e2e/fixtures/questionnaire.mjs';
import { createRtlRuntime, loadTsModule } from './rtlHarness.mjs';

const { getTextDir } = loadTsModule('src/textDirection.ts');
const { applyRtlDirections } = loadTsModule('src/markdownItRtl.ts');

const rt = createRtlRuntime();

function assertBoth(text, expected, label = text) {
    assert.equal(getTextDir(text), expected, `textDirection.ts mismatch for: ${label}`);
    assert.equal(rt.scanTextDir(text), expected, `resources/rtl.js mismatch for: ${label}`);
}

describe('getTextDir — regression suite (#18 & #19) + TS/rtl.js parity', () => {
    it('classifies all Hebrew mixed sentences from issue #18 identically in TS and rtl.js', () => {
        for (const [key, text] of Object.entries(SENTENCES)) {
            assertBoth(text, MIXED_HE_EN_EXPECTED[key], `SENTENCES.${key}`);
        }
    });

    it('classifies all Arabic mixed sentences from issue #18 identically in TS and rtl.js', () => {
        for (const [key, text] of Object.entries(SENTENCES_AR)) {
            assertBoth(text, MIXED_HE_EN_EXPECTED[key], `SENTENCES_AR.${key}`);
        }
    });

    it('classifies all English-first questionnaire questions & options from issue #19 as RTL', () => {
        for (const [key, text] of Object.entries(QUESTIONS)) {
            assertBoth(text, 'rtl', `QUESTIONS.${key}`);
        }
        for (const [key, text] of Object.entries(OPTIONS)) {
            assertBoth(text, 'rtl', `OPTIONS.${key}`);
        }
    });

    it('still discounts real internal code identifiers/paths in Hebrew prose', () => {
        assertBoth('הפונקציה getUserById בקובץ src/api/users.ts מחזירה null', 'rtl');
        assertBoth('בדוק את הערך של DICTIONARY.Home וגם dd/MM/yyyy בעמוד.', 'rtl');
    });
});

describe('getTextDir — trailing punctuation bug & tie-breaking (RED → GREEN)', () => {
    it('does not crush English words ending with "." or ":" to 0.25 weight', () => {
        // Issue #22 arrow function line: requestTitle: (0.5) + date: (1) + string(1) +
        // format(1) + new(1) + Date(1) + date(1) + dd/MM/yyyy(0.25) = 6.75 vs 3*2 = 6 -> LTR
        assertBoth(
            "requestTitle: (date: string) => `תוכן הפנייה (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            'ltr',
            'issue #22 requestTitle line'
        );

        // Prose/labels with trailing colons and periods should keep weight 1, not 0.25
        assertBoth('Note: see header. check error. אחד שתיים.', 'ltr');
        assertBoth('Error: file is missing. Note: retry. אחד שתיים.', 'ltr');
        assertBoth('title: value, status: done. שלום', 'ltr');
    });

    it('breaks exact score ties in favour of LTR (> instead of >=)', () => {
        // 2 LTR words (score 2) vs 1 Hebrew word (score 2) -> tie -> LTR
        assertBoth("const x = 'כן'", 'ltr');
        assertBoth("let a = 'לא';", 'ltr');
        // 1 Hebrew word (score 2) still beats 1 English word (score 1)
        assertBoth('Cursor עובד', 'rtl');
    });
});

describe('getMajorityDir — neutral (symbol/empty) items skipped (RED → GREEN)', () => {
    it('skips empty and symbol-only list items in rtl.js', () => {
        rt.clearBody();
        const ul = rt.el('ul', {}, [
            rt.el('li', {}, 'שלום עולם'),
            rt.el('li', {}, 'בדיקה נוספת'),
            rt.el('li', {}, ''),
            rt.el('li', {}, '---'),
            rt.el('li', {}, '123'),
        ]);
        rt.body.appendChild(rt.el('div', { class: 'markdown-root' }, [ul]));
        rt.scanAll();
        assert.equal(ul.getAttribute('dir'), 'rtl');
    });

    it('skips empty and numeric/symbol cells in rtl.js tables', () => {
        rt.clearBody();
        const table = rt.el('table', {}, [
            rt.el('tr', {}, [
                rt.el('th', {}, 'רכיב'),
                rt.el('th', {}, 'מצב'),
            ]),
            rt.el('tr', {}, [
                rt.el('td', {}, '1'),
                rt.el('td', {}, '100%'),
            ]),
            rt.el('tr', {}, [
                rt.el('td', {}, '-'),
                rt.el('td', {}, ''),
            ]),
        ]);
        rt.body.appendChild(rt.el('div', { class: 'markdown-root' }, [table]));
        rt.scanAll();
        assert.equal(table.getAttribute('dir'), 'rtl');
    });

    it('skips numeric/symbol table cells in markdownItRtl.ts too', () => {
        const makeToken = (type, level, content = '') => {
            const attrs = new Map();
            return {
                type,
                level,
                content,
                attrs,
                attrSet(k, v) {
                    attrs.set(k, v);
                },
            };
        };
        const tableOpen = makeToken('table_open', 0);
        const tokens = [
            tableOpen,
            makeToken('th_open', 2), makeToken('inline', 3, 'רכיב'), makeToken('th_close', 2),
            makeToken('th_open', 2), makeToken('inline', 3, 'מצב'), makeToken('th_close', 2),
            makeToken('td_open', 2), makeToken('inline', 3, '1'), makeToken('td_close', 2),
            makeToken('td_open', 2), makeToken('inline', 3, '2026'), makeToken('td_close', 2),
            makeToken('td_open', 2), makeToken('inline', 3, '-'), makeToken('td_close', 2),
            makeToken('table_close', 0),
        ];
        applyRtlDirections(tokens);
        assert.equal(tableOpen.attrs.get('dir'), 'rtl');
    });
});
