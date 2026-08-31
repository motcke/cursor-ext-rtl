# Cursor Visual Checks

These checks attach to a running Cursor window through Chrome DevTools Protocol and capture the real Cursor UI.

There are two suites:

- **e2e lab suite** (`npm run e2e`, baselines under `visual/baseline/<scenario>/`) — drives the isolated Cursor copy in `C:\cursor-rtl-lab` through ten scenarios (install, Cursor update, Agents window, disable, permissions, startup timing and more) and compares screenshots per scenario. `npm run e2e:approve` accepts the current actuals as baseline. Requires `node scripts/lab/setup.mjs` once. See `docs/renderer-injection-plan.md` §7.
- **legacy single-shot capture** (`npm run visual`, below) — captures whatever real Cursor window is listening on CDP port 9222.

## Privacy Notice

Visual captures can include private information visible in Cursor. The capture command writes screenshots of the Cursor window and `cursor-inspection.json`, which includes the page URL/title and short RTL text samples from visible UI elements. Review `visual/actual` before sharing it.

## Capture

Start Cursor with CDP enabled:

```powershell
& "$env:LOCALAPPDATA\Programs\cursor\Cursor.exe" --remote-debugging-port=9222
```

Then capture screenshots:

```powershell
npm run visual:capture
```

This writes:

- `visual/actual/cursor-full.png`
- `visual/actual/cursor-right-pane.png`
- `visual/actual/cursor-inspection.json`

By default, `cursor-right-pane.png` captures the right 45% of the Cursor window. To capture a more precise area:

```powershell
$env:VISUAL_CLIP = "900,80,700,900"
npm run visual:capture
Remove-Item Env:\VISUAL_CLIP
```

## Approve Baseline

After reviewing `visual/actual`, approve the current screenshots as the baseline:

```powershell
npm run visual:approve
```

## Compare

After future changes:

```powershell
npm run visual
```

If the screenshots changed beyond the threshold, diffs are written to `visual/diff`.

The default allowed difference is `0.2%`. Override it with:

```powershell
$env:VISUAL_THRESHOLD = "0.005"
npm run visual:compare
Remove-Item Env:\VISUAL_THRESHOLD
```
