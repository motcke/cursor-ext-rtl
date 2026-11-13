// Ask-question tool as Cursor 3.26.16 renders it, captured from the lab:
// the IDE chat's composer toolbar and the Agents window's tray. Hashed
// utility classes and dir attributes stripped. Questions from issue #19:
// each starts with an English word and has another one in the middle, and
// two options start with an English word. Same [tag, attrs, children...]
// tree format as mixed-he-en.mjs.
const md = (key, text) => ['div', {},
    ['div', { class: 'ui-markdown markdown-root' },
        ['div', { class: 'space-y-4 whitespace-normal' },
            ['p', { class: 'ui-markdown__paragraph', 'data-e2e': key }, text],
        ],
    ],
];

export const QUESTIONS = {
    Q1: 'Cursor לא מיישר את המילה RTL באמצע השאלה',
    Q2: 'RTL נשבר כשיש מילה English באמצע המשפט',
};

export const OPTIONS = {
    O1: 'Cursor נשאר בקצה השמאלי',
    O2: 'עברית בלבד מיושרת נכון',
    O3: 'RTL זז לצד הלא נכון',
    O4: 'המילה English קופצת באמצע',
};

const toolbarOption = (letter, key) => ['div', { class: 'composer-questionnaire-toolbar-option' },
    ['button', { class: 'composer-questionnaire-toolbar-option-letter' }, letter],
    ['span', { class: 'composer-questionnaire-toolbar-option-label', 'data-e2e': `ide-${key}` }, OPTIONS[key]],
];

const toolbarQuestion = (n, q, a, b) => ['div', { class: 'composer-questionnaire-toolbar-question' },
    ['div', { class: 'composer-questionnaire-toolbar-question-label' },
        ['div', { class: 'composer-questionnaire-toolbar-question-number' }, `${n}.`],
        md(`ide-${q}`, QUESTIONS[q]),
    ],
    ['div', { class: 'composer-questionnaire-toolbar-options' }, toolbarOption('A', a), toolbarOption('B', b)],
];

// IDE window: composer toolbar.
export const TOOLBAR_TREE = ['div', { class: 'composer-questionnaire-toolbar' },
    ['div', { class: 'composer-questionnaire-toolbar-header' },
        ['span', { class: 'composer-questionnaire-toolbar-title' }, 'Questions'],
    ],
    ['div', { class: 'composer-questionnaire-toolbar-questions' },
        toolbarQuestion(1, 'Q1', 'O1', 'O2'),
        toolbarQuestion(2, 'Q2', 'O3', 'O4'),
    ],
];

const trayOption = (letter, key) => ['button', { class: 'ui-tray-option' },
    ['span', { class: 'ui-tray-option__badge' }, letter],
    ['span', { class: 'ui-text ui-tray-option__label', 'data-e2e': `tray-${key}` }, OPTIONS[key]],
];

// Agents window: tray. The counter is three text nodes in one span; in an
// RTL tray the bidi algorithm would show "of 3 1".
export const TRAY_TREE = ['div', { class: 'ui-tray' },
    ['div', { class: 'ui-scroll-area' },
        ['div', { class: 'ui-scroll-area__viewport' },
            ['div', { class: 'ui-scroll-area__content' },
                ['div', { class: 'ui-tray-step' },
                    ['div', { class: 'ui-tray-step__header' },
                        ['div', { class: 'ui-tray-step__title' }, md('tray-Q1', QUESTIONS.Q1)],
                    ],
                    ['div', { class: 'ui-tray-step__options' }, trayOption('A', 'O1'), trayOption('B', 'O2')],
                ],
            ],
        ],
    ],
    ['div', { class: 'ui-tray-footer' },
        ['div', { class: 'ui-tray-footer__tertiary' },
            ['span', { 'data-e2e': 'tray-counter' }, '1', ' of ', '3'],
        ],
    ],
];

// Every question and option here is RTL by the weighted scorer; the ones
// that start with an English word must still keep that word at the right.
export const QUESTIONNAIRE_EXPECTED_RTL = [
    'ide-Q1', 'ide-Q2', 'ide-O1', 'ide-O2', 'ide-O3', 'ide-O4',
    'tray-Q1', 'tray-O1', 'tray-O2',
];
