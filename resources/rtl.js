(function() {
    var RTL_LOG = "[Cursor RTL]";
    if (typeof window.__cursorRtlScanAll === 'function') {
        window.__cursorRtlScanAll();
        console.log(RTL_LOG, "re-inject: refreshed existing runtime");
        return;
    }
    console.log(RTL_LOG, "rtl.js started at", new Date().toISOString());

    function removeExistingCursorRtlStyles() {
        var styles = document.querySelectorAll('style');
        for (var i = 0; i < styles.length; i++) {
            var text = styles[i].textContent || '';
            var isCurrentStyle = styles[i].getAttribute('data-cursor-rtl-style') === 'true';
            var isPlanStyle = styles[i].getAttribute('data-cursor-rtl-plan-style') === 'true';
            var isLegacyStyle =
                text.indexOf('.markdown-table-container') !== -1 &&
                text.indexOf('.composer-questionnaire-toolbar') !== -1;
            if (isCurrentStyle || isPlanStyle || isLegacyStyle) {
                styles[i].remove();
            }
        }
    }

    removeExistingCursorRtlStyles();

    const style = document.createElement('style');
    style.setAttribute('data-cursor-rtl-style', 'true');
    style.textContent = `
        .aislash-editor-placeholder {
            right: 15px !important;
            left: auto !important;
        }

        .aislash-editor-input p,
        .aislash-editor-input-readonly p {
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }

        .composer-rendered-message .composer-human-message div:has(> div > .aislash-editor-input-readonly),
        .composer-rendered-message .composer-human-message div:has(> div > .aislash-editor-input) {
            flex-grow: 1 !important;
        }

        .markdown-root ul,
        .markdown-root ol,
        .markdown-lexical-editor-container ul,
        .markdown-lexical-editor-container ol,
        .plan-editor ul,
        .plan-editor ol,
        .ui-plan-editor ul,
        .ui-plan-editor ol {
            padding-inline-start: 20px !important;
            padding-inline-end: 0 !important;
        }

        .markdown-root strong,
        .markdown-root em,
        .markdown-lexical-editor-container strong,
        .markdown-lexical-editor-container em,
        .plan-editor strong,
        .plan-editor em,
        .ui-plan-editor strong,
        .ui-plan-editor em {
            unicode-bidi: isolate !important;
        }

        .markdown-table-container {
            direction: ltr !important;
            overflow-x: auto !important;
            max-width: 100% !important;
            display: block !important;
            border-radius: 4px;
        }

        .markdown-root table,
        .markdown-section table,
        .markdown-lexical-editor-container table,
        .composer-rendered-message table,
        .plan-editor table,
        .ui-plan-editor table,
        .ui-rich-text-editor.plan-editor__richtext table,
        .plan-editor .tiptap.ProseMirror table,
        .ui-plan-editor .tiptap.ProseMirror table,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table,
        table.markdown-table {
            width: max-content !important;
            min-width: 100% !important;
            border-collapse: collapse !important;
        }

        .markdown-root table th,
        .markdown-root table td,
        .markdown-section table th,
        .markdown-section table td,
        .markdown-lexical-editor-container table th,
        .markdown-lexical-editor-container table td,
        .composer-rendered-message table th,
        .composer-rendered-message table td,
        .plan-editor table th,
        .plan-editor table td,
        .plan-editor table th > p,
        .plan-editor table td > p,
        .ui-plan-editor table th,
        .ui-plan-editor table td,
        .ui-plan-editor table th > p,
        .ui-plan-editor table td > p,
        .ui-rich-text-editor.plan-editor__richtext table th,
        .ui-rich-text-editor.plan-editor__richtext table td,
        .ui-rich-text-editor.plan-editor__richtext table th > p,
        .ui-rich-text-editor.plan-editor__richtext table td > p,
        .plan-editor .tiptap.ProseMirror table th,
        .plan-editor .tiptap.ProseMirror table td,
        .plan-editor .tiptap.ProseMirror table th > p,
        .plan-editor .tiptap.ProseMirror table td > p,
        .ui-plan-editor .tiptap.ProseMirror table th,
        .ui-plan-editor .tiptap.ProseMirror table td,
        .ui-plan-editor .tiptap.ProseMirror table th > p,
        .ui-plan-editor .tiptap.ProseMirror table td > p,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table th,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table td,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table th > p,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table td > p,
        .markdown-table th,
        .markdown-table td {
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }

        .markdown-root table th > p,
        .markdown-root table td > p,
        .markdown-section table th > p,
        .markdown-section table td > p,
        .markdown-lexical-editor-container table th > p,
        .markdown-lexical-editor-container table td > p,
        .composer-rendered-message table th > p,
        .composer-rendered-message table td > p,
        .plan-editor table th > p,
        .plan-editor table td > p,
        .ui-plan-editor table th > p,
        .ui-plan-editor table td > p,
        .ui-rich-text-editor.plan-editor__richtext table th > p,
        .ui-rich-text-editor.plan-editor__richtext table td > p,
        .plan-editor .tiptap.ProseMirror table th > p,
        .plan-editor .tiptap.ProseMirror table td > p,
        .ui-plan-editor .tiptap.ProseMirror table th > p,
        .ui-plan-editor .tiptap.ProseMirror table td > p,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table th > p,
        .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror table td > p,
        .markdown-table th > p,
        .markdown-table td > p {
            border: 0 !important;
            padding: 0 !important;
        }

        code,
        pre,
        .markdown-code-outer-container,
        .cursor-code-block-content,
        .monaco-editor {
            direction: ltr !important;
            text-align: left !important;
            unicode-bidi: plaintext !important;
        }

        .markdown-root code,
        .markdown-lexical-editor-code-block {
            display: inline-block;
            direction: ltr;
        }

        #composer-toolbar-section,
        .composer-questionnaire-toolbar {
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }

        .composer-questionnaire-toolbar-header {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
        }

        .composer-questionnaire-toolbar-option {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: flex-start !important;
        }

        .composer-questionnaire-toolbar-option-label {
            margin-inline-end: 8px !important;
            margin-inline-start: 0 !important;
        }

        .composer-questionnaire-toolbar-actions {
            display: flex !important;
            justify-content: flex-end !important;
        }

        .plan-todos-section[dir="rtl"],
        .plan-todos-section__phase[dir="rtl"],
        .plan-todos-section__phase-list[dir="rtl"],
        .plan-list-row[dir="rtl"],
        .plan-list-row__text[dir="rtl"] {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .plan-todos-section[dir="rtl"] .plan-todos-section__phase-header,
        .plan-todos-section__phase[dir="rtl"] .plan-todos-section__phase-header,
        .plan-todos-section__phase-list[dir="rtl"] .plan-list-row[dir="rtl"],
        .plan-list-row.plan-todo__row[dir="rtl"] {
            direction: rtl !important;
            flex-direction: row !important;
            text-align: start !important;
        }

        .plan-list-row[dir="rtl"] .plan-list-row__text,
        .plan-list-row__text[dir="rtl"] {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .plan-todos-section[dir="rtl"],
        .plan-todos-section__phase[dir="rtl"],
        .plan-todos-section__phase-list[dir="rtl"],
        .plan-todos-section[class*="todo" i][dir="rtl"],
        .plan-todos-section__phase[class*="todo" i][dir="rtl"],
        .plan-todos-section__phase-list[class*="todo" i][dir="rtl"] {
            flex-direction: column !important;
        }

        .composer-create-plan-todos[dir="rtl"],
        .composer-create-plan-todos[class*="todo" i][dir="rtl"],
        .composer-create-plan-todos-list[dir="rtl"],
        .composer-create-plan-todos-list[class*="todo" i][dir="rtl"] {
            direction: rtl !important;
            flex-direction: column !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .composer-create-plan-todo-item[dir="rtl"],
        .composer-create-plan-todo-item[class*="todo" i][dir="rtl"] {
            direction: rtl !important;
            flex-direction: row !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .composer-create-plan-todo-content[dir="rtl"] {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .composer-rendered-message [class*="todo" i][class*="row" i][dir="rtl"],
        .composer-rendered-message [class*="todo" i][class*="item" i][dir="rtl"],
        .composer-rendered-message [class*="todo" i][class*="text" i][dir="rtl"],
        .human-message-with-todos-wrapper [class*="todo" i][class*="row" i][dir="rtl"],
        .human-message-with-todos-wrapper [class*="todo" i][class*="item" i][dir="rtl"],
        .human-message-with-todos-wrapper [class*="todo" i][class*="text" i][dir="rtl"] {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .composer-rendered-message [class*="todo" i][class*="row" i][dir="rtl"],
        .composer-rendered-message [class*="todo" i][class*="item" i][dir="rtl"],
        .human-message-with-todos-wrapper [class*="todo" i][class*="row" i][dir="rtl"],
        .human-message-with-todos-wrapper [class*="todo" i][class*="item" i][dir="rtl"] {
            flex-direction: row !important;
        }

        .markdown-root p,
        .markdown-root li,
        .markdown-root h1,
        .markdown-root h2,
        .markdown-root h3,
        .markdown-root h4,
        .markdown-root h5,
        .markdown-root h6,
        .markdown-root blockquote {
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }

        .plan-editor .ProseMirror > h1,
        .plan-editor .ProseMirror > h2,
        .plan-editor .ProseMirror > h3,
        .plan-editor .ProseMirror > h4,
        .plan-editor .ProseMirror > h5,
        .plan-editor .ProseMirror > h6,
        .plan-editor .ProseMirror > p,
        .plan-editor .ProseMirror > blockquote,
        .plan-editor .ProseMirror li > p,
        .ui-plan-editor .ProseMirror > h1,
        .ui-plan-editor .ProseMirror > h2,
        .ui-plan-editor .ProseMirror > h3,
        .ui-plan-editor .ProseMirror > h4,
        .ui-plan-editor .ProseMirror > h5,
        .ui-plan-editor .ProseMirror > h6,
        .ui-plan-editor .ProseMirror > p,
        .ui-plan-editor .ProseMirror > blockquote,
        .ui-plan-editor .ProseMirror li > p,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h1,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h2,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h3,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h4,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h5,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > h6,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > p,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror > blockquote,
        .ui-rich-text-editor.plan-editor__richtext .ProseMirror li > p,
        .tiptap.ProseMirror > h1,
        .tiptap.ProseMirror > h2,
        .tiptap.ProseMirror > h3,
        .tiptap.ProseMirror > h4,
        .tiptap.ProseMirror > h5,
        .tiptap.ProseMirror > h6,
        .tiptap.ProseMirror > p,
        .tiptap.ProseMirror > blockquote,
        .tiptap.ProseMirror li > p {
            unicode-bidi: isolate !important;
            text-align: start !important;
        }

        .markdown-root p[dir="rtl"],
        .markdown-root li[dir="rtl"],
        .markdown-root h1[dir="rtl"],
        .markdown-root h2[dir="rtl"],
        .markdown-root h3[dir="rtl"],
        .markdown-root h4[dir="rtl"],
        .markdown-root h5[dir="rtl"],
        .markdown-root h6[dir="rtl"],
        .markdown-root blockquote[dir="rtl"],
        .markdown-root table th[dir="rtl"],
        .markdown-root table td[dir="rtl"],
        .markdown-lexical-editor-container p[dir="rtl"],
        .markdown-lexical-editor-container li[dir="rtl"],
        .markdown-lexical-editor-container h1[dir="rtl"],
        .markdown-lexical-editor-container h2[dir="rtl"],
        .markdown-lexical-editor-container h3[dir="rtl"],
        .markdown-lexical-editor-container h4[dir="rtl"],
        .markdown-lexical-editor-container h5[dir="rtl"],
        .markdown-lexical-editor-container h6[dir="rtl"],
        .markdown-lexical-editor-container blockquote[dir="rtl"],
        .markdown-lexical-editor-container table th[dir="rtl"],
        .markdown-lexical-editor-container table td[dir="rtl"],
        .composer-rendered-message table th[dir="rtl"],
        .composer-rendered-message table td[dir="rtl"],
        .markdown-table th[dir="rtl"],
        .markdown-table td[dir="rtl"],
        .plan-editor p[dir="rtl"],
        .plan-editor li[dir="rtl"],
        .plan-editor h1[dir="rtl"],
        .plan-editor h2[dir="rtl"],
        .plan-editor h3[dir="rtl"],
        .plan-editor h4[dir="rtl"],
        .plan-editor h5[dir="rtl"],
        .plan-editor h6[dir="rtl"],
        .plan-editor blockquote[dir="rtl"],
        .ui-plan-editor p[dir="rtl"],
        .ui-plan-editor li[dir="rtl"],
        .ui-plan-editor h1[dir="rtl"],
        .ui-plan-editor h2[dir="rtl"],
        .ui-plan-editor h3[dir="rtl"],
        .ui-plan-editor h4[dir="rtl"],
        .ui-plan-editor h5[dir="rtl"],
        .ui-plan-editor h6[dir="rtl"],
        .ui-plan-editor blockquote[dir="rtl"],
        .tiptap.ProseMirror > p[dir="rtl"],
        .tiptap.ProseMirror > h1[dir="rtl"],
        .tiptap.ProseMirror > h2[dir="rtl"],
        .tiptap.ProseMirror > h3[dir="rtl"],
        .tiptap.ProseMirror > h4[dir="rtl"],
        .tiptap.ProseMirror > h5[dir="rtl"],
        .tiptap.ProseMirror > h6[dir="rtl"],
        .tiptap.ProseMirror > blockquote[dir="rtl"],
        .tiptap.ProseMirror li[dir="rtl"],
        .tiptap.ProseMirror li > p[dir="rtl"] {
            unicode-bidi: isolate !important;
            text-align: start !important;
        }
    `;
    document.head.appendChild(style);
    const planStyle = document.createElement('style');
    planStyle.setAttribute('data-cursor-rtl-plan-style', 'true');
    document.head.appendChild(planStyle);

    var DIR_SELECTOR = [
        '.markdown-section',
        '.markdown-root ul',
        '.markdown-root ol',
        '.markdown-root table',
        '.markdown-root p',
        '.markdown-root li',
        '.markdown-root h1',
        '.markdown-root h2',
        '.markdown-root h3',
        '.markdown-root h4',
        '.markdown-root h5',
        '.markdown-root h6',
        '.markdown-root blockquote',
        '.markdown-root table th',
        '.markdown-root table td',
        '.markdown-section table th',
        '.markdown-section table td',
        '.markdown-lexical-editor-container ul',
        '.markdown-lexical-editor-container ol',
        '.markdown-lexical-editor-container table',
        '.markdown-lexical-editor-container table th',
        '.markdown-lexical-editor-container table td',
        '.composer-rendered-message table th',
        '.composer-rendered-message table td',
        '.markdown-table th',
        '.markdown-table td',
        '.composer-human-message p',
        '.composer-human-message div',
        '.aislash-editor-input p',
        '.aislash-editor-input-readonly p',
        '.aislash-editor-placeholder',
        '.composer-questionnaire-toolbar',
        '.composer-questionnaire-toolbar-question-label',
        '.composer-questionnaire-toolbar-option-label',
        '.composer-questionnaire-toolbar-freeform-input',
        '.plan-todos-section',
        '.plan-todos-section__phase',
        '.plan-todos-section__phase-list',
        '.plan-list-row',
        '.plan-list-row__text',
        '.composer-create-plan-todos',
        '.composer-create-plan-todos-list',
        '.composer-create-plan-todo-item',
        '.composer-create-plan-todo-content',
        '.human-message-with-todos-wrapper',
        '.composer-rendered-message [class*="todo" i][class*="row" i]',
        '.composer-rendered-message [class*="todo" i][class*="item" i]',
        '.composer-rendered-message [class*="todo" i][class*="text" i]',
        '.human-message-with-todos-wrapper [class*="todo" i][class*="row" i]',
        '.human-message-with-todos-wrapper [class*="todo" i][class*="item" i]',
        '.human-message-with-todos-wrapper [class*="todo" i][class*="text" i]',
        '.markdown-lexical-editor-container p',
        '.markdown-lexical-editor-container div',
        '.markdown-lexical-editor-container li',
        '.markdown-lexical-editor-container h1',
        '.markdown-lexical-editor-container h2',
        '.markdown-lexical-editor-container h3',
        '.markdown-lexical-editor-container h4',
        '.markdown-lexical-editor-container h5',
        '.markdown-lexical-editor-container h6',
        '.markdown-lexical-editor-container blockquote',
        /* Plan editor (TipTap/ProseMirror - .plan.md files) */
        '.plan-editor h1',
        '.plan-editor ul',
        '.plan-editor ol',
        '.plan-editor table',
        '.plan-editor table th',
        '.plan-editor table td',
        '.plan-editor table th > p',
        '.plan-editor table td > p',
        '.plan-editor h2',
        '.plan-editor h3',
        '.plan-editor h4',
        '.plan-editor h5',
        '.plan-editor h6',
        '.plan-editor p',
        '.plan-editor li',
        '.plan-editor blockquote',
        '.plan-editor .ProseMirror',
        '.ui-plan-editor h1',
        '.ui-plan-editor h2',
        '.ui-plan-editor h3',
        '.ui-plan-editor h4',
        '.ui-plan-editor h5',
        '.ui-plan-editor h6',
        '.ui-plan-editor p',
        '.ui-plan-editor li',
        '.ui-plan-editor blockquote',
        '.ui-plan-editor table',
        '.ui-plan-editor table th',
        '.ui-plan-editor table td',
        '.ui-plan-editor table th > p',
        '.ui-plan-editor table td > p',
        '.ui-plan-editor .ProseMirror',
        '.ui-rich-text-editor.plan-editor__richtext h1',
        '.ui-rich-text-editor.plan-editor__richtext h2',
        '.ui-rich-text-editor.plan-editor__richtext h3',
        '.ui-rich-text-editor.plan-editor__richtext h4',
        '.ui-rich-text-editor.plan-editor__richtext h5',
        '.ui-rich-text-editor.plan-editor__richtext h6',
        '.ui-rich-text-editor.plan-editor__richtext p',
        '.ui-rich-text-editor.plan-editor__richtext li',
        '.ui-rich-text-editor.plan-editor__richtext blockquote',
        '.ui-rich-text-editor.plan-editor__richtext table',
        '.ui-rich-text-editor.plan-editor__richtext table th',
        '.ui-rich-text-editor.plan-editor__richtext table td',
        '.ui-rich-text-editor.plan-editor__richtext table th > p',
        '.ui-rich-text-editor.plan-editor__richtext table td > p',
        /* TipTap/ProseMirror direct children (broader selectors) */
        '.tiptap.ProseMirror > h1',
        '.tiptap.ProseMirror > ul',
        '.tiptap.ProseMirror > ol',
        '.tiptap.ProseMirror table',
        '.tiptap.ProseMirror table th',
        '.tiptap.ProseMirror table td',
        '.tiptap.ProseMirror table th > p',
        '.tiptap.ProseMirror table td > p',
        '.tiptap.ProseMirror > h2',
        '.tiptap.ProseMirror > h3',
        '.tiptap.ProseMirror > h4',
        '.tiptap.ProseMirror > h5',
        '.tiptap.ProseMirror > h6',
        '.tiptap.ProseMirror > p',
        '.tiptap.ProseMirror > blockquote',
        '.tiptap.ProseMirror li',
        '.tiptap.ProseMirror li > p'
    ].join(', ');

    /* Containers whose children manage their own DOM (mermaid diagrams and most
       TipTap editors). Plan-rendered TipTap content is allowed below because it
       needs per-element direction when Markdown starts with LTR text. */
    var SCAN_EXCLUDE = '.node-mermaid, .tiptap.ProseMirror';
    var TIPTAP_PLAN_ALLOW = '.plan-editor .tiptap.ProseMirror, .ui-plan-editor .tiptap.ProseMirror, .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror';
    var CODE_EXCLUDE = 'code, pre, .markdown-code-outer-container, .cursor-code-block-content, .markdown-lexical-editor-code-block';
    var PLAN_CONTEXT = '.plan-editor, .ui-plan-editor, .ui-rich-text-editor.plan-editor__richtext';

    function isExcludedElement(el) {
        if (!el) return false;
        if (el.closest(CODE_EXCLUDE)) return true;
        if (el.closest('.monaco-editor') && !el.closest(PLAN_CONTEXT)) return true;
        if (el.closest('.node-mermaid')) return true;
        var tiptap = el.closest('.tiptap.ProseMirror');
        return Boolean(tiptap && !tiptap.closest(TIPTAP_PLAN_ALLOW));
    }

    var scanTimer = null;
    var observedRoots = new WeakSet();
    var planRootCounter = 0;
    var RTL_TEXT = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
    var LTR_TEXT = /[A-Za-z]/g;

    function isExcludedMutation(mutation) {
        if (mutation.type === 'childList') {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
                var added = mutation.addedNodes[i];
                if (!added || added.nodeType !== 1) continue;
                if (!isExcludedElement(added)) return false;
                if (added.querySelectorAll) {
                    var nested = added.querySelectorAll(DIR_SELECTOR);
                    for (var j = 0; j < nested.length; j++) {
                        if (!isExcludedElement(nested[j])) return false;
                    }
                }
            }
        }
        var target = mutation.target;
        if (!target) return false;
        var el = target.nodeType === 1 ? target : target.parentElement;
        return isExcludedElement(el);
    }

    function discoverShadowRoots(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            if (m.type !== 'childList') continue;
            for (var j = 0; j < m.addedNodes.length; j++) {
                var added = m.addedNodes[j];
                if (!added || added.nodeType !== 1) continue;
                if (added.shadowRoot && !observedRoots.has(added.shadowRoot)) {
                    attachObserver(added.shadowRoot);
                }
                if (added.querySelectorAll) {
                    var nested = added.querySelectorAll('*');
                    for (var k = 0; k < nested.length; k++) {
                        if (nested[k].shadowRoot && !observedRoots.has(nested[k].shadowRoot)) {
                            attachObserver(nested[k].shadowRoot);
                        }
                    }
                }
            }
        }
    }

    function attachObserver(root) {
        if (!root || observedRoots.has(root)) return;
        observedRoots.add(root);
        var mo = new MutationObserver(function(mutations) {
            var dominated = true;
            for (var i = 0; i < mutations.length; i++) {
                if (!isExcludedMutation(mutations[i])) {
                    dominated = false;
                    break;
                }
            }
            discoverShadowRoots(mutations);
            if (!dominated) scheduleScan();
        });
        mo.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-state']
        });
    }

    function attachAllCurrentShadowObservers() {
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var sr = all[i].shadowRoot;
            if (sr && !observedRoots.has(sr)) {
                attachObserver(sr);
            }
        }
    }

    var appliedCount = 0;
    function getMatches(text, pattern) {
        return text.match(pattern) || [];
    }

    function getLtrTokenWeight(token) {
        if (/[._/\\:]/.test(token)) return 0.25;
        if (/^[A-Z0-9-]{2,}$/.test(token)) return 0.5;
        if (/^[a-z]+[A-Z]/.test(token)) return 0.5;
        return 1;
    }

    function getTextDir(text) {
        var value = text || '';
        var rtlRuns = getMatches(value, RTL_TEXT);
        var ltrTokens = getMatches(value, /[A-Za-z][A-Za-z0-9._/\\:-]*/g);
        if (rtlRuns.length === 0) return 'ltr';
        if (ltrTokens.length === 0) return 'rtl';

        var rtlScore = rtlRuns.length * 1.5;
        var ltrScore = 0;
        for (var i = 0; i < ltrTokens.length; i++) {
            ltrScore += getLtrTokenWeight(ltrTokens[i]);
        }
        return rtlScore >= ltrScore ? 'rtl' : 'ltr';
    }

    function getMajorityDir(els) {
        var rtlCount = 0;
        var ltrCount = 0;
        for (var i = 0; i < els.length; i++) {
            var dir = getTextDir(els[i].textContent || '');
            if (dir === 'rtl') rtlCount++;
            else ltrCount++;
        }
        return rtlCount > ltrCount ? 'rtl' : 'ltr';
    }

    function getListDir(el) {
        var items = el.querySelectorAll(':scope > li');
        return items.length > 0 ? getMajorityDir(items) : getTextDir(el.textContent || '');
    }

    function getTableDir(el) {
        var cells = el.querySelectorAll(':scope th, :scope td');
        return cells.length > 0 ? getMajorityDir(cells) : getTextDir(el.textContent || '');
    }

    function getElementText(el) {
        if (!el) return '';
        if (typeof el.value === 'string') return el.value;
        return el.textContent || '';
    }

    function getDesiredDir(el) {
        if (el.matches && el.matches('ol, ul')) return getListDir(el);
        if (el.matches && el.matches('table')) return getTableDir(el);
        return getTextDir(getElementText(el));
    }

    function setManagedDirection(el, desiredDir) {
        el.setAttribute('dir', desiredDir);
    }

    function applyManagedDir(el) {
        if (isExcludedElement(el)) return false;
        var desiredDir = getDesiredDir(el);
        var currentDir = el.getAttribute('dir');
        if (currentDir === desiredDir) {
            return false;
        }
        setManagedDirection(el, desiredDir);
        appliedCount++;
        return true;
    }

    function applyDir(els) {
        for (var i = 0; i < els.length; i++) {
            try {
                applyManagedDir(els[i]);
            } catch (e) {}
        }
    }

    function ensurePlanRootId(root) {
        var id = root.getAttribute('data-cursor-rtl-plan-root');
        if (id) return id;
        id = String(++planRootCounter);
        root.setAttribute('data-cursor-rtl-plan-root', id);
        return id;
    }

    function getElementIndex(el) {
        var index = 1;
        var sibling = el.previousElementSibling;
        while (sibling) {
            index++;
            sibling = sibling.previousElementSibling;
        }
        return index;
    }

    function getPlanRelativeSelector(el, boundary) {
        var parts = [];
        var current = el;
        while (current && current !== boundary) {
            if (current.nodeType !== 1) return '';
            parts.unshift(current.tagName.toLowerCase() + ':nth-child(' + getElementIndex(current) + ')');
            current = current.parentElement;
        }
        return current === boundary ? parts.join(' > ') : '';
    }

    function appendPlanDirectionRule(rules, rootId, editor, el) {
        if (isExcludedElement(el)) return;
        var desiredDir = getDesiredDir(el);
        var relativeSelector = getPlanRelativeSelector(el, editor);
        if (!relativeSelector) return;
        rules.push(
            '[data-cursor-rtl-plan-root="' + rootId + '"] .tiptap.ProseMirror > ' +
            relativeSelector +
            ' { direction: ' + desiredDir + ' !important; unicode-bidi: isolate !important; text-align: start !important; }'
        );
    }

    function applyPlanDir() {
        var roots = document.querySelectorAll(PLAN_CONTEXT);
        var selector = [
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'p',
            'blockquote',
            'ol',
            'ul',
            'li',
            'table',
            'th',
            'td'
        ].join(', ');
        var rules = [];
        for (var i = 0; i < roots.length; i++) {
            var rootId = ensurePlanRootId(roots[i]);
            var editors = roots[i].querySelectorAll('.tiptap.ProseMirror, .ProseMirror');
            for (var e = 0; e < editors.length; e++) {
                var editor = editors[e];
                if (isExcludedElement(editor)) continue;
                var editorDir = getDesiredDir(editor);
                rules.push(
                    '[data-cursor-rtl-plan-root="' + rootId + '"] .tiptap.ProseMirror { direction: ' +
                    editorDir +
                    ' !important; text-align: start !important; }'
                );
                var planEls = editor.querySelectorAll(selector);
                for (var p = 0; p < planEls.length; p++) {
                    try {
                        appendPlanDirectionRule(rules, rootId, editor, planEls[p]);
                    } catch (e) {}
                }
            }
            var els = roots[i].querySelectorAll(selector);
            for (var j = 0; j < els.length; j++) {
                try {
                    if (!els[j].closest('.tiptap.ProseMirror')) {
                        applyManagedDir(els[j]);
                    }
                } catch (e) {}
            }
        }
        planStyle.textContent = rules.join('\n');
    }

    function scanRoot(root) {
        try {
            var els = root.querySelectorAll(DIR_SELECTOR);
            applyDir(els);
        } catch (e) {}
    }

    function walkShadows(root, fn) {
        fn(root);
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
            var sr = all[i].shadowRoot;
            if (sr) {
                walkShadows(sr, fn);
            }
        }
    }

    function scanAll() {
        scanRoot(document);
        applyPlanDir();
        try {
            walkShadows(document.documentElement, scanRoot);
        } catch (e) {}
    }

    window.__cursorRtlScanAll = scanAll;
    window.__cursorRtlApplyPlanDir = applyPlanDir;

    function scheduleScan() {
        if (scanTimer) return;
        scanTimer = setTimeout(function() {
            scanTimer = null;
            scanAll();
        }, 150);
    }

    window.addEventListener('focus', scheduleScan);
    document.addEventListener('visibilitychange', scheduleScan);

    attachObserver(document.documentElement);
    attachAllCurrentShadowObservers();
    scanAll();
    scheduleScan();
    setTimeout(function() {
        scanAll();
        console.log(RTL_LOG, "First scan done, applied dir to", appliedCount, "elements");
    }, 500);
    setTimeout(scanAll, 2000);
    setTimeout(scanAll, 5000);
    setTimeout(function() {
        attachAllCurrentShadowObservers();
        scheduleScan();
        console.log(RTL_LOG, "Total dir attributes applied so far:", appliedCount);
    }, 3000);

    console.log("%c RTL Auto-Detection Active! ", "background: #e91e63; color: #fff; font-size: 14px; padding: 4px; border-radius: 4px;");
})();
