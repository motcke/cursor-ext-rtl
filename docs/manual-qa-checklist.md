# צ'קליסט בדיקות ידניות: התקנה אמיתית של 1.3.0

מיועד לבדיקה ידנית מלאה על התקנת Cursor אמיתית (שלב 9 של [renderer-injection-plan.md](renderer-injection-plan.md) ומעבר לו). ה-e2e האוטומטי (`npm run e2e`) מכסה את אותם מסלולים על עותק המעבדה; הצ'קליסט הזה מאמת אותם על התקנות אמיתיות, בשני סוגי ההתקנה של Windows.

## הכנה

- [ ] `npm run package` — לשמור את ה-VSIX של 1.3.0
- [ ] לשמור בצד גם VSIX של 1.2.4 (חזרה אחורה + בדיקת מיגרציה)
- [ ] אם בודקים עדכון Cursor אמיתי: לשמור installer של גרסת Cursor ישנה בכמה מינורים

## הסבב המלא (לבצע פעמיים)

סבב א: התקנת Cursor במצב **Install for me only** (`%LOCALAPPDATA%\Programs\cursor`).
סבב ב: הסרה מלאה, התקנה במצב **Install for all users** (`C:\Program Files\Cursor`).

### שלב 1: מצב בסיס

- [ ] הסרה מלאה של Cursor (כולל מחיקת `%APPDATA%\Cursor` ו-`%USERPROFILE%\.cursor` אם רוצים פרופיל בתולי)
- [ ] התקנת Cursor, פתיחת קובץ עברי — לוודא שהכול מיושר **שמאלה** (מצב ברירת מחדל, בלי ההרחבה)

### שלב 2 (אופציונלי, סבב אחד מספיק): מיגרציה מ-1.2.4

- [ ] התקנת VSIX 1.2.4, Enable, ריסטארט כפול — RTL עובד בשיטה הישנה
- [ ] התקנת VSIX 1.3.0 מעליו
- [ ] אימות קבצי מיגרציה תחת `resources\app\out`: `main.js` בלי `cursor-rtl-loader.cjs` בתוכן, קובץ ה-loader נמחק, אין `main.js.rtl-backup-*`
- [ ] RTL ממשיך לעבוד (עכשיו דרך `preload.js`)

### שלב 3: התקנה ראשונה של 1.3.0 (בלי 1.2.4 לפני)

| בדיקה | התקנת USER | התקנת COMPUTER |
|---|---|---|
| Enable בלי הרשאות מנהל | עובד, החלון נטען מחדש לבד, RTL פעיל | הודעת "Permission denied" עם כפתור **Fix permissions (Admin)**; `preload.js` לא השתנה כל עוד לא אושר |
| Fix permissions (Admin) (רלוונטי רק ל-COMPUTER) | — | לחיצה מקפיצה UAC אחד; אחרי אישור הפאץ' מוחל, RTL פעיל, ומוענקת הרשאת כתיבה קבועה — מכאן והלאה הכול רץ בלי אדמין. ביטול ה-UAC: הודעה שדבר לא השתנה |
| Enable עם Cursor כמנהל (רלוונטי רק ל-COMPUTER) | — | עובד כמו בהתקנת USER |
| אזהרת "corrupt" | עשויה להופיע פעם אחת בסשן ההפעלה; נעלמת אחרי סגירה מלאה ופתיחה | כנ"ל |
| `product.json` | ה-checksum של preload עודכן; אין קובץ גיבוי (ב-Disable הוא מחושב מחדש) | כנ"ל (אחרי הרצה כמנהל) |

### שלב 4: פונקציונליות

- [ ] צ'אט: הודעות בעברית מיושרות ימינה, אנגלית שמאלה
- [ ] קובץ עברי ב-Monaco: מיושר ימינה, גלגלת שמאלה, חצים הפוכים
- [ ] Markdown preview: פסקאות/כותרות/טבלאות לפי כיוון התוכן
- [ ] חלון Agents: RTL פעיל
- [ ] חלון חדש (Ctrl+Shift+N): RTL פעיל
- [ ] `cursorRtl.editorRtl` ל-always: קובץ מתהפך בלי reload בתוך ~10 שניות; חזרה ל-auto
- [ ] Diagnostics: הכול ירוק, checksum תואם

### שלב 5: עדכון Cursor (המסלול שהמעבר נבנה בשבילו)

- [ ] אם יש installer ישן: להתקין ישן, Enable, ואז לתת ל-updater האמיתי לעדכן. אם אין — לחכות לעדכון האמיתי הראשון ולאמת אז
- [ ] אחרי עדכון: בעלייה הראשונה ההרחבה מפצ'רת לבד ומרעננת את החלון לבד (עם `autoReloadAfterPatch` ברירת מחדל)
- [ ] בהתקנת COMPUTER שכבר עברה Fix permissions: הפיצ'ור האוטומטי עובר בלי אדמין (ה-ACL שרד את העדכון). אם טרם — אזהרת הרשאות עם Fix permissions (Admin) ו-Retry
- [ ] אזהרת corrupt חד-פעמית — נעלמת בהפעלה מלאה הבאה
- [ ] נקודת מעקב: ה-updater של Cursor עצמו הצליח למרות ש-`preload.js` היה שונה (אם delta-update נכשל, הוא אמור ליפול ל-full download לבד)

### שלב 6: עדכון ההרחבה

- [ ] התקנת VSIX חדש יותר (או סימולציה: הורדת גרסה ידנית של `RTL_VERSION` ב-`out/vs/workbench/cursor-rtl.js` וב-bootstrap שבסוף `preload.js`)
- [ ] בהתקנת USER: בעלייה הבאה `cursor-rtl.js` וה-bootstrap התעדכנו ומוצע Reload
- [ ] בהתקנת COMPUTER בלי אדמין ובלי Fix permissions: מופיעה אזהרה **פעם אחת להפעלת Cursor** שהעדכון נכשל וה-RTL ממשיך בגרסה הקודמת, עם כפתור Fix permissions (Admin); reload של חלון לא מציג אותה שוב; פתיחה מחדש של Cursor כן. אחרי Fix permissions העדכון עובר רגיל
- [x] המרת VSIX למרקטפלייס: התקנת VSIX ישן מזה שבמרקטפלייס ← ה-updater מתקין מהמרקטפלייס ומציע Reload; ב-`extensions.json` הרשומה החדשה היא `source: "gallery"` עם `pinned: false` (אומת במעבדה מקצה לקצה, 02/09/2026 — כולל שה-uninstall לפני ה-install הכרחי, אחרת ה-pin שורד)

### שלב 7: כיבוי והסרה

- [ ] Disable ← reload: אין RTL; `preload.js` זהה למקור, checksum שוחזר, `cursor-rtl*.js` נמחקו. Enable מחזיר
- [ ] הסרת ההרחבה ← ריסטארט Cursor (ה-uninstall hook רץ בהפעלה הבאה): אותם שלושה אימותים כמו ב-Disable
- [ ] בהתקנת COMPUTER: ה-hook רץ בלי הרשאות — ייתכן שיישאר פאץ' עד הרצה כמנהל או עדכון Cursor הבא; לוודא שלפחות אין שבירה

## מה הצ'קליסט לא מכסה בכוונה

- macOS / Linux — אין גישה כרגע; המנגנון זהה אבל נתיבי ההתקנה והרשאות שונים
- עדכון אוטומטי של ההרחבה מהמרקטפלייס (Open VSX) — נבדק ממילא בכל release אמיתי
