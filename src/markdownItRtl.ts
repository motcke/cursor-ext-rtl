import { getTextDir, TextDir } from './textDirection';

// Structural types for the slice of markdown-it we touch — the real
// markdown-it instance is provided at runtime by the built-in
// markdown-language-features extension, so it is not a dependency here.
export interface MdToken {
    type: string;
    content: string;
    level: number;
    attrSet(name: string, value: string): void;
}

export interface MarkdownItLike {
    core: {
        ruler: {
            push(name: string, rule: (state: { tokens: MdToken[] }) => void): void;
        };
    };
}

// Direction is baked into the rendered HTML (dir attributes on block tokens),
// so it survives the preview's innerHTML-based incremental updates — no DOM
// observation needed on the webview side.

function findListItemDir(tokens: MdToken[], openIndex: number): TextDir | null {
    const level = tokens[openIndex].level;
    for (let j = openIndex + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === 'list_item_close' && t.level === level) {
            return null;
        }
        if (t.type === 'inline' && t.content.trim()) {
            return getTextDir(t.content);
        }
    }
    return null;
}

// Whole-list direction follows the majority of its direct items (same rule
// as getListDir in rtl.js) so bullets/numbers sit on one consistent side;
// individual items still get their own dir.
function findListDir(tokens: MdToken[], openIndex: number): TextDir | null {
    const open = tokens[openIndex];
    const closeType = open.type.replace('_open', '_close');
    let rtl = 0;
    let ltr = 0;
    for (let j = openIndex + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === closeType && t.level === open.level) {
            break;
        }
        if (t.type === 'list_item_open' && t.level === open.level + 1) {
            const dir = findListItemDir(tokens, j);
            if (dir === 'rtl') rtl++;
            else if (dir === 'ltr') ltr++;
        }
    }
    if (rtl === 0 && ltr === 0) return null;
    return rtl > ltr ? 'rtl' : 'ltr';
}

// Whole-table direction follows the majority of its cells (same rule as
// getTableDir in rtl.js): an RTL table renders its first column rightmost,
// which is exactly how its author laid it out. Ties stay LTR.
function findTableDir(tokens: MdToken[], openIndex: number): TextDir | null {
    const level = tokens[openIndex].level;
    let rtl = 0;
    let ltr = 0;
    for (let j = openIndex + 1; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.type === 'table_close' && t.level === level) {
            break;
        }
        if (t.type === 'inline' && t.content.trim()) {
            if (getTextDir(t.content) === 'rtl') rtl++;
            else ltr++;
        }
    }
    if (rtl === 0 && ltr === 0) return null;
    return rtl > ltr ? 'rtl' : 'ltr';
}

export function applyRtlDirections(tokens: MdToken[]): void {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        switch (token.type) {
            // Every text block gets an explicit dir (not just RTL ones) so an
            // English paragraph nested in a Hebrew list item doesn't inherit rtl.
            case 'paragraph_open':
            case 'heading_open':
            case 'th_open':
            case 'td_open': {
                const inline = tokens[i + 1];
                if (inline && inline.type === 'inline' && inline.content.trim()) {
                    token.attrSet('dir', getTextDir(inline.content));
                }
                break;
            }
            case 'list_item_open': {
                const dir = findListItemDir(tokens, i);
                if (dir) {
                    token.attrSet('dir', dir);
                }
                break;
            }
            case 'bullet_list_open':
            case 'ordered_list_open': {
                const dir = findListDir(tokens, i);
                if (dir) {
                    token.attrSet('dir', dir);
                }
                break;
            }
            case 'table_open': {
                const dir = findTableDir(tokens, i);
                if (dir) {
                    token.attrSet('dir', dir);
                }
                break;
            }
        }
    }
}

export function markdownItCursorRtl(isEnabled: () => boolean) {
    return (md: MarkdownItLike): void => {
        md.core.ruler.push('cursor_rtl_dir', (state) => {
            if (!isEnabled()) {
                return;
            }
            applyRtlDirections(state.tokens);
        });
    };
}
