(function() {
    const style = document.createElement('style');
    style.textContent = `
        .aislash-editor-placeholder {
            right: 15px !important;
            left: auto !important;
        }

        .markdown-root ul,
        .markdown-root ol,
        .markdown-lexical-editor-container ul,
        .markdown-lexical-editor-container ol,
        .plan-editor ul,
        .plan-editor ol {
            padding-inline-start: 20px !important;
            padding-inline-end: 0 !important;
        }

        .markdown-table-container {
            direction: ltr !important;
            overflow-x: auto !important;
            max-width: 100% !important;
            display: block !important;
            border-radius: 4px;
        }

        table.markdown-table {
            direction: rtl !important;
            width: max-content !important;
            min-width: 100% !important;
            border-collapse: collapse !important;
        }

        .markdown-table th,
        .markdown-table td {
            text-align: right !important;
            border: 1px solid var(--vscode-textSeparator-foreground) !important;
            padding: 6px 10px !important;
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
            direction: rtl !important;
            text-align: right !important;
        }

        .composer-questionnaire-toolbar-header {
            direction: rtl !important;
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
            margin-right: 8px !important;
            margin-left: 0 !important;
        }

        .composer-questionnaire-toolbar-actions {
            direction: rtl !important;
            display: flex !important;
            flex-direction: row-reverse !important;
            justify-content: flex-end !important;
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
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }
    `;
    document.head.appendChild(style);

    var DIR_SELECTOR = [
        '.markdown-section',
        '.composer-human-message p',
        '.composer-human-message div',
        '.composer-human-message span',
        '.aislash-editor-input p',
        '.aislash-editor-input-readonly p',
        '.aislash-editor-placeholder',
        '.composer-questionnaire-toolbar-question-label',
        '.composer-questionnaire-toolbar-option-label',
        '.composer-questionnaire-toolbar-freeform-input',
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
        '.plan-editor h2',
        '.plan-editor h3',
        '.plan-editor h4',
        '.plan-editor h5',
        '.plan-editor h6',
        '.plan-editor p',
        '.plan-editor li',
        '.plan-editor blockquote',
        '.plan-editor .ProseMirror',
        '.ui-rich-text-editor.plan-editor__richtext h1',
        '.ui-rich-text-editor.plan-editor__richtext h2',
        '.ui-rich-text-editor.plan-editor__richtext h3',
        '.ui-rich-text-editor.plan-editor__richtext h4',
        '.ui-rich-text-editor.plan-editor__richtext h5',
        '.ui-rich-text-editor.plan-editor__richtext h6',
        '.ui-rich-text-editor.plan-editor__richtext p',
        '.ui-rich-text-editor.plan-editor__richtext li',
        '.ui-rich-text-editor.plan-editor__richtext blockquote',
        /* TipTap/ProseMirror direct children (broader selectors) */
        '.tiptap.ProseMirror > h1',
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

    /* Containers whose children are handled by CSS (unicode-bidi: plaintext)
       or manage their own DOM (mermaid diagrams). Setting dir="auto" on their
       descendants triggers framework re-renders and must be avoided. */
    var SCAN_EXCLUDE = '.node-mermaid, .tiptap.ProseMirror';

    var scanTimer = null;
    var observedRoots = new WeakSet();

    function isExcludedMutation(mutation) {
        var target = mutation.target;
        if (!target) return false;
        var el = target.nodeType === 1 ? target : target.parentElement;
        return el && el.closest(SCAN_EXCLUDE);
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

    function applyDir(els) {
        for (var i = 0; i < els.length; i++) {
            if (els[i].closest(SCAN_EXCLUDE)) continue;
            if (els[i].getAttribute('dir') === 'auto') continue;
            els[i].setAttribute('dir', 'auto');
        }
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
        walkShadows(document.documentElement, scanRoot);
    }

    function scheduleScan() {
        if (scanTimer) return;
        scanTimer = setTimeout(function() {
            scanTimer = null;
            scanAll();
        }, 150);
    }

    attachObserver(document.documentElement);
    attachAllCurrentShadowObservers();
    scheduleScan();
    setTimeout(scanAll, 500);
    setTimeout(scanAll, 2000);
    setTimeout(scanAll, 5000);
    var planScanCount = 0;
    var planScanInterval = setInterval(function() {
        attachAllCurrentShadowObservers();
        scheduleScan();
        if (++planScanCount >= 5) clearInterval(planScanInterval);
    }, 3000);

    console.log("%c RTL Auto-Detection Active! ", "background: #e91e63; color: #fff; font-size: 14px; padding: 4px; border-radius: 4px;");
})();
