import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRtlRuntime } from './rtlHarness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const rt = createRtlRuntime();

function checkEditorDir(content, uri = 'file:///workspace/index.ts') {
    rt.clearBody();
    const lines = content.split(/\r?\n/);
    const editor = rt.createMonacoEditor(lines, { uri });
    rt.scanAll();
    return editor.getAttribute('data-cursor-rtl-dir') === 'rtl' ? 'rtl' : 'ltr';
}

describe('detectEditorDir — Issue #22 code files with Hebrew strings (RED → GREEN)', () => {
    beforeEach(() => {
        rt.setEditorMode('auto', {});
    });

    it('keeps the exact Issue #22 index.ts snippet LTR', () => {
        const snippet = [
            "import { format } from 'date-fns';",
            '',
            'export const Dictionary = {',
            '  [DICTIONARY.Home]: {',
            "    title: 'כותרת ראשית',",
            "    requestTitle: (date: string) => `תוכן הפנייה (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            '  },',
            '};',
        ].join('\n');
        assert.equal(checkEditorDir(snippet, 'file:///workspace/index.ts'), 'ltr');
    });

    it('keeps a realistic TS Dictionary with imports, arrow functions and Hebrew labels LTR', () => {
        const realisticDict = [
            "import { format } from 'date-fns';",
            "import { DICTIONARY } from './types';",
            '',
            'export const Dictionary = {',
            '  [DICTIONARY.Home]: {',
            "    title: 'כותרת ראשית',",
            "    subtitle: 'תת כותרת',",
            "    requestTitle: (date: string) => `תוכן הפנייה (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            "    cancelBtn: 'ביטול',",
            "    submitBtn: 'שליחה',",
            "    saveChanges: 'שמור שינויים',",
            "    deleteConfirm: (name: string) => `האם למחוק את ${name}?`,",
            "    emptyState: 'אין נתונים להצגה',",
            '  },',
            '};',
        ].join('\n');
        assert.equal(checkEditorDir(realisticDict, 'file:///workspace/index.ts'), 'ltr');
    });

    it('keeps a pure short-label TS dictionary (key: 1-2 Hebrew words) LTR', () => {
        const shortLabelsDict = [
            'export const Dictionary = {',
            "  title: 'כותרת ראשית',",
            "  subtitle: 'תת כותרת',",
            "  cancelBtn: 'ביטול',",
            "  submitBtn: 'שליחה',",
            "  saveChanges: 'שמור שינויים',",
            "  backHome: 'חזרה לדף הבית',",
            "  errorTitle: 'שגיאה בטעינה',",
            "  loadingText: 'טוען נתונים...',",
            '};',
        ].join('\n');
        assert.equal(checkEditorDir(shortLabelsDict, 'file:///workspace/dictionary.ts'), 'ltr');
    });

    it('keeps a short-label JSON i18n file LTR', () => {
        const jsonI18n = [
            '{',
            '  "title": "כותרת ראשית",',
            '  "subtitle": "תת כותרת",',
            '  "cancelBtn": "ביטול",',
            '  "submitBtn": "שליחה",',
            '  "saveBtn": "שמירה",',
            '  "errorTitle": "שגיאה בטעינה"',
            '}',
        ].join('\n');
        assert.equal(checkEditorDir(jsonI18n, 'file:///workspace/he.json'), 'ltr');
    });

    it('keeps repeated arrow-function template literal lines (Issue #22 pattern) LTR', () => {
        const templateFns = [
            "import { format } from 'date-fns';",
            'export const Messages = {',
            "  requestTitle: (date: string) => `תוכן הפנייה (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            "  orderTitle: (date: string) => `פרטי הזמנה (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            "  invoiceTitle: (date: string) => `חשבונית מס (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            "  receiptTitle: (date: string) => `קבלה על תשלום (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            "  summaryTitle: (date: string) => `סיכום פעילות (מתאריך ${format(new Date(date), 'dd/MM/yyyy')})`,",
            '};',
        ].join('\n');
        assert.equal(checkEditorDir(templateFns, 'file:///workspace/messages.ts'), 'ltr');
    });

    it('does not flip a tiny code file with fewer than 5 RTL words', () => {
        const tiny = [
            "title: 'אישור',",
            "label: 'ביטול',",
        ].join('\n');
        assert.equal(checkEditorDir(tiny, 'file:///workspace/consts.ts'), 'ltr');
    });
});

describe('detectEditorDir — RTL documents, heavy Hebrew & hysteresis (RED → GREEN)', () => {
    beforeEach(() => {
        rt.setEditorMode('auto', {});
    });

    it('flips a brand-new pure-Hebrew Markdown/text note to RTL on the first word', () => {
        assert.equal(checkEditorDir('# שלום', 'file:///workspace/notes.md'), 'rtl');
        assert.equal(checkEditorDir('שלום עולם', 'untitled:Untitled-1'), 'rtl');
    });

    it('flips hebrew.md fixture to RTL', () => {
        const hebrewMd = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lab/fixtures/hebrew.md'), 'utf-8');
        assert.equal(checkEditorDir(hebrewMd, 'file:///workspace/hebrew.md'), 'rtl');
    });

    it('keeps english.md fixture LTR', () => {
        const englishMd = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lab/fixtures/english.md'), 'utf-8');
        assert.equal(checkEditorDir(englishMd, 'file:///workspace/english.md'), 'ltr');
    });

    it('flips a Hebrew Markdown file with many blank lines and dividers to RTL', () => {
        const sparseHebrew = [
            '# כותרת בעברית',
            '',
            '---',
            '',
            'פסקה ראשונה בעברית לבדיקת כיוון.',
            '',
            '---',
            '',
            'פסקה שנייה בעברית.',
            '',
            '---',
            '',
        ].join('\n');
        assert.equal(checkEditorDir(sparseHebrew, 'file:///workspace/notes.md'), 'rtl');
    });

    it('flips technical Hebrew Markdown with backtick identifiers and a code fence to RTL', () => {
        const techHebrewMd = [
            '# תכנית פיתוח — Cursor RTL',
            '',
            'המטרה היא לתקן את הזיהוי האוטומטי ב-`detectEditorDir` בתוך `resources/rtl.js` וגם ב-`src/textDirection.ts`.',
            '',
            '## שלבים',
            '1. לנקות פיסוק סופי ב-`getLtrTokenWeight` (כמו `header.` ו-`title:`).',
            '2. להפריד בין הניקוד של הצ\'אט לניקוד של Monaco Editor.',
            '3. להוסיף בדיקות יחידה עם `node --test` ולבדוק מול `npm run e2e`.',
            '',
            '```ts',
            "export function getTextDir(text: string): 'rtl' | 'ltr' {",
            "  return 'ltr';",
            '}',
            '```',
            '',
            'בסיום נריץ `npm run package` ונבדוק על Cursor 3.30.8.',
        ].join('\n');
        assert.equal(checkEditorDir(techHebrewMd, 'file:///workspace/plan.md'), 'rtl');
    });

    it('does not misclassify English-first or parenthesized-quote Hebrew Markdown prose as code-string lines', () => {
        const englishFirstMd = [
            'Cursor הוא עורך `code` מעולה לעבודה יומיומית בעברית',
            'React מאפשר לבנות ממשקים מהירים עם `useState` בצורה פשוטה',
            'זוהי דוגמה ("hello") וגם תיאור (`world`) בתוך משפט עברי',
            'TypeScript עוזר למנוע באגים מיותרים בזמן קומפילציה',
        ].join('\n');
        assert.equal(checkEditorDir(englishFirstMd, 'file:///workspace/guide.md'), 'rtl');
    });

    it('keeps a JSX/TSX component with short Hebrew UI strings LTR', () => {
        const tsx = [
            "import React from 'react';",
            '',
            'export function Header({ user }: Props) {',
            '  return (',
            '    <header className="main-header">',
            "      <h1>{user ? 'שלום' : 'אורח'}</h1>",
            "      <button onClick={handleSave}>{'שמירה'}</button>",
            "      <button onClick={handleCancel}>{'ביטול'}</button>",
            '    </header>',
            '  );',
            '}',
        ].join('\n');
        assert.equal(checkEditorDir(tsx, 'file:///workspace/Header.tsx'), 'ltr');
    });

    it('flips Arabic Markdown prose to RTL', () => {
        const arabicMd = [
            '# دليل التثبيت والاستخدام',
            '',
            'هذا مستند عربي لاختبار اتجاه النص داخل المحرر עם `config.json`.',
            '',
            '- الخطوة الأولى: تثبيت الإضافة',
            '- الخطوة الثانية: إعادة تحميل النافذة',
        ].join('\n');
        assert.equal(checkEditorDir(arabicMd, 'file:///workspace/README.ar.md'), 'rtl');
    });

    it('keeps mixed.ts (code with Hebrew comments) and heavy Hebrew TS dictionaries LTR under global auto', () => {
        const mixedTs = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lab/fixtures/mixed.ts'), 'utf-8');
        assert.equal(checkEditorDir(mixedTs, 'file:///workspace/mixed.ts'), 'ltr');

        const heavyHebrew = [
            'export const Dictionary = {',
            "  welcome: 'ברוכים הבאים למערכת ניהול ההזמנות והפניות שלנו',",
            "  description: 'כאן תוכלו לעקוב אחרי כל הפניות הפתוחות ולעדכן סטטוסים בזמן אמת',",
            "  helpText: 'לכל שאלה או בעיה ניתן לפנות לצוות התמיכה שלנו בימים ראשון עד חמישי',",
            "  footer: 'כל הזכויות שמורות למערכת ניהול הפניות',",
            '};',
        ].join('\n');
        assert.equal(checkEditorDir(heavyHebrew, 'file:///workspace/heavy.ts'), 'ltr');

        // Explicit editorRtlByFile opt-in to 'auto' still enables content detection on a code file
        rt.setEditorMode('auto', { 'heavy.ts': 'auto' });
        assert.equal(checkEditorDir(heavyHebrew, 'file:///workspace/heavy.ts'), 'rtl');
        rt.setEditorMode('auto', {});
    });

    it('applies hysteresis between 50% and 65% so scrolling does not flicker direction', () => {
        // Borderline content: ~58% RTL share in a prose/text file (15 RTL vs 11 LTR)
        const borderlineLines = [
            'Dictionary labels overview',
            'title: "כותרת ראשית"',
            'subtitle: "תת כותרת"',
            'cancelBtn: "ביטול"',
            'submitBtn: "שליחה"',
            'saveChanges: "שמור שינויים"',
            'backHome: "חזרה לדף הבית"',
            'errorTitle: "שגיאה בטעינה"',
            'loadingText: "טוען נתונים..."',
        ];
        const strongRtlLines = [
            '# מסמך בעברית מלאה',
            'זהו מסמך בדיקה ארוך בעברית כדי שהעורך ייכנס למצב ימין לשמאל.',
            'עוד שורה בעברית כדי לעבור את הסף בבירור.',
        ];
        const strongLtrLines = [
            "import { format } from 'date-fns';",
            'export function render(value: string) {',
            '  return format(new Date(value), "yyyy-MM-dd");',
            '}',
        ];

        // 1) Starting from LTR -> scrolling into borderline (~58%) stays LTR
        rt.clearBody();
        const editor = rt.createMonacoEditor(strongLtrLines, { uri: 'file:///workspace/notes.txt' });
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), null);

        rt.setEditorLines(editor, borderlineLines);
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), null, 'LTR editor should stay LTR at ~58%');

        // 2) Entering strong RTL -> flips to RTL
        rt.setEditorLines(editor, strongRtlLines);
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), 'rtl');

        // 3) Scrolling from RTL into borderline (~58%) -> stays RTL (hysteresis)
        rt.setEditorLines(editor, borderlineLines);
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), 'rtl', 'RTL editor should stay RTL at ~58%');

        // 4) Scrolling into strong LTR (<50%) -> reverts to LTR
        rt.setEditorLines(editor, strongLtrLines);
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), null, 'RTL editor should revert to LTR below 50%');
    });
});

describe('editorRtlByFile rules, exclusions & CSS hygiene (RED → GREEN)', () => {
    it('respects editorRtl and editorRtlByFile overrides', () => {
        const hebrewMd = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lab/fixtures/hebrew.md'), 'utf-8');
        const englishMd = fs.readFileSync(path.join(REPO_ROOT, 'scripts/lab/fixtures/english.md'), 'utf-8');

        rt.setEditorMode('off', {});
        assert.equal(checkEditorDir(hebrewMd, 'file:///workspace/hebrew.md'), 'ltr');

        rt.setEditorMode('always', {});
        assert.equal(checkEditorDir(englishMd, 'file:///workspace/english.md'), 'rtl');

        rt.setEditorMode('off', { '*.md': 'auto', 'english.md': 'always' });
        assert.equal(checkEditorDir(hebrewMd, 'file:///workspace/hebrew.md'), 'rtl');
        assert.equal(checkEditorDir(englishMd, 'file:///workspace/english.md'), 'rtl');

        rt.setEditorMode('auto', {});
    });

    it('never flips Monaco editors embedded inside chat/markdown/plan containers', () => {
        rt.setEditorMode('always', {});
        rt.clearBody();
        const editor = rt.createMonacoEditor(['שלום עולם זה טקסט בעברית'], {
            uri: 'file:///workspace/snippet.md',
            parentClass: 'composer-rendered-message',
        });
        rt.scanAll();
        assert.equal(editor.getAttribute('data-cursor-rtl-dir'), null);
        rt.setEditorMode('auto', {});
    });

    it('keeps .monaco-editor anchored to LTR without setting unicode-bidi: plaintext globally', () => {
        const css = rt.getMainStyleText().replace(/\/\*[\s\S]*?\*\//g, '');
        const blocks = css.match(/[^{}]+\{[^}]*\}/g) || [];
        const offendingBidi = blocks.filter((block) => {
            const [selectorPart, bodyPart] = block.split('{');
            if (!/unicode-bidi\s*:\s*plaintext/i.test(bodyPart)) return false;
            const selectors = selectorPart.split(',').map((s) => s.trim());
            return selectors.some((s) => s === '.monaco-editor');
        });
        assert.equal(
            offendingBidi.length,
            0,
            `Found global bare .monaco-editor unicode-bidi: plaintext rule:\n${offendingBidi.join('\n')}`
        );

        const ltrAnchor = blocks.filter((block) => {
            const [selectorPart, bodyPart] = block.split('{');
            if (!/direction\s*:\s*ltr\s*!important/i.test(bodyPart)) return false;
            const selectors = selectorPart.split(',').map((s) => s.trim());
            return selectors.some((s) => s === '.monaco-editor');
        });
        assert.ok(ltrAnchor.length >= 1, 'Expected bare .monaco-editor to remain anchored to direction: ltr !important');
    });
});
