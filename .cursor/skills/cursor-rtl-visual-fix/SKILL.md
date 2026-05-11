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

4. Implement the smallest fix.
   - Prefer targeted changes in `resources/rtl.js`.
   - Keep code blocks and editor internals LTR.
   - Avoid broad `direction: rtl` rules on large containers unless the issue proves that is necessary.
   - Prefer CSS logical properties and per-element direction behavior over hard-coded left/right when possible.

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

## When Playwriter Fits

Use Playwriter for browser-side helpers such as viewing a generated report, opening GitHub pages, or inspecting external web content. Do not rely on Playwriter to capture Cursor itself; Cursor screenshots come from the CDP workflow and `npm run visual:capture`.
