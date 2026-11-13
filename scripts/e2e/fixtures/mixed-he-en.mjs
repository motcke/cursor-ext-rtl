// Assistant reply as Cursor 3.21.16 renders it (IDE chat and Agents window
// share this markup; unchanged through 3.30.8). Captured from the lab; hashed
// utility classes and dir attributes stripped. Hebrew sentences from issue
// #18, Arabic ones from the Arabic comment on the same issue. Kept as a node
// tree rather than HTML because the workbench's Trusted Types policy blocks
// innerHTML and DOMParser alike.
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

export const SENTENCES_AR = {
    'AR-A': 'أ. هذا سطر عربي خالص لاختبار محاذاة اليمين.',
    'AR-B': 'ب. Please summarize your findings.',
    'AR-C': 'ج. isOnline = البيع المحلي لا يحتاج توكن ولا شبكة.',
    'AR-D': 'د. الشبكة + توكن غير فارغ شرطان، والباقي يعمل محليًا.',
    'AR-E': 'هـ. يعيد العميل المحاولة عند وصول رمز 401، والمنطق في pos_sale_session_provider.dart.',
    'AR-F': 'و. يرفض الخادم القيمة null داخل حقل isOnline عند الإقلاع.',
    'AR-G': 'ز. This is a long English paragraph that happens to mention كلمة واحدة and should stay LTR.',
    'AR-H': 'ح. البيع المحلي لا يحتاج شبكة إطلاقًا، والشرط كله يعتمد على isOnline.',
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
                ['ul', { class: 'ui-markdown__list' },
                    ...Object.entries(SENTENCES_AR).map(([key, text]) => li(key, text)),
                ],
            ],
        ],
    ],
];

// Expected per-block direction from the scorer (Hebrew/Arabic words score 2,
// English words 1). D and AR-G are an English sentence with a short RTL tail:
// LTR. E has five Hebrew words against six English ones: RTL.
export const MIXED_HE_EN_EXPECTED = {
    A: 'rtl', B: 'ltr', C: 'rtl', D: 'ltr', E: 'rtl', F: 'rtl', G: 'ltr', H: 'rtl',
    P1: 'rtl', P2: 'rtl', P3: 'ltr',
    'AR-A': 'rtl', 'AR-B': 'ltr', 'AR-C': 'rtl', 'AR-D': 'rtl', 'AR-E': 'rtl',
    'AR-F': 'rtl', 'AR-G': 'ltr', 'AR-H': 'rtl',
};

// RTL blocks that open with a Latin word: that word must be drawn at the
// right edge, before the RTL text that follows it. [key, latin, rtl word].
export const LATIN_FIRST_RTL = [
    ['C', 'OK', 'תתקן'],
    ['AR-C', 'isOnline', 'البيع'],
];
