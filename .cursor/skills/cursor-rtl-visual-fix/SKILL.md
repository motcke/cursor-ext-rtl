---
name: cursor-rtl-visual-fix
description: Fix Cursor RTL rendering issues end-to-end with visual verification. Use when the user provides a cursor-ext-rtl GitHub issue, mentions RTL visual bugs, Markdown tables, Hebrew/Arabic/Persian layout, Cursor chat rendering, or asks to develop and visually test a fix.
---

# Cursor RTL Visual Fix

Use this skill to take an RTL rendering issue from report to verified fix in this repository.

## Operating Rules

- Treat the issue screenshot/description as the product requirement.
- Do not commit or push unless the user explicitly asks.
- Use `npm run package` to create a VSIX. Do not run `vsce package` directly.
- Preserve unrelated user changes. Do not revert files you did not need to touch.
- Visual evidence is required for UI/layout fixes. DOM checks are supporting evidence only.
- Never approve or update visual baselines without explicit user confirmation after they review `visual/actual`.

## End-to-End Workflow

1. Understand the issue.
   - If given a GitHub issue URL, use `gh issue view <number> --repo motcke/cursor-ext-rtl --comments` when possible.
   - Extract the failing scenario, expected layout, actual layout, affected UI surface, and any screenshot clues.
   - For example, issue `#8` is about mixed Hebrew and English text being misaligned in Markdown tables.

2. Inspect the current implementation.
   - Start with `resources/rtl.js`; most visual behavior is injected from there.
   - Check related selectors, direction rules, `unicode-bidi`, `text-align`, table handling, code block exclusions, and scanner behavior.
   - Search before editing. Prefer the repo's existing CSS/DOM-injection patterns.

3. Reproduce visually in real Cursor.
   - Cursor must be launched with CDP:

```powershell
& "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe" --remote-debugging-port=9222
```

   - If `http://localhost:9222/json` is unavailable, stop and ask the user to relaunch Cursor with the flag.
   - Use the real Cursor chat/composer to create or locate a scenario matching the issue. For table issues, use a Markdown table containing mixed Hebrew and English.
   - When iterating on `resources/rtl.js`, prefer direct CDP evaluation for temporary runtime testing before rebuilding/restarting Cursor. See "Runtime Injection During Development" below.

4. Implement the smallest fix.
   - Prefer targeted changes in `resources/rtl.js`.
   - Keep code blocks and editor internals LTR.
   - Avoid broad `direction: rtl` rules on large containers unless the issue proves that is necessary.
   - Prefer CSS logical properties and per-element direction behavior over hard-coded left/right when possible.
   - Apply the Direction Stability Rules below.

## Direction Stability Rules

These prevent flicker (direction oscillating many times per second).

- Classify each element before setting direction:
  - Chrome (headers, labels, buttons, steppers, icons, counters): force `direction: ltr` + `unicode-bidi: isolate`. Never derive their direction from content.
  - Content (question/answer text, fully-Hebrew blocks): set direction from the element's own text. A container that is wholly RTL should align RTL as one unit.
- Derive a container's direction only from a stable signal (its own text). Never from a value the scanner itself writes.
- Never let CSS that reacts to a scanned direction also change layout/size (e.g. `:has([dir="rtl"])` flipping padding). The scanned `dir` → CSS layout change → mutation → re-scan loop is the flicker root cause.
- Only leaf text elements should receive a computed `dir`; strip and re-assert chrome direction in the scan so stale `dir` cannot accumulate.

5. Build and package.
   - Run `npm run lint`.
   - Run `npm run package` when a VSIX/reinstall is needed.
   - If the fix requires the Cursor patch to reload, install/reapply the extension and restart/reload Cursor as the repository workflow requires.

6. Capture visual evidence.
   - Run:

```powershell
npm run visual:capture
```

   - Review these artifacts:
     - `visual/actual/cursor-right-pane.png`
     - `visual/actual/cursor-full.png`
     - `visual/actual/cursor-inspection.json`
   - Use `VISUAL_CLIP` if the right pane crop is not focused enough:

```powershell
$env:VISUAL_CLIP = "900,80,700,900"
npm run visual:capture
Remove-Item Env:\VISUAL_CLIP
```

7. Compare against baseline.
   - If a baseline already exists, run:

```powershell
npm run visual
```

   - If comparison fails, inspect `visual/diff`.
   - Only ask the user to approve a new baseline after explaining what changed and why it is expected:

```powershell
npm run visual:approve
```

8. Report results.
   - Include the issue summary, root cause, implementation approach, and visual verification result.
   - Mention whether `npm run lint`, `npm run package`, `npm run visual:capture`, and `npm run visual` passed.
   - If visual approval is still needed, say exactly which image the user should review.

## Runtime Injection During Development

Use this only for local visual debugging while Cursor is already running with `--remote-debugging-port=9222`. This does not replace the real extension/loader verification path.

1. Inject the current `resources/rtl.js` into active Cursor workbench pages with CDP `Runtime.evaluate`:

```powershell
node -e "const { chromium } = require('playwright'); const fs = require('fs'); (async () => { const browser = await chromium.connectOverCDP('http://localhost:9222'); const script = fs.readFileSync('resources/rtl.js', 'utf8'); for (const context of browser.contexts()) { for (const page of context.pages()) { if (!page.url().includes('workbench.html')) continue; await page.evaluate(script); await page.waitForTimeout(1000); const state = await page.evaluate(() => ({ title: document.title, hasScan: typeof window.__cursorRtlScanAll === 'function', styles: Array.from(document.querySelectorAll('style')).some(s => (s.textContent || '').includes('.markdown-table-container')) })); console.log(JSON.stringify(state)); } } await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

2. Do not use `page.addScriptTag({ path })` for Cursor workbench injection. Cursor may enforce Trusted Types and reject script tag text assignment.

3. After direct runtime injection, run:

```powershell
npm run visual:capture
```

4. Treat direct injection as supporting evidence only. For final verification, run `npm run package`, install the VSIX, and restart Cursor when the loader or patching behavior changed.

5. Check the active window really has the runtime API before trusting visual results:

```powershell
node -e "const { chromium } = require('playwright'); (async () => { const browser = await chromium.connectOverCDP('http://localhost:9222'); for (const context of browser.contexts()) { for (const page of context.pages()) { if (!page.url().includes('workbench.html')) continue; const state = await page.evaluate(() => ({ title: document.title, hasScan: typeof window.__cursorRtlScanAll === 'function', injectedStyles: Array.from(document.querySelectorAll('style')).some(s => (s.textContent || '').includes('.markdown-table-container')) })); console.log(JSON.stringify(state)); } } await browser.close(); })().catch(e => { console.error(e); process.exit(1); });"
```

6. If `visual:capture` says `RTL script detected: no`, or `hasScan` is false, the active workbench page did not receive `rtl.js`. Do not debug CSS or direction logic until injection is confirmed.

7. If editing `resources/cursor-rtl-loader.cjs`, remember that the loader runs in Electron main. `Developer: Reload Window` is not enough to reload loader changes; use a full Cursor restart for end-to-end loader verification.

8. A known loader failure mode is injecting too early while `webContents.getURL()` is still empty, marking the webContents as injected, then skipping the later `workbench.html` load. The loader should inject only into URLs containing `workbench.html` and should mark success after `executeJavaScript` resolves.

## Visual Reproduction Prompts

Use issue-specific content in Cursor chat. For Markdown table alignment, a useful prompt is:

```markdown
תציג לי טבלת Markdown עם עמודות:
| שדה | English value | הערות |
|-----|---------------|-------|
| שם משתמש | userName | טקסט בעברית mixed with English |
| סטטוס | active | בדיקה עם API ו-JSON |
| נתיב | C:\repos\cursor-ext-rtl | נתיב צריך להישאר LTR |
```

For code block regressions, include Hebrew prose plus fenced code. The prose should behave RTL; code should remain LTR.

## Root-Cause Checklist

Before fixing, identify which category applies:

- Selector miss: the affected UI element is not covered by `DIR_SELECTOR` or CSS.
- Over-broad direction: a parent/container forces the wrong direction.
- Table layout: table container, table, cell, or inline content has conflicting `direction`/`text-align`.
- Mixed inline text: `unicode-bidi`, `dir="auto"`, or `plaintext` is missing or applied at the wrong level.
- Exclusion problem: code/editor/mermaid/table internals are being scanned when they should not be.
- Timing problem: content appears after initial scans and the MutationObserver does not catch it.
- Feedback-loop flicker: the scanned `dir` triggers CSS that changes layout, which re-triggers the scan with a different result. Measure element `x`/`dir` over time (not single snapshots) to detect it; fix per the Direction Stability Rules.

## When Playwriter Fits

Use Playwriter for browser-side helpers such as viewing a generated report, opening GitHub pages, or inspecting external web content. Do not rely on Playwriter to capture Cursor itself; Cursor screenshots come from the CDP workflow and `npm run visual:capture`.
