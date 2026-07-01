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

        .ui-prompt-input-editor__input,
        .ui-prompt-input-editor__input > p,
        .ui-prompt-input-tiptap-readonly__content,
        .ui-prompt-input-tiptap-readonly__content > p {
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
        .composer-questionnaire-toolbar,
        .composer-questionnaire-toolbar-title,
        .composer-questionnaire-toolbar-question,
        .composer-questionnaire-toolbar-question-label,
        .composer-questionnaire-toolbar-option-label,
        .composer-questionnaire-toolbar-freeform-input,
        .user-questionnaire-answers-body,
        .user-questionnaire-answer-item,
        .user-questionnaire-question-text,
        .user-questionnaire-answer-text,
        .ui-tray,
        .ui-tray-header,
        .ui-tray-header__label,
        .ui-tray-step,
        .ui-tray-step__header,
        .ui-tray-step__title,
        .ui-tray-step__options,
        .ui-tray-option,
        .ui-tray-option__label,
        .ui-tray-actions {
            unicode-bidi: plaintext !important;
            text-align: start !important;
        }

        .ui-tray-option {
            margin-left: 0 !important;
            margin-inline-start: -6px !important;
            padding-left: 0 !important;
            padding-inline-start: 6px !important;
            align-items: flex-start !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
        }

        .ui-tray-actions {
            padding-left: 0 !important;
            padding-right: 0 !important;
            padding-inline-start: var(--cursor-spacing-3, 12px) !important;
            padding-inline-end: var(--cursor-spacing-2, 8px) !important;
        }

        .composer-questionnaire-toolbar-header {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            margin-left: 0 !important;
            margin-inline-start: 4px !important;
        }

        .composer-questionnaire-toolbar-question {
            margin-left: 0 !important;
            margin-inline-start: 4px !important;
        }

        .composer-questionnaire-toolbar-question-label {
            margin-left: 0 !important;
            margin-inline-start: 6px !important;
        }

        .composer-questionnaire-toolbar-question-number {
            text-align: start !important;
        }

        .composer-questionnaire-toolbar-options {
            margin-left: 0 !important;
            margin-inline-start: -4px !important;
        }

        .composer-questionnaire-toolbar-stepper {
            margin-left: 0 !important;
            margin-right: 0 !important;
            margin-inline-start: auto !important;
            margin-inline-end: 2px !important;
        }

        .composer-questionnaire-toolbar-option {
            display: flex !important;
            flex-direction: row !important;
            align-items: flex-start !important;
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

        #composer-toolbar-section[dir="rtl"],
        .composer-questionnaire-toolbar[dir="rtl"],
        .composer-questionnaire-toolbar[dir="rtl"] .composer-questionnaire-toolbar-questions,
        .composer-questionnaire-toolbar[dir="rtl"] .composer-questionnaire-toolbar-question,
        .composer-questionnaire-toolbar[dir="rtl"] .composer-questionnaire-toolbar-options,
        .user-questionnaire-question-text[dir="rtl"],
        .user-questionnaire-answer-text[dir="rtl"],
        .user-questionnaire-question-text[dir="rtl"] .markdown-root {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .composer-ask-question-tool-call-block,
        .composer-ask-question-tool-call-block .composer-tool-call-block-card,
        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-body {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }

        .composer-ask-question-tool-call-block .composer-tool-call-block-card {
            padding-left: 0 !important;
            padding-inline-start: 10px !important;
        }

        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-body {
            padding: 0 !important;
            padding-inline-start: 6px !important;
        }

        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-header,
        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-header-content {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }

        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-header {
            flex-direction: row !important;
        }

        .composer-ask-question-tool-call-block .composer-tool-call-simple-layout-header-right {
            margin-left: 0 !important;
            margin-inline-start: auto !important;
        }

        .composer-tool-call-simple-layout-body:has(.composer-questionnaire-toolbar[dir="rtl"]) {
            direction: rtl !important;
            padding: 0 !important;
            padding-inline-start: 6px !important;
        }

        .ui-tray[dir="rtl"],
        .ui-tray[dir="rtl"] .ui-tray-header,
        .ui-tray[dir="rtl"] .ui-tray-header__title-section,
        .ui-tray[dir="rtl"] .ui-tray-header__label,
        .ui-tray[dir="rtl"] .ui-tray-header__right,
        .ui-tray[dir="rtl"] .ui-tray-step,
        .ui-tray[dir="rtl"] .ui-tray-step__header,
        .ui-tray[dir="rtl"] .ui-tray-step__title,
        .ui-tray[dir="rtl"] .ui-tray-step__options,
        .ui-tray[dir="rtl"] .ui-tray-actions,
        .ui-tray-step[dir="rtl"],
        .ui-tray-step[dir="rtl"] .ui-tray-step__title,
        .agent-panel-followup-header-tray-stack[dir="rtl"] .ui-tray,
        .ui-prompt-input-header-tray__tray[dir="rtl"] .ui-tray {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .ui-tray[dir="rtl"] .ui-tray-step__title,
        .ui-tray-step[dir="rtl"] .ui-tray-step__title {
            width: 100% !important;
            max-width: 100% !important;
        }

        .ui-tray[dir="rtl"] .ui-tray-header__counter,
        .ui-tray[dir="rtl"] .ui-tray-header__stepper {
            direction: ltr !important;
            unicode-bidi: isolate !important;
        }

        .ui-tray-option[dir="ltr"],
        .ui-tray-option[dir="ltr"] .ui-tray-option__label,
        .ui-tray-option[dir="ltr"] .ui-tray-option__badge,
        .composer-questionnaire-toolbar-option[dir="ltr"],
        .composer-questionnaire-toolbar-option[dir="ltr"] .composer-questionnaire-toolbar-option-label,
        .composer-questionnaire-toolbar-option[dir="ltr"] .composer-questionnaire-toolbar-option-letter {
            direction: ltr !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .ui-tray-option[dir="rtl"],
        .ui-tray-option[dir="rtl"] .ui-tray-option__label,
        .ui-tray-option[dir="rtl"] .ui-tray-option__badge,
        .composer-questionnaire-toolbar-option[dir="rtl"],
        .composer-questionnaire-toolbar-option[dir="rtl"] .composer-questionnaire-toolbar-option-label,
        .composer-questionnaire-toolbar-option[dir="rtl"] .composer-questionnaire-toolbar-option-letter {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .ui-tray-option__label[dir="ltr"],
        .composer-questionnaire-toolbar-option-label[dir="ltr"] {
            direction: ltr !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
        }

        .ui-tray-option__label[dir="rtl"],
        .composer-questionnaire-toolbar-option-label[dir="rtl"] {
            direction: rtl !important;
            text-align: start !important;
            unicode-bidi: plaintext !important;
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
        .tiptap.ProseMirror li > p[dir="rtl"],
        .ui-prompt-input-editor__input[dir="rtl"],
        .ui-prompt-input-editor__input > p[dir="rtl"],
        .ui-prompt-input-tiptap-readonly__content[dir="rtl"],
        .ui-prompt-input-tiptap-readonly__content > p[dir="rtl"] {
            unicode-bidi: isolate !important;
            text-align: start !important;
        }

        .monaco-editor[data-cursor-rtl-dir="rtl"] .view-lines {
            direction: rtl !important;
        }

        .monaco-editor[data-cursor-rtl-dir="rtl"] .view-line {
            text-align: right !important;
            unicode-bidi: plaintext !important;
        }

        /* Monaco wraps each line's text in a <span dir="ltr"> with token spans
           set to unicode-bidi: isolate. That explicit LTR base pins leading
           list markers / punctuation / Latin runs to the left even on RTL
           lines. Overriding the wrapper's direction reorders the isolated
           token spans right-to-left, so "1." and friends land on the right. */
        .monaco-editor[data-cursor-rtl-dir="rtl"] .view-line > span {
            direction: rtl !important;
        }

        /* Move the vertical scrollbar to the left edge so it doesn't sit on
           top of the RTL text's starting margin. */
        .monaco-editor[data-cursor-rtl-dir="rtl"] .scrollbar.vertical {
            left: 0 !important;
            right: auto !important;
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
        '.ui-prompt-input-editor__input',
        '.ui-prompt-input-editor__input > p',
        '.ui-prompt-input-tiptap-readonly__content',
        '.ui-prompt-input-tiptap-readonly__content > p',
        '#composer-toolbar-section',
        '.composer-questionnaire-toolbar',
        '.composer-questionnaire-toolbar-title',
        '.composer-questionnaire-toolbar-header',
        '.composer-questionnaire-toolbar-question',
        '.composer-questionnaire-toolbar-question-label',
        '.composer-questionnaire-toolbar-question-number',
        '.composer-questionnaire-toolbar-options',
        '.composer-questionnaire-toolbar-option',
        '.composer-questionnaire-toolbar-option-label',
        '.composer-questionnaire-toolbar-freeform-input',
        '.user-questionnaire-question-text',
        '.user-questionnaire-answer-text',
        '.ui-tray',
        '.ui-tray-header',
        '.ui-tray-header__label',
        '.ui-tray-step',
        '.ui-tray-step__header',
        '.ui-tray-step__title',
        '.ui-tray-step__options',
        '.ui-tray-option',
        '.ui-tray-option__label',
        '.ui-tray-actions',
        '.agent-panel-followup-header-tray-stack',
        '.ui-prompt-input-header-tray__tray',
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
       TipTap editors). Plan-rendered TipTap content and Agent Window prompt input
       are allowed below because they need per-element direction while editing. */
    var SCAN_EXCLUDE = '.node-mermaid, .tiptap.ProseMirror';
    var TIPTAP_PLAN_ALLOW = '.plan-editor .tiptap.ProseMirror, .ui-plan-editor .tiptap.ProseMirror, .ui-rich-text-editor.plan-editor__richtext .tiptap.ProseMirror';
    var TIPTAP_PROMPT_ALLOW = '.ui-prompt-input .tiptap.ProseMirror, .agent-prompt-input-root .tiptap.ProseMirror, .composer-questionnaire-toolbar .tiptap.ProseMirror';
    var CODE_EXCLUDE = 'code, pre, .markdown-code-outer-container, .cursor-code-block-content, .markdown-lexical-editor-code-block';
    var PLAN_CONTEXT = '.plan-editor, .ui-plan-editor, .ui-rich-text-editor.plan-editor__richtext';

    function isExcludedElement(el) {
        if (!el) return false;
        if (el.closest(CODE_EXCLUDE)) return true;
        if (el.closest('.monaco-editor') && !el.closest(PLAN_CONTEXT)) return true;
        if (el.closest('.node-mermaid')) return true;
        var tiptap = el.closest('.tiptap.ProseMirror');
        return Boolean(tiptap && !tiptap.closest(TIPTAP_PLAN_ALLOW) && !tiptap.closest(TIPTAP_PROMPT_ALLOW));
    }

    /* Plan ProseMirror content is direction-managed exclusively through generated
       CSS (see applyPlanDir). Writing a `dir` attribute into ProseMirror-owned DOM
       makes ProseMirror revert the change and re-render its node views (e.g. the
       mermaid diagram), which produces a scan -> dir write -> ProseMirror reset
       loop that flickers the diagram. Never set `dir` directly inside it. */
    function isInsidePlanEditorContent(el) {
        if (!el || !el.closest) return false;
        var proseMirror = el.closest('.ProseMirror');
        return Boolean(proseMirror && proseMirror.closest(PLAN_CONTEXT));
    }

    var scanTimer = null;
    var observedRoots = new WeakSet();
    var planRootCounter = 0;
    var lastPlanStyleText = null;
    var RTL_TEXT = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0870-\u089F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFE]/g;
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

    function isQuestionnaireContainer(el) {
        if (!el || !el.matches) return false;
        return el.matches(
            '#composer-toolbar-section, .composer-questionnaire-toolbar, ' +
            '.composer-questionnaire-toolbar-questions, .composer-questionnaire-toolbar-question, ' +
            '.user-questionnaire-question-text, .user-questionnaire-answer-text, ' +
            '.ui-tray, .ui-tray-header, .ui-tray-step, .ui-tray-step__title, ' +
            '.ui-tray-option, .ui-tray-option__label, .ui-tray-actions, ' +
            '.agent-panel-followup-header-tray-stack, .ui-prompt-input-header-tray__tray'
        );
    }

    function isQuestionnaireOptionLabel(el) {
        return el.matches && el.matches(
            '.ui-tray-option__label, .composer-questionnaire-toolbar-option-label'
        );
    }

    function isQuestionnaireOption(el) {
        return el.matches && el.matches(
            '.ui-tray-option, .composer-questionnaire-toolbar-option'
        );
    }

    function getQuestionnaireOptionDir(el) {
        if (isQuestionnaireOptionLabel(el)) {
            return getTextDir(getElementText(el));
        }
        if (isQuestionnaireOption(el)) {
            var label = el.querySelector(
                '.ui-tray-option__label, .composer-questionnaire-toolbar-option-label'
            );
            if (label) return getTextDir(getElementText(label));
        }
        return null;
    }

    function getQuestionnaireDir(el) {
        var questions = el.querySelectorAll(
            '.composer-questionnaire-toolbar-question-label, ' +
            '.user-questionnaire-question-text, .ui-tray-step__title'
        );
        if (questions.length > 0) return getMajorityDir(questions);

        var answers = el.querySelectorAll('.user-questionnaire-answer-text');
        if (answers.length > 0) return getMajorityDir(answers);

        var ps = el.querySelectorAll('p');
        if (ps.length > 0) return getMajorityDir(ps);

        return getTextDir(getElementText(el));
    }

    function getDesiredDir(el) {
        if (el.matches && el.matches('ol, ul')) return getListDir(el);
        if (el.matches && el.matches('table')) return getTableDir(el);
        var optionDir = getQuestionnaireOptionDir(el);
        if (optionDir) return optionDir;
        if (isQuestionnaireContainer(el)) return getQuestionnaireDir(el);
        return getTextDir(getElementText(el));
    }

    function setManagedDirection(el, desiredDir) {
        el.setAttribute('dir', desiredDir);
    }

    function shouldKeepQuestionnaireDir(el, currentDir, desiredDir) {
        if (!el.matches || currentDir !== 'rtl' || desiredDir !== 'ltr') return false;
        if (el.matches('.user-questionnaire-question-text')) {
            return getMatches(getElementText(el), RTL_TEXT).length > 0;
        }
        return false;
    }

    function applyManagedDir(el) {
        if (isExcludedElement(el)) return false;
        if (isInsidePlanEditorContent(el)) return false;
        var desiredDir = getDesiredDir(el);
        var currentDir = el.getAttribute('dir');
        if (currentDir === desiredDir) {
            return false;
        }
        if (shouldKeepQuestionnaireDir(el, currentDir, desiredDir)) {
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
        var nextPlanStyle = rules.join('\n');
        if (nextPlanStyle !== lastPlanStyleText) {
            lastPlanStyleText = nextPlanStyle;
            planStyle.textContent = nextPlanStyle;
        }
    }

    function clearAskQuestionChromeDir(root) {
        try {
            var chrome = root.querySelectorAll(
                '.composer-ask-question-tool-call-block, ' +
                '.composer-ask-question-tool-call-block .composer-tool-call-block-card, ' +
                '.composer-ask-question-tool-call-block .composer-tool-call-simple-layout-body, ' +
                '.composer-ask-question-tool-call-block .user-questionnaire-answers-body, ' +
                '.composer-ask-question-tool-call-block .user-questionnaire-answer-item'
            );
            for (var i = 0; i < chrome.length; i++) {
                if (chrome[i].hasAttribute('dir')) {
                    chrome[i].removeAttribute('dir');
                }
            }
        } catch (e) {}
    }

    function scanRoot(root) {
        try {
            clearAskQuestionChromeDir(root);
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

    // --- Editor RTL (code editor direction) --------------------------------
    // Extends the same content detection used for chat/plan to Cursor's code
    // editor (Monaco). For each open editor we sample its visible lines, run
    // the shared getMajorityDir() scorer, and mark the editor RTL only when its
    // content is RTL-dominant — English/code editors are left untouched, so
    // this is safe to run automatically. A data attribute (not a class) is
    // used because Monaco rewrites the editor element's className.
    //
    // Mode comes from window.__cursorRtlConfig.editorRtl at inject time and can
    // be updated live by the loader via window.__cursorRtlSetEditorMode():
    //   'auto'   – direction follows each editor's dominant language (default)
    //   'always' – force every code editor RTL
    //   'off'    – never touch the code editor
    var EDITOR_EXCLUDE_SELECTOR = [
        '.composer-rendered-message',
        '.markdown-root',
        '.markdown-section',
        '.markdown-lexical-editor-container',
        '.markdown-code-outer-container',
        '.cursor-code-block-content',
        '.plan-editor',
        '.ui-plan-editor',
        '.aislash-editor-input',
        '.aislash-editor-input-readonly',
        '.ui-prompt-input-editor__input',
        '.ui-prompt-input-tiptap-readonly__content'
    ].join(', ');

    var EDITOR_LINE_SAMPLE = 80;
    var editorMode = 'auto';
    try {
        if (window.__cursorRtlConfig && typeof window.__cursorRtlConfig.editorRtl === 'string') {
            editorMode = window.__cursorRtlConfig.editorRtl;
        }
    } catch (e) {}

    function normalizeEditorMode(mode) {
        return (mode === 'auto' || mode === 'always' || mode === 'off') ? mode : 'auto';
    }

    function isFileEditor(editor) {
        if (!editor || !editor.closest) return false;
        // Skip chat/plan/markdown/code-block Monaco instances — those are
        // handled elsewhere and should stay LTR.
        return !editor.closest(EDITOR_EXCLUDE_SELECTOR);
    }

    function detectEditorDir(editor) {
        var lines = editor.querySelectorAll('.view-line');
        if (!lines.length) return 'ltr';
        var sample = [];
        var limit = Math.min(lines.length, EDITOR_LINE_SAMPLE);
        for (var i = 0; i < limit; i++) {
            sample.push(lines[i]);
        }
        return getMajorityDir(sample);
    }

    function setEditorDir(editor, dir) {
        if (dir === 'rtl') {
            if (editor.getAttribute('data-cursor-rtl-dir') !== 'rtl') {
                editor.setAttribute('data-cursor-rtl-dir', 'rtl');
            }
        } else if (editor.hasAttribute('data-cursor-rtl-dir')) {
            editor.removeAttribute('data-cursor-rtl-dir');
        }
    }

    function applyEditorDir() {
        var mode = normalizeEditorMode(editorMode);
        var editors = document.querySelectorAll('.monaco-editor');
        for (var i = 0; i < editors.length; i++) {
            var editor = editors[i];
            try {
                if (mode === 'off' || !isFileEditor(editor)) {
                    setEditorDir(editor, 'ltr');
                    continue;
                }
                var dir = mode === 'always' ? 'rtl' : detectEditorDir(editor);
                setEditorDir(editor, dir);
            } catch (e) {}
        }
    }

    window.__cursorRtlSetEditorMode = function(mode) {
        editorMode = normalizeEditorMode(mode);
        console.log(RTL_LOG, 'editor RTL mode:', editorMode);
        scanAll();
        return editorMode;
    };

    // Monaco's cursor controller has no RTL mode: pressing the physical
    // left/right arrow always moves by *logical* character order, which reads
    // backwards once we've flipped a line's visuals to RTL. We swap the two
    // horizontal arrows (preserving Shift/Alt/Ctrl/Meta modifiers) but only
    // while the focused editor is one we marked RTL, so LTR/code editors keep
    // their native behaviour. Installed once; guarded against re-injection.
    function installArrowSwap() {
        if (window.__cursorRtlArrowSwapInstalled) return;
        window.__cursorRtlArrowSwapInstalled = true;
        document.addEventListener('keydown', function(e) {
            try {
                if (e.__cursorRtlSwapped) return;
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                if (!e.target || !e.target.closest) return;
                var editor = e.target.closest('.monaco-editor[data-cursor-rtl-dir="rtl"]');
                if (!editor) return;
                var textarea = editor.querySelector('textarea.inputarea');
                if (!textarea) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                var toRight = e.key === 'ArrowLeft';
                var swapKey = toRight ? 'ArrowRight' : 'ArrowLeft';
                var swapCode = toRight ? 39 : 37;
                var swapped = new KeyboardEvent('keydown', {
                    key: swapKey,
                    code: swapKey,
                    bubbles: true,
                    cancelable: true,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey
                });
                // KeyboardEvent's constructor ignores keyCode/which; Monaco
                // reads them, so define them explicitly.
                Object.defineProperty(swapped, 'keyCode', { get: function() { return swapCode; } });
                Object.defineProperty(swapped, 'which', { get: function() { return swapCode; } });
                swapped.__cursorRtlSwapped = true;
                textarea.dispatchEvent(swapped);
            } catch (err) {}
        }, true);
        console.log(RTL_LOG, 'arrow-key swap installed for RTL editors');
    }
    // --- end Editor RTL ----------------------------------------------------

    function scanAll() {
        scanRoot(document);
        applyPlanDir();
        applyEditorDir();
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
    installArrowSwap();
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
