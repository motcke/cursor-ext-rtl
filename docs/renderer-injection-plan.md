# תכנית: הזרקת RTL מתוך ה-renderer במקום מתהליך ה-main

מסמך מימוש, וכעת גם תיעוד as-built. מחליף את handoff ההזרקה המקורי אחרי שאומת מול Cursor 3.16.29 (Windows, התקנה ב-`%LOCALAPPDATA%\Programs\cursor`) ב-2026-08-30.

## 0. סטטוס ביצוע (נכון ל-2026-08-31)

**שלבים 1-8 בוצעו במלואם; שלב 9 (התקנה אמיתית) טרם בוצע** — מתבצע ידנית לפי [manual-qa-checklist.md](manual-qa-checklist.md).

שינוי מהותי אחד מהתכנון המקורי, מתועד בסעיפים 2 ו-3.1: נקודת ההזרקה עברה מ-`workbench.js` ל-`preload.js`, אחרי שהתגלה ש-Reload Window לא קורא מחדש קבצים שמוגשים דרך `vscode-file` (cache). כל שאר הארכיטקטורה כמתוכנן.

תוצאות ה-e2e (ריצה מלאה ברצף, `npm run e2e`):

| תרחיש | תוצאה |
|---|---|
| first-install | ירוק |
| migration-from-1.2 | ירוק |
| cursor-update | ירוק — reload אחד בדיוק, מסלול אוטומטי |
| agents-window | ירוק |
| second-window | ירוק |
| editor-mode | ירוק — החלה חיה בלי reload בשני הכיוונים |
| extension-update | ירוק |
| permissions | ירוק |
| disable | ירוק |
| startup | ירוק — חציון מפוצ'ר 2226ms מול נקי 2259ms במדידה מסורגת (דלתא בתוך הרעש, הרבה מתחת לתקרת 100ms) |

פתוח: הצעד הידני של יצירת שתי שיחות עברית בפרופיל המעבדה (סעיף 7.1) — עד אז חלקי היסטוריית הצ'אט בצילומים מדווחים pending, ואחריו יש לרענן baseline (`npm run e2e` ואז `npm run e2e:approve`).

## 1. המטרה

היום הפאץ' יושב ב-`out/main.js`, שנטען פעם אחת בתהליך ה-main של Electron. אחרי כל עדכון של Cursor המשתמש צריך ריסטארט נוסף רק כדי שה-loader ייטען. המטרה היא שהפאץ' יישב בקובץ שנטען בתהליך ה-renderer, כך שאחרי עדכון Cursor ההרחבה מפצ'רת ומריצה `Reload Window` בעצמה, בלי פעולה של המשתמש.

## 2. עובדות שאומתו מול ההתקנה

כל שורה כאן נבדקה בפועל. אל תסתמכו על ה-handoff הישן במקומות שבהם הוא סותר את הטבלה.

| נושא | מה נכון | איך אומת |
|---|---|---|
| ה-checksum ב-`product.json` | SHA-256 של תוכן הקובץ, base64 בלי `=` בסוף. לא MD5 | `sha256(workbench.desktop.main.js)` נקי זהה לערך ב-`product.json`. md5 נותן 22 תווים ולא תואם |
| קבצים ב-`checksums` | `preload.js`, `workbench.desktop.main.js`, `workbench.desktop.main.css`, `extensionHostProcess.js`, `workbench.html`, `workbench.js`. הבאנדל `workbench.glass.main.js` לא ברשימה | `product.json` שורות 2264-2271 |
| שני באנדלים של workbench | `out/vs/workbench/workbench.desktop.main.js` (41MB) ו-`workbench.glass.main.js` (49MB). `workbench.js` בוחר ביניהם בזמן ריצה לפי `config.glass` (`resolveEsModule`) | `workbench.js` |
| מה זה glass | חלון ה-Agents. ב-`main.js` יש דגל CLI בשם `glass`, `openGlassWindow`, ופקודה `cursor.openOrFocusGlassWindow`. אותו `workbench.html` משרת את שני סוגי החלונות | `main.js` |
| הבאנדלים הם ES modules | שניהם מסתיימים ב-`export{... as main}` ונטענים ב-`import()` | tail של הקבצים |
| `workbench.js` | 32KB, נטען מ-`workbench.html` כ-`<script type="module">`, קורא ל-`a.load("vs/workbench/workbench.desktop.main", {resolveEsModule})`. הקובץ היחיד שעובר בו כל חלון | `workbench.html`, `workbench.js` |
| אזהרת "installation appears to be corrupt" | קיימת ב-Cursor: המחרוזת ב-`nls.messages.json`, וקוד ה-integrity service שקורא `checksums` נמצא בבאנדל | grep |
| CSP של `workbench.html` | `script-src 'self' 'unsafe-eval' blob:`, `connect-src 'self' http: https: ws:`, `require-trusted-types-for 'script'`. קובץ תחת `out/` נחשב `'self'` | `workbench.html` |
| ה-renderer רץ ב-sandbox | `electron-sandbox`: אין `require`, אין `fs`. קריאת קבצים אפשרית רק ב-`fetch` מ-`vscode-file://vscode-app/<appRoot>/...` | מבנה `out/vs/code/electron-sandbox` |
| לחלון glass אין extension host פעיל להרחבות | ההשערה מה-grep (8 הפניות ל-`extensionHostProcess` בבאנדל) הופרכה בספייק: הרחבת probe עם `onStartupFinished` הופעלה בחלון הראשי (רישום אחד, pid אחד) ולא הופעלה בחלון ה-Agents גם אחרי 25 שניות | ספייק 2026-08-31, `scripts/lab/spike.mjs` |
| סוף הקבצים | `//# sourceMappingURL=...` ואחריו `//# debugId=...` (Sentry) | tail |
| הפאץ' ב-`workbench.js` נטען בשני סוגי החלונות | `typeof window.__cursorRtlScanAll === "function"` וה-`<style>` מוזרק גם בחלון הראשי וגם בחלון Agents אחרי הוספת שורת ה-`import` | ספייק 2026-08-31 |
| אין שגיאות CSP / Trusted Types / module fetch | בקונסול של שני החלונות אין אף שורת `Refused to`, Trusted Types או `Failed to fetch module` (יש שגיאות `[unauthenticated]` של שירותי ענן — צפויות במעבדה לא מחוברת ולא קשורות) | ספייק, Runtime.enable replay |
| אין אזהרת "corrupt" אחרי עדכון checksum | עם sha256-base64 מעודכן ב-`product.json` לא הופיעה שום נוטיפיקציה בשני החלונות | ספייק |
| `fetch` של קונפיג מ-`vscode-file://` עובד | `fetch(new URL('../../../workbench/cursor-rtl-config.json', document.baseURI))` מחזיר 200 עם התוכן, בשני החלונות | ספייק. מכריע את סעיף 3.3 לאפשרות 1 |
| פתיחת חלון Agents | `Cursor.exe --glass` בהפעלה נקייה פותח **רק** את חלון ה-Agents (בלי חלון ראשי). invocation שני עם `--glass` מול instance רץ לא פתח חלון תוך 60 שניות; הפקודה `cursor.openOrFocusGlassWindow` מתוך extension host כן פותחת אותו | ספייק |
| הרצת Cursor מתוך shell של Electron | כששולחים את `Cursor.exe` מתוך תהליך עם `ELECTRON_RUN_AS_NODE` בסביבה (למשל טרמינל של VS Code), הדגלים נופלים עם `bad option`. סקריפטי המעבדה מוחקים את המשתנה לפני spawn | `scripts/lab/launch.mjs` |
| **Reload Window לא קורא מחדש קבצים שנטענו דרך `vscode-file`** | ה-handler של `vscode-file` בגרסה built לא שולח שום Cache-Control (ה-`no-cache, no-store` ב-main.js מותנה ב-`!isBuilt`), אז Chromium מחיל heuristic freshness לפי mtime. קבצי ההתקנה ישנים ⇒ טריים לימים. פאץ' ל-`workbench.js` או ל-`workbench.html` שהוחל תוך כדי סשן **לא נטען** ב-`workbench.action.reloadWindow` ולא ב-`location.reload()` — רק hard reload דרך CDP או ריסטארט מלא רואים אותו | נבדק אמפירית 2026-08-31 בשלושה נסיונות reload נפרדים לכל קובץ. **זה הפריך את נקודת ההזרקה המקורית של התכנית (workbench.js)** |
| `preload.js` נקרא מחדש מהדיסק ב-Reload Window | ה-preload נטען על ידי תהליך ה-main (לא דרך ה-HTTP cache של ה-renderer): פאץ' שהוחל תוך כדי סשן פעיל מיד אחרי `Reload Window` אמיתי, וגם בחלון חדש | נבדק אמפירית — ראו סעיף 3.1 המעודכן |
| Trusted Types חלים גם ב-world של ה-preload | `s.src = url` נכשל עם `TrustedScriptURL` גם מתוך ה-preload. אבל רישום ה-policies הוא פר-world: ה-world של ה-preload ריק, וה-CSP מתיר שמות מהרשימה (כמו `amdLoader`), אז `trustedTypes.createPolicy('amdLoader', {createScriptURL})` מצליח שם. ה-preload הנקי לא יוצר אף policy | נבדק אמפירית |
| הפאץ' דרך preload פעיל בכל סוגי החלונות | חלון רגיל, חלון Agents (glass) וחלון חדש — כולם מריצים את אותו `preload.js` וה-runtime עולה ב-main world | נבדק אמפירית |

## 3. הארכיטקטורה החדשה

### 3.1 נקודת ההזרקה: `preload.js` (שונה מהתכנון המקורי)

**התכנון המקורי — שורת `import` בסוף `workbench.js` — הופרך במימוש (2026-08-31):** `workbench.js` נטען דרך `vscode-file`, וה-cache של Chromium מגיש אותו ישן גם אחרי `Reload Window` (ראו סעיף 2). פאץ' כזה היה מתפעל רק בריסטארט מלא, מה שמבטל את מטרת המעבר. אותו דבר נכון ל-`workbench.html`.

נקודת ההזרקה בפועל: `out/vs/base/parts/sandbox/electron-sandbox/preload.js`.

| | `preload.js` |
|---|---|
| נקרא מחדש ב-Reload Window | כן — נטען על ידי תהליך ה-main מהדיסק, לא דרך ה-HTTP cache |
| מכסה חלון Agents וחלונות חדשים | כן, אותו preload לכל החלונות |
| ב-`checksums` של `product.json` | כן (`vs/base/parts/sandbox/electron-sandbox/preload.js`) |
| גודל | ~64KB |

הפאץ': בלוק bootstrap קטן שמצורף לסוף הקובץ (לפני הערות ה-sourcemap), עם marker `cursor-rtl-injected` וגרסה. ה-bootstrap רץ ב-isolated world של ה-preload, ושם:

1. יוצר Trusted Types policy בשם `amdLoader` (שם מהרשימה המותרת ב-CSP; הרישום פר-world וה-world של ה-preload ריק, כך שאין התנגשות).
2. מוסיף ל-DOM תג `<script src="../../../workbench/cursor-rtl.js?v=<RTL_VERSION>">` — script קלאסי שרץ ב-**main world**, כך שהגארד `window.__cursorRtlScanAll`, ה-arrow-swap וה-API הפנימי עובדים בדיוק כמו בהזרקה הישנה.

פרמטר הגרסה ב-URL הוא ה-cache-buster: עדכון הרחבה משכתב את הבלוק עם גרסה חדשה, וה-reload הבא מוריד `cursor-rtl.js` טרי. `rtl.js` נשאר script קלאסי (IIFE), לא מודול.

### 3.2 קבצים שההרחבה מניחה תחת `out/vs/workbench/`

| קובץ | תוכן | מתי נכתב |
|---|---|---|
| `cursor-rtl.js` | `resources/rtl.js` כפי שהוא (IIFE, script קלאסי) | בכל Enable, ובכל הפעלה של ההרחבה אם הגרסה המותקנת שונה מהמצורפת. רענון הגרסה משכתב גם את בלוק ה-bootstrap ב-`preload.js` (לעדכון ה-`?v=`) ומציע Reload |
| `cursor-rtl-config.json` | `{"editorRtl":"auto"}` | בכל שינוי הגדרה |

`rtl.js` מזהה את גרסתו דרך שורה `var RTL_VERSION = "x.y.z"` בראש הקובץ, באותו מנגנון של `LOADER_VERSION` היום.

### 3.3 קונפיג חי בלי `fs`

**הוכרע בספייק (2026-08-31): אפשרות 1.** ה-fetch מ-`vscode-file://` מחזיר 200 בשני סוגי החלונות.

`rtl.js` עושה `fetch(new URL("../../../workbench/cursor-rtl-config.json", document.baseURI), {cache: "no-store"})` בעלייה, ושוב כל 5 שניות (ה-interval לבדו מכסה גם חזרת focus, אז אין מאזין נפרד) (`document.baseURI` ולא `import.meta.url` כי הקובץ הוא script קלאסי; `no-store` עוקף את אותו heuristic cache שתועד בסעיף 2). ה-CSP מתיר `connect-src 'self'`. `editorRtl` משתנה חי כמו היום ובלי reload.

`window.__cursorRtlSetEditorMode` נשאר כ-API פנימי, וקריאת ה-fetch קוראת לו כשהערך משתנה.

### 3.4 המתנה ל-DOM ב-`rtl.js`

הקוד היום מניח שה-workbench כבר בנוי. השינוי:

- ה-bootstrap ב-preload מזריק את תג ה-script רק אחרי `DOMContentLoaded`, כך ש-`rtl.js` עצמו לא צריך המתנה משלו ל-DOM.
- `attachObserver(document.documentElement)` במקום להניח ש-`.monaco-workbench` קיים, כדי לתפוס את בניית ה-workbench בזמן אמת.
- `removeExistingCursorRtlStyles` וה-`<style>` הראשי נשארים כמו היום, הם עובדים גם על DOM ריק.
- ה-guard `typeof window.__cursorRtlScanAll === 'function'` בראש הקובץ נשאר. הקוד רץ ב-main world (ה-bootstrap מזריק script tag), אז הוא מנטרל הזרקה כפולה גם בזמן שגם `main.js` הישן וגם `preload.js` מפוצ'רים.

### 3.5 עדכון `product.json`

אחרי כתיבת `preload.js` המפוצ'ר:

```ts
const digest = createHash('sha256').update(fs.readFileSync(preloadJsPath)).digest('base64').replace(/=+$/, '');
product.checksums['vs/base/parts/sandbox/electron-sandbox/preload.js'] = digest;
```

`product.json` לא מגובה: ב-Disable ה-checksum מחושב מחדש מ-`preload.js` המשוחזר, וזה נכון לכל גרסת Cursor (שינוי מהתכנון המקורי, שהחזיק `product.json.rtl-backup` והשווה גרסאות). הכתיבה שומרת על הטאבים המקוריים (`JSON.stringify(product, null, '\t')`), כדי ש-diff אנושי יראה שורה אחת.

אם עדכון ה-checksum נכשל (הרשאות), הפאץ' עצמו עדיין מוחל, וההרחבה מציגה הודעה שתופיע אזהרת "corrupt" ואפשר להתעלם ממנה. Cursor מציע "Don't show again".

**ממצא מהמימוש (2026-08-31):** אזהרת ה-"corrupt" מופיעה פעם אחת גם כשעדכון ה-checksum הצליח — בסשן שבו הפאץ' הוחל תוך כדי ריצה, כי תהליך ה-main מחזיק את ה-checksums שנקראו בעליית האפליקציה. אומת שכל ה-checksums על הדיסק תואמים ושבעלייה נקייה של Cursor אין שום אזהרה (נבדק 90 שניות). ההתנהגות מתועדת ב-README (Known Limitations + Troubleshooting).

### 3.6 זרימת ההפעלה

```
activate (onStartupFinished, בכל חלון)
  ├─ מיגרציה: אם main.js מכיל 'cursor-rtl-loader.cjs' → removePatch(main.js) (משחזר גיבוי, מוחק loader). כישלון = מתעלמים
  ├─ אם preload.js מכיל את ה-marker:
  │     ├─ אם cursor-rtl.js המותקן ישן מהמצורף → העתקה מחדש + שכתוב בלוק ה-bootstrap
  │     │   (קידום ה-?v=) + עדכון checksum → הצעת Reload (לא אוטומטי).
  │     │   כישלון (הרשאות) → אזהרה אחת לכל הפעלת Cursor: dedup לפי (גרסה, ppid של
  │     │   תהליך ה-main) ב-globalState.refreshWarned; נמחק כשה-refresh מצליח
  │     └─ סטטוס ON, סיום
  ├─ אם אין marker ואין state של "המשתמש כיבה במפורש":
  │     ├─ התקנה ראשונה (אין globalState.everEnabled) → דיאלוג אישור כמו היום → פאץ' → reloadWindow
  │     └─ אחרי עדכון Cursor (יש everEnabled) → פאץ' → checksum → הודעה קצרה → reloadWindow אוטומטי
  └─ שומר guard: globalState.lastAutoReload = {cursorVersion, time}. לא מרעננים אוטומטית פעמיים לאותה גרסת Cursor בתוך 10 דקות
```

ההבחנה "עדכון Cursor" מול "כיבוי ידני" נשמרת ב-`globalState` (`rtlDisabledByUser`), שנכתב ב-Disable ונמחק ב-Enable. אין יותר תלות בקיום גיבויים לזיהוי "update-needed".

הגדרה חדשה `cursorRtl.autoReloadAfterPatch` (ברירת מחדל `true`). כשהיא `false` מציגים "Reload Window / Later" במקום לרענן.

### 3.7 חלון Agents

**הוכרע בספייק (2026-08-31): לחלון glass אין extension host שמפעיל הרחבות** (הרחבת probe עם `onStartupFinished` לא הופעלה בו). לכן:

- כשהפאץ' כבר ב-`preload.js`, חלון Agents מקבל RTL אוטומטית — אותו preload רץ בכל החלונות.
- חלון Agents שהיה פתוח לפני החלת הפאץ' (למשל ברגע שעדכון Cursor דרס את `out/`) יקבל RTL רק בפתיחה הבאה שלו או בריסטארט הבא של Cursor. זה מתועד וזו ההתנהגות המכוונת; לא בונים מנגנון בין-חלוני.

### 3.8 מיגרציה ממשתמשי 1.2.x

מכוונת להיות קטנה. ב-`activate`, אם `main.js` מכיל את ה-marker הישן (או שקובץ ה-loader עדיין קיים לידו): קודם נרשם `everEnabled` ב-`globalState` — גרסאות 1.2.x מעולם לא כתבו אותו, ובלעדיו כל משתמש משדרג היה נופל לדיאלוג האישור של התקנה ראשונה (ודיאלוג שנסגר היה מכבה RTL). אחר כך קוראים ל-`removePatch(mainJsPath)` הקיים (משחזר את הגיבוי האחרון ומוחק את ה-loader). אם זה נכשל בגלל הרשאות, ממשיכים בשקט. שתי ההזרקות יחד לא מזיקות בגלל ה-guard ב-`rtl.js`, והעדכון הבא של Cursor ימחק את `main.js` המפוצ'ר בכל מקרה. הקוד הישן של `main.js` נשאר בריפו רק לצורך המיגרציה (`isLegacyPatched`, `removePatch`), והשאר נמחק.

## 4. שינויים לפי קובץ

| קובץ | שינוי |
|---|---|
| `src/constants.ts` | תבנית bootstrap חדשה, `PATCH_MARKER = 'cursor-rtl-injected'`, `RTL_FILENAME = 'cursor-rtl.js'`, `CONFIG_FILENAME = 'cursor-rtl-config.json'`, `CHECKSUM_KEY` (preload), `BACKUP_PREFIX` ל-`preload.js`, `LEGACY_MARKER = 'cursor-rtl-loader.cjs'` |
| `src/paths.ts` | `getPreloadJsPath()`, `getRtlDir()` (`out/vs/workbench`), `getProductJsonPath()` (`appRoot/product.json`), `validatePaths()` בודק את שלושתם. `getConfigPath()` עובר ל-`getRtlDir()/cursor-rtl-config.json` |
| `src/patcher.ts` | `applyPatch` מוסיף/מחליף את בלוק ה-bootstrap לפני `//# sourceMappingURL` (אידמפוטנטי לפי גרסה — בלוק ישן מוחלף כדי לקדם `?v=`); `removePatch` משחזר גיבוי לפי גרסת Cursor או מסיר את הבלוק; `isPatched` בודק את 4KB האחרונים; `getInstalledBootstrapVersion`; `updateChecksum` / `restoreChecksum` (שחזור רק כשגרסת הגיבוי תואמת, אחרת חישוב מחדש); `sha256Base64NoPad`; `copyRtlScript` / `removeRtlFiles`; `getRtlScriptVersion`; rollback רק כשהכתיבה באמת נחתה (אחרת קוד ה-EPERM המקורי נשמר בהודעה); `isLegacyPatched` + `removeLegacyPatch` |
| `src/extension.ts` | הזרימה מסעיף 3.6 כולל `warnRefreshFailed` (אזהרה אחת להפעלת Cursor); הסרת `copyLoader`, `checkLoaderVersionGap`, `pushEditorMode`, `setupFileWatcher` על `main.js`; `writeEditorConfig` כותב לקובץ החדש; הגדרת `autoReloadAfterPatch` (החליפה את `autoReapply` שהוסר) |
| `src/diagnostics.ts` | מצב `preload.js` (marker, גיבוי), התאמת checksum ב-`product.json` לתוכן בפועל, גרסת `cursor-rtl.js` מותקנת מול מצורפת, תוכן הקונפיג, שארית legacy ב-`main.js` |
| `src/uninstall.ts` | שחזור `preload.js` ו-`product.json` מהגיבויים, מחיקת `cursor-rtl.js` ו-`cursor-rtl-config.json`, וגם ניקוי legacy |
| `resources/rtl.js` | `RTL_VERSION`, המתנה ל-DOM, observer על `documentElement`, fetch של הקונפיג |
| `resources/cursor-rtl-loader.cjs` | נמחק |
| `package.json` | הגדרה `cursorRtl.autoReloadAfterPatch`, גרסה 1.3.0 |
| `README.md`, `docs/index.html` | סעיף Installation: אין יותר "restart twice" (עודכן בכל 4 השפות ב-docs). אזכור חד-משפטי של אזהרת ה-corrupt ב-Installation וב-Known Limitations. Diagnostics מתעדכן |
| `scripts/lab/` | חדש: `setup.mjs` (מעבדה + snapshots נקיים), `launch.mjs` (CDP על 9333), `spike.mjs`, `fixtures/` |
| `scripts/e2e/` | חדש: `run.mjs` (10 תרחישים), `lib.mjs`, `harness-ext/` (גשר פקודות ל-e2e בלבד, לא נארז — מסונן ב-`.vscodeignore`) |
| `docs/manual-qa-checklist.md` | חדש: צ'קליסט הבדיקה הידנית לשלב 9 (התקנת USER מול COMPUTER, מיגרציה, עדכונים, הסרה) |

## 5. סיכונים

| סיכון | חומרה | טיפול |
|---|---|---|
| `rtl.js` רץ לפני שה-workbench קיים; observer על `documentElement` רואה אלפי מוטציות בזמן הבנייה | גבוה | **נמדד ונסגר:** דלתא של עד ~60ms במדידות עוקבות ו-minus 33ms במדידה מסורגת — בתוך הרעש. ה-fallback (דחיית ה-observer) לא נדרש |
| `fetch` של הקונפיג נחסם על ידי `vscode-file` | בינוני | **נסגר בספייק:** עובד (אפשרות 1), עם `cache: 'no-store'` נגד ה-heuristic cache |
| לולאת reload | בינוני | guard ב-`globalState` (סעיף 3.6) |
| reload אוטומטי באמצע הקלדה | בינוני | רק אחרי עדכון Cursor, hot exit שומר עורכים, הגדרה לכיבוי |
| Cursor יוסיף checksum ל-glass או יאמת בדרך אחרת | נמוך | ה-patcher מקבל רשימת יעדים `{file, checksumKey}`; היום יש בה פריט אחד |
| **Cursor ישנה את מדיניות ה-Trusted Types** — יסיר את `amdLoader` מרשימת ה-`trusted-types` ב-CSP של workbench.html, או שה-preload יתחיל ליצור policy בשם הזה ב-world שלו | נמוך, אבל שובר לגמרי | תסמין: RTL כבוי אחרי עדכון Cursor למרות שהפאץ' מוחל, ובקונסול `[Cursor RTL] bootstrap failed: ... TrustedScriptURL` (או `Policy "amdLoader" already exists`). תיקון: לבחור שם אחר מרשימת ה-`trusted-types` העדכנית ב-workbench.html ולעדכן את `buildBootstrap` ב-`src/constants.ts` (מופיע פעמיים: בתבנית וב-spike). הרשימה המלאה נכון ל-3.16.29 מופיעה בסעיף 2 |
| `preload.js` ישתנה מבנית בעדכון Cursor עתידי | נמוך | `applyPatch` בודק שהקובץ נראה כמו sandbox preload (מכיל `electron`), אחרת מסרב עם הודעה ברורה. ה-marker `cursor-rtl-injected` וה-`/* cursor-rtl-end */` תוחמים את הבלוק כך שהסרה/החלפה בטוחות גם בלי גיבוי |
| הרשאות כתיבה ל-`product.json` (macOS בתוך `.app`) | קיים גם היום | `handlePermissionError` |
| התקנת Windows רחבת-מכונה (`C:\Program Files\Cursor`) — כל כתיבה נכשלת בלי אדמין | בינוני | **נסגר ב-1.3.1:** כפתור "Fix permissions (Admin)" על כל שגיאת הרשאות (`src/elevate.ts`). UAC אחד מריץ עזר מורם של `icacls` בלבד שמעניק למשתמש Modify עם הורשה על תיקיית ה-preload, על `out\vs\workbench` ועל `product.json` (כולל קבצים שה-updater מחליף), ואז הפעולה שנכשלה רצה שוב אוטומטית. מרגע ההענקה הכול רץ בלי אדמין, כולל הפיצ'ור האוטומטי אחרי עדכון Cursor ו-hook ההסרה. ה-principal נקבע בתהליך הלא-מורם (UAC של חשבון אחר). אומת ידנית על התקנת COMPUTER אמיתית ב-31/08/2026 |
| אובדן הלוג `~/cursor-rtl.log` | נמוך | `rtl.js` כותב ל-console עם prefix; diagnostics מבוסס קבצים |
| גיבויים מצטברים | נמוך (32KB) | שומרים גיבוי אחד לכל גרסת Cursor, שם הגיבוי כולל את `product.version` |

## 6. מה לא משתנה

`markdownItRtl.ts` (API רשמי), הלוגיקה בתוך `rtl.js` מעבר לסעיף 3.4, `updateChecker.ts` פרט לשמות הקבצים, `actions.ts`.

## 7. בדיקות

### 7.1 מעבדה מבודדת

סקריפט `scripts/lab/setup.mjs`:

1. מעתיק את `%LOCALAPPDATA%\Programs\cursor` ל-`C:\cursor-rtl-lab\cursor` (פעם אחת, או `--reset` שמוחק ומעתיק מחדש). בעותק: אם קיים `main.js.rtl-backup-*` משחזרים ממנו את `main.js` ומוחקים את `cursor-rtl-loader.cjs`, כך שמתקבלת התקנה נקייה. שומרים עותק נקי של `preload.js` ו-`product.json` ב-`C:\cursor-rtl-lab\clean\` לצורך סימולציית עדכון (וגם `workbench.js`, מהתכנון המקורי).
2. יוצר `C:\cursor-rtl-lab\data` (user-data-dir) עם `settings.json` שמכיל `"update.mode": "none"`, `"workbench.startupEditor": "none"`, `"telemetry.telemetryLevel": "off"`, ו-`C:\cursor-rtl-lab\ext` (extensions-dir).
3. יוצר workspace fixture ב-`C:\cursor-rtl-lab\workspace` עם `hebrew.md`, `mixed.ts`, `english.md` (מועתקים מ-`scripts/lab/fixtures/`).

תוכן הצ'אט לבדיקה: פעם אחת, ידנית, פותחים את המעבדה, מנהלים שתי שיחות קצרות בעברית (המכסה של החשבון החינמי מספיקה), ושומרים. `C:\cursor-rtl-lab\data` נשאר כ-fixture מקומי ולא נכנס ל-git. ההיסטוריה הזאת היא מה שמצולם בכל ריצה, אז הצילומים דטרמיניסטיים.

סקריפט `scripts/lab/launch.mjs`:

```
C:\cursor-rtl-lab\cursor\Cursor.exe
  --user-data-dir=C:\cursor-rtl-lab\data
  --extensions-dir=C:\cursor-rtl-lab\ext
  --extensionDevelopmentPath=c:\repos\cursor-ext-rtl     (או VSIX מותקן, לפי דגל)
  --remote-debugging-port=9333
  [--glass]                                              (פתיחת חלון Agents)
  C:\cursor-rtl-lab\workspace
```

מחכה עד ש-`http://127.0.0.1:9333/json` מחזיר target עם `workbench.html`. פורט 9333 ולא 9222 כדי לא להתנגש עם ההתקנה האמיתית כשהיא רצה ב-"מצב proxy".

### 7.2 שלב 1: ספייק ידני לפני קוד TypeScript

סקריפט חד-פעמי `scripts/lab/spike.mjs` שעושה את סעיפים 3.1, 3.2 ו-3.5 בקוד Node ישיר על המעבדה, בלי ההרחבה. אחרי הפעלה בודקים ב-CDP:

| בדיקה | קריטריון |
|---|---|
| `typeof window.__cursorRtlScanAll` בחלון הראשי | `"function"` |
| אותו דבר בחלון glass (`--glass`) | `"function"` |
| קונסול | אין שגיאות CSP, Trusted Types, או `Failed to fetch module` |
| notifications | אין "appears to be corrupt" |
| `fetch` של `cursor-rtl-config.json` מתוך הדף | סטטוס 200 (מכריע את סעיף 3.3) |
| חלון glass מפעיל את ההרחבה | הרצה עם `--extensionDevelopmentPath` וההרחבה כותבת ל-Output כשהיא עולה בחלון glass (מכריע את סעיף 3.7) |

רק אחרי שהטבלה ירוקה ממשיכים למימוש.

**בוצע 2026-08-31.** חמש הבדיקות הראשונות ירוקות; השישית הראתה שאין extension host בחלון glass (ראו סעיפים 2 ו-3.7). הבדיקה בפועל השתמשה בהרחבת probe מינימלית שנוצרת על ידי הספייק (כותבת ללוג ב-activate) במקום ההרחבה המלאה, ופתחה את חלון ה-Agents דרך הפקודה `cursor.openOrFocusGlassWindow` כי `--glass` מול instance רץ לא פותח חלון.

### 7.3 חבילת e2e אוטומטית עם צילומי מסך

`scripts/e2e/run.mjs`, מבוסס Playwright `connectOverCDP` (כבר תלות) ו-`pixelmatch` (כבר תלות). כל תרחיש מפיק צילומים ל-`visual/actual/<scenario>/` ומשווה ל-`visual/baseline/<scenario>/` באותו מנגנון של `visual-cursor-compare.mjs`. הרצה: `npm run e2e`, אישור baseline: `npm run e2e:approve`.

צעדים משותפים שהסקריפט מבצע דרך CDP בכל תרחיש:

1. מחכה ל-`.monaco-workbench` ולסיום הופעת ה-splash.
2. קובע גודל חלון קבוע (1600x1000) דרך `Browser.setWindowBounds` כדי שהצילומים יהיו ברי השוואה.
3. פותח את פאנל הצ'אט (`workbench.action.chat.open` או קיצור), פותח את השיחה העברית הראשונה מההיסטוריה.
4. מקליד לתיבת ה-composer טקסט עברי קבוע בלי לשלוח.
5. פותח `hebrew.md` ב-Monaco ואת ה-Markdown preview שלו.
6. מצלם: `full.png`, `chat-pane.png` (clip של הפאנל), `composer.png`, `editor.png`, `preview.png`.
7. שומר `inspection.json` (כמו היום): ספירת אלמנטים עם `dir="rtl"`, שגיאות קונסול, `performance.getEntriesByType('mark')` לחישוב `startup`.

תרחישים:

| תרחיש | הכנה | פעולות | אסרטים מעבר לצילומים |
|---|---|---|---|
| `first-install` | `setup --reset`, ext חדש | הפעלה, המתנה לדיאלוג האישור, לחיצה "Enable" דרך CDP, המתנה ל-reload | marker ב-`preload.js`, checksum תואם, `__cursorRtlScanAll` קיים, אין "corrupt" |
| `cursor-update` | מעבדה מפוצ'רת, Cursor סגור, שחזור `preload.js` ו-`product.json` מ-`clean\` | הפעלה, המתנה | תוך 30 שניות החלון התרענן בעצמו (מזהים לפי `performance.timeOrigin` חדש), RTL פעיל, ה-reload קרה פעם אחת (בודקים `globalState` דרך הקובץ `state.vscdb` או דרך פקודת diagnostics) |
| `agents-window` | מעבדה מפוצ'רת | הפעלה עם `--glass` | `__cursorRtlScanAll` ב-target של glass, צילום `agents.png` |
| `second-window` | מעבדה מפוצ'רת | `workbench.action.newWindow` | RTL פעיל בשני ה-targets |
| `disable` | מעבדה מפוצ'רת | פקודת `cursorRtl.disable` דרך CDP (`workbench.action.quickOpen` עם `>Cursor RTL: Disable`) + reload | `preload.js` זהה ל-`clean\`, checksum זהה למקורי, `cursor-rtl.js` נמחק, אין RTL בצילום |
| `editor-mode` | מעבדה מפוצ'רת | שינוי `cursorRtl.editorRtl` ל-`always` דרך settings.json של המעבדה | תוך 10 שניות `mixed.ts` מוצג RTL בלי reload (אם סעיף 3.3 אפשרות 1), או הודעת Reload (אפשרות 2) |
| `extension-update` | מעבדה מפוצ'רת עם VSIX ישן | התקנת VSIX חדש שבו `RTL_VERSION` שונה, הפעלה | `cursor-rtl.js` נדרס ובלוק ה-bootstrap מתעדכן, מוצע Reload |
| `migration-from-1.2` | מעבדה שבה `main.js` מפוצ'ר בנוסח 1.2.4 ו-loader קיים | הפעלה | `main.js` שוחזר, loader נמחק, RTL פעיל |
| `permissions` | `attrib +R preload.js` | Enable | הודעת השגיאה מ-`handlePermissionError`, הקובץ לא נגע |
| `startup` | מעבדה מפוצ'רת מול נקייה | 5 הפעלות כל אחת | חציון `code/didStartWorkbench` מפוצ'ר פחות נקי קטן מ-100ms |

הצילומים הם התוצר העיקרי. `inspection.json` והאסרטים מוסיפים סיבה ברורה כשצילום נכשל.

**הערות מהמימוש (2026-08-31):**

- אוטומציה מבוססת מקלדת (palette דרך CDP) התגלתה כלא אמינה בחלונות dev-host אחרי reload. נוספה הרחבת harness זעירה ל-e2e בלבד (`scripts/e2e/harness-ext`, נטענת כ-`--extensionDevelopmentPath` שני, לא נארזת) שמריצה פקודות workbench לפי קובץ בקשה תחת `C:\cursor-rtl-lab`.
- ה-e2e מאפס את guard ה-reload (מחיקת `lastAutoReload` מ-state.vscdb דרך sqlite של python) לפני תרחישים שמצפים ל-reload אוטומטי, אחרת ריצות חוזרות בתוך 10 דקות נופלות על ה-guard (שעובד כמתוכנן).
- מצב `glassMode` שנשמר ב-windowsState גורם לכל launch עם dev extension להיפתח כחלון Agents (בלי extension host); הסקריפטים מסנטזים אותו ל-false לפני launch רגיל.
- תרחיש `extension-update` מדמה גרסה ישנה בעריכת הקבצים המותקנים (הורדת RTL_VERSION וגרסת ה-bootstrap) במקום התקנת VSIX אמיתי — אותו קוד (refreshRtlScript) נבדק, בלי אריזת VSIX כפולה.
- כל עוד הצעד הידני (login + שתי שיחות עברית) לא בוצע: פתיחת שיחה מההיסטוריה מדווחת pending, וטאבים משוחזרים של "New Agent" מציגים מסך התחברות (נסגרים אוטומטית בתחילת הצילומים).
- ספירת ה-reload ב-`cursor-update` נעשית בפועל לפי ערכי `performance.timeOrigin` ייחודיים שנדגמים לאורך הריצה (ולא דרך state.vscdb כפי שתוכנן) — reload מחליף את ה-CDP target, אז הסקריפטים תמיד פותרים מחדש את הדף מתוך ה-context ומעדיפים דף visible.
- נוטיפיקציות (toast) נעלמות מה-DOM אחרי ~15 שניות; אסרטים שתלויים בהן דוגמים ברציפות במקום קריאה חד-פעמית בסוף.
- מדידת ה-startup עברה להרצות מסורגות (מפוצ'ר/נקי לסירוגין) אחרי ששני בלוקים עוקבים של 5 הראו רעש שחוצה את סף ה-100ms לשני הכיוונים.
- תרחיש `permissions` מלמד: גיבוי שנוצר מקובץ readonly יורש את המאפיין, ושחזור ממנו מדביק אותו הלאה — סקריפטי ה-e2e מנקים מאפייני readonly ומוחקים גיבויים כאלה; זו גם הסיבה ש-`applyPatch` עושה rollback רק כשהכתיבה באמת שינתה את הקובץ.

### 7.4 שלב אחרון: ההתקנה האמיתית

`npm run package`, התקנה מ-VSIX על ההתקנה האמיתית שעדיין מפוצ'רת ב-1.2.4 (מיגרציה אמיתית), הרצת `npm run visual` הישן מול baseline שנלקח לפני. שומרים את ה-VSIX של 1.2.4 בצד לחזרה אחורה.

## 8. סדר עבודה

1. ~~`scripts/lab/setup.mjs` + `launch.mjs`, ואישור שהעותק של Cursor רץ מבודד~~ — בוצע.
2. ~~ספייק (7.2)~~ — בוצע; הוביל למעבר ל-preload (סעיף 3.1).
3. ~~`constants.ts`, `paths.ts`, `patcher.ts` עם הפונקציות החדשות~~ — בוצע.
4. ~~`rtl.js`: המתנה ל-DOM, `RTL_VERSION`, fetch קונפיג~~ — בוצע.
5. ~~`extension.ts` זרימה חדשה + מיגרציה~~ — בוצע.
6. ~~`diagnostics.ts`, `uninstall.ts`, `package.json`~~ — בוצע.
7. ~~`scripts/e2e/run.mjs` ו-baseline ראשון~~ — בוצע; כל 10 התרחישים ירוקים (סעיף 0).
8. ~~README ו-docs~~ — בוצע.
9. **התקנה אמיתית — טרם בוצע.** מתבצע ידנית לפי [manual-qa-checklist.md](manual-qa-checklist.md) (כולל מטריצת התקנת USER מול COMPUTER), עם ה-VSIX של 1.2.4 שמור בצד לחזרה אחורה.
