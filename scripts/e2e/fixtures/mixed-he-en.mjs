// Assistant reply as Cursor 3.21.16 renders it (IDE chat and Agents window
// share this markup). Captured from the lab; hashed utility classes and dir
// attributes stripped. Sentences from issue #18. Kept as a node tree rather
// than HTML because the workbench's Trusted Types policy blocks innerHTML
// and DOMParser alike.
//   [tag, attrs, children...]  — a string child is a text node.
const li = (key, text) => ['li', { class: 'ui-markdown__list-item ui--default-marker', 'data-md-list-item': '', 'data-e2e': key }, text];
const p = (key, text) => ['p', { class: 'ui-markdown__paragraph', 'data-e2e': key }, text];

export const SENTENCES = {
    A: 'A. שלום, זה משפט עברית טהור לבדיקת יישור ימין.',
    B: 'B. Please summarize your findings.',
    C: 'C. OK, תתקן את הכותרת במובייל עכשיו.',
    D: 'D. Please check if EN is inside the menu, not the header. הכפתור כרגע בחוץ.',
    E: 'E. The WhatsApp button is too large. הכפתור גדול מדי וחוסם קריאה.',
    F: 'F. הלוגו חייב להיות הסימן, לא המילים eyal amit.',
    G: 'G. This is a long English paragraph that happens to mention אחד Hebrew word and should stay LTR.',
};

export const MIXED_HE_EN_TREE = ['div', { class: 'agent-transcript-row agent-transcript-row-markdown' },
    ['div', { style: 'color: inherit; user-select: text;' },
        ['div', { class: 'ui-markdown markdown-root', 'data-size': 'md' },
            ['div', { class: 'space-y-4 whitespace-normal' },
                ['ul', { class: 'ui-markdown__list' },
                    ...Object.entries(SENTENCES).map(([key, text]) => li(key, text)),
                ],
                ['h2', { class: 'ui-markdown__heading', 'data-e2e': 'H' }, 'משפטי בדיקה'],
                p('P1', 'שלום, זה משפט עברית טהור לבדיקת יישור ימין.'),
                p('P2', 'OK, תתקן את הכותרת במובייל עכשיו.'),
                p('P3', 'This is a long English paragraph that happens to mention אחד Hebrew word and should stay LTR.'),
            ],
        ],
    ],
];

// Expected per-block direction from the weighted scorer.
export const MIXED_HE_EN_EXPECTED = { A: 'rtl', B: 'ltr', C: 'rtl', F: 'rtl', G: 'ltr', H: 'rtl', P1: 'rtl', P2: 'rtl', P3: 'ltr' };
