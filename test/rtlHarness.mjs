import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const RTL_JS_PATH = path.join(REPO_ROOT, 'resources', 'rtl.js');

// Loads a local TypeScript source file using Node's built-in type stripper so
// tests run with zero external dependencies even before `npm install`.
export function loadTsModule(relPath, cache = new Map()) {
    const absPath = path.resolve(REPO_ROOT, relPath);
    if (cache.has(absPath)) return cache.get(absPath);
    const raw = fs.readFileSync(absPath, 'utf-8');
    // Convert ESM syntax in our small pure-TS helper modules to CJS after stripping types.
    let js = stripTypeScriptTypes(raw, { mode: 'strip' });
    const exportedFns = [];
    js = js
        .replace(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/g, (_, names, spec) => {
            const cleanNames = names
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(', ');
            return `const { ${cleanNames} } = require(${JSON.stringify(spec)});`;
        })
        .replace(/export\s+function\s+([A-Za-z0-9_$]+)/g, (_, name) => {
            exportedFns.push(name);
            return `function ${name}`;
        })
        .replace(/export\s+const\s+([A-Za-z0-9_$]+)/g, 'const $1 = exports.$1');
    if (exportedFns.length) {
        js += '\n' + exportedFns.map((n) => `exports.${n} = ${n};`).join('\n');
    }

    const mod = { exports: {} };
    cache.set(absPath, mod.exports);
    const localRequire = (spec) => {
        const resolved = path.resolve(path.dirname(absPath), spec.endsWith('.ts') ? spec : `${spec}.ts`);
        return loadTsModule(path.relative(REPO_ROOT, resolved), cache);
    };
    vm.runInNewContext(js, { module: mod, exports: mod.exports, require: localRequire }, { filename: absPath });
    return mod.exports;
}

// Minimal CSS-selector-aware DOM mock sufficient to execute resources/rtl.js
// verbatim inside a vm sandbox without launching Electron/Chromium.

function splitSelectorList(selector) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < selector.length; i++) {
        const ch = selector[i];
        if (quote) {
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) {
            parts.push(selector.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(selector.slice(start).trim());
    return parts.filter(Boolean);
}

function matchSimpleSelector(el, simple, scopeEl) {
    if (!el || el.nodeType !== 1) return false;
    let rest = simple.trim();
    if (!rest || rest === '*') return true;

    if (rest.startsWith(':scope')) {
        if (el !== scopeEl) return false;
        rest = rest.slice(':scope'.length);
        if (!rest) return true;
    }

    const tokenRe = /([#.]?[A-Za-z0-9_-]+|\[[^\]]+\])/g;
    let match;
    let matchedAny = false;
    let consumed = 0;
    while ((match = tokenRe.exec(rest)) !== null) {
        if (match.index !== consumed) return false;
        consumed = tokenRe.lastIndex;
        matchedAny = true;
        const tok = match[0];
        if (tok.startsWith('#')) {
            if (el.getAttribute('id') !== tok.slice(1)) return false;
        } else if (tok.startsWith('.')) {
            const cls = tok.slice(1);
            const list = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
            if (!list.includes(cls)) return false;
        } else if (tok.startsWith('[')) {
            const inner = tok.slice(1, -1).trim();
            const attrMatch = inner.match(/^([A-Za-z0-9_-]+)(?:(\*?=)"([^"]*)"(?:\s+(i))?)?$/);
            if (!attrMatch) return false;
            const [, attrName, op, expected, ci] = attrMatch;
            const actual = el.getAttribute(attrName);
            if (actual === null) return false;
            if (op === '=') {
                const a = ci ? actual.toLowerCase() : actual;
                const b = ci ? expected.toLowerCase() : expected;
                if (a !== b) return false;
            } else if (op === '*=') {
                const a = ci ? actual.toLowerCase() : actual;
                const b = ci ? expected.toLowerCase() : expected;
                if (!a.includes(b)) return false;
            }
        } else {
            if (el.tagName.toLowerCase() !== tok.toLowerCase()) return false;
        }
    }
    return matchedAny && consumed === rest.length;
}

function tokenizeCompound(selector) {
    const tokens = [];
    let i = 0;
    const s = selector.trim();
    while (i < s.length) {
        if (/\s/.test(s[i])) {
            while (i < s.length && /\s/.test(s[i])) i++;
            if (s[i] === '>') {
                tokens.push('>');
                i++;
                while (i < s.length && /\s/.test(s[i])) i++;
            } else if (i < s.length) {
                tokens.push(' ');
            }
        } else if (s[i] === '>') {
            tokens.push('>');
            i++;
            while (i < s.length && /\s/.test(s[i])) i++;
        } else {
            let start = i;
            let bracket = 0;
            while (i < s.length) {
                if (s[i] === '[') bracket++;
                else if (s[i] === ']') bracket--;
                else if (bracket === 0 && (/\s/.test(s[i]) || s[i] === '>')) break;
                i++;
            }
            tokens.push(s.slice(start, i));
        }
    }
    return tokens;
}

function matchesSingleSelector(el, selector, scopeEl) {
    const tokens = tokenizeCompound(selector);
    if (!tokens.length) return false;

    function matchAt(node, idx) {
        if (!matchSimpleSelector(node, tokens[idx], scopeEl)) return false;
        if (idx === 0) return true;
        const comb = tokens[idx - 1];
        if (comb === '>') {
            return Boolean(node.parentElement && matchAt(node.parentElement, idx - 2));
        }
        // Descendant combinator
        let cur = node.parentElement;
        while (cur) {
            if (matchAt(cur, idx - 2)) return true;
            cur = cur.parentElement;
        }
        return false;
    }

    return matchAt(el, tokens.length - 1);
}

function matchesSelector(el, selector, scopeEl) {
    for (const part of splitSelectorList(selector)) {
        if (matchesSingleSelector(el, part, scopeEl)) return true;
    }
    return false;
}

class MockElement {
    constructor(tagName, attrs = {}, text = '') {
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.attrs = new Map();
        for (const [k, v] of Object.entries(attrs)) {
            this.attrs.set(k, String(v));
        }
        this.children = [];
        this.parentElement = null;
        this._text = text;
        this.shadowRoot = null;
    }

    get previousElementSibling() {
        if (!this.parentElement) return null;
        const idx = this.parentElement.children.indexOf(this);
        return idx > 0 ? this.parentElement.children[idx - 1] : null;
    }

    get textContent() {
        if (this.children.length === 0) return this._text;
        return this._text + this.children.map((c) => c.textContent).join('');
    }

    set textContent(val) {
        this._text = String(val ?? '');
        this.children = [];
    }

    getAttribute(name) {
        return this.attrs.has(name) ? this.attrs.get(name) : null;
    }

    setAttribute(name, value) {
        this.attrs.set(name, String(value));
    }

    hasAttribute(name) {
        return this.attrs.has(name);
    }

    removeAttribute(name) {
        this.attrs.delete(name);
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (!this.parentElement) return;
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
    }

    matches(selector) {
        return matchesSelector(this, selector, this);
    }

    closest(selector) {
        let cur = this;
        while (cur) {
            if (matchesSelector(cur, selector, cur)) return cur;
            cur = cur.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const walk = (node) => {
            for (const child of node.children) {
                if (matchesSelector(child, selector, this)) {
                    results.push(child);
                }
                walk(child);
            }
        };
        walk(this);
        return results;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    }
}

export function createRtlRuntime() {
    const documentElement = new MockElement('html');
    const head = new MockElement('head');
    const body = new MockElement('body');
    documentElement.appendChild(head);
    documentElement.appendChild(body);

    const document = {
        nodeType: 9,
        documentElement,
        head,
        body,
        baseURI: 'vscode-file://vscode-app/out/vs/code/electron-browser/workbench/workbench.html',
        createElement: (tag) => new MockElement(tag),
        querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
        querySelector: (sel) => documentElement.querySelector(sel),
        addEventListener: () => {},
    };

    const windowObj = {
        document,
        addEventListener: () => {},
    };

    const sandbox = {
        window: windowObj,
        document,
        URL,
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        fetch: () => Promise.resolve({ ok: false }),
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        console: { log: () => {}, warn: () => {}, error: () => {} },
    };

    const code = fs.readFileSync(RTL_JS_PATH, 'utf-8');
    vm.runInNewContext(code, sandbox, { filename: 'resources/rtl.js' });

    function el(tag, attrs = {}, children = []) {
        const node = new MockElement(tag, attrs);
        if (typeof children === 'string') {
            node.textContent = children;
        } else {
            for (const c of children) {
                if (typeof c === 'string') {
                    node._text += c;
                } else {
                    node.appendChild(c);
                }
            }
        }
        return node;
    }

    function clearBody() {
        body.children = [];
    }

    function getMainStyleText() {
        const styles = head.querySelectorAll('style[data-cursor-rtl-style="true"]');
        return styles.map((s) => s.textContent).join('\n');
    }

    function scanTextDir(text) {
        clearBody();
        const p = el('p', {}, text);
        const root = el('div', { class: 'markdown-root' }, [p]);
        body.appendChild(root);
        windowObj.__cursorRtlScanAll();
        return p.getAttribute('dir');
    }

    function createMonacoEditor(lines, { uri = 'file:///workspace/index.ts', parentClass = '' } = {}) {
        const viewLines = el(
            'div',
            { class: 'view-lines' },
            lines.map((line) => el('div', { class: 'view-line' }, line))
        );
        const editor = el('div', { class: 'monaco-editor', 'data-uri': uri }, [viewLines]);
        if (parentClass) {
            const wrapper = el('div', { class: parentClass }, [editor]);
            body.appendChild(wrapper);
        } else {
            body.appendChild(editor);
        }
        return editor;
    }

    function setEditorLines(editor, lines) {
        const viewLines = editor.querySelector('.view-lines');
        viewLines.children = [];
        for (const line of lines) {
            viewLines.appendChild(el('div', { class: 'view-line' }, line));
        }
    }

    return {
        window: windowObj,
        document,
        body,
        head,
        el,
        clearBody,
        getMainStyleText,
        scanTextDir,
        createMonacoEditor,
        setEditorLines,
        scanAll: () => windowObj.__cursorRtlScanAll(),
        setEditorMode: (mode, byFile) => windowObj.__cursorRtlSetEditorMode(mode, byFile),
    };
}
