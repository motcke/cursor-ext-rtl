import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    validatePaths,
    getPreloadJsPath,
    getPreloadAuxJsPath,
    getRtlDir,
    getProductJsonPath,
    getConfigPath,
    getMainJsPath,
    getRtlScriptDestPath,
} from './paths';
import {
    isPatched,
    applyPatch,
    removePatch,
    updateChecksum,
    restoreChecksum,
    copyRtlScript,
    removeRtlFiles,
    getRtlScriptVersion,
    getInstalledBootstrapVersion,
    getDryRunSummary,
    handlePermissionError,
    isLegacyPatched,
    removeLegacyPatch,
} from './patcher';
import {
    checkForExtensionUpdate,
    downloadFile,
    isMarketplaceInstall,
    isNewer,
    UpdateCheckResult,
} from './updateChecker';
import { grantWriteAccess, isPermissionError } from './elevate';
import { runDiagnostics } from './diagnostics';
import { markdownItCursorRtl, MarkdownItLike } from './markdownItRtl';
import {
    init as initActions,
    setCommonProperty,
    action,
    error as actionError,
    dispose as disposeActions,
} from './actions';
import { LEGACY_LOADER_FILENAME } from './constants';

let statusBarItem: vscode.StatusBarItem;
let blinkInterval: ReturnType<typeof setInterval> | undefined;
let blinkTimeout: ReturnType<typeof setTimeout> | undefined;
let startupUpdateCheckTimeout: ReturnType<typeof setTimeout> | undefined;
let updateCheckInterval: ReturnType<typeof setInterval> | undefined;

type PatchState = 'on' | 'off';
type UpdateCheckMode = 'startup' | 'periodic';

const STARTUP_UPDATE_CHECK_DELAY_MS = 5_000;
const MS_PER_HOUR = 60 * 60 * 1000;

// globalState keys (plan §3.6): the user's explicit off switch replaces the
// old backups-on-disk heuristic, and the auto-reload guard prevents loops.
const EVER_ENABLED_KEY = 'everEnabled';
const DISABLED_BY_USER_KEY = 'rtlDisabledByUser';
const LAST_AUTO_RELOAD_KEY = 'lastAutoReload';
const AUTO_RELOAD_GUARD_MS = 10 * 60 * 1000;

function getPatchState(): PatchState {
    return isPatched(getPreloadJsPath()) ? 'on' : 'off';
}

function getProductVersion(): string {
    try {
        const product = JSON.parse(fs.readFileSync(getProductJsonPath(), 'utf-8'));
        return typeof product.version === 'string' ? product.version : 'unknown';
    } catch {
        return 'unknown';
    }
}

function startBlink(themeColorId: string): void {
    const BLINK_DURATION_MS = 60_000;

    statusBarItem.backgroundColor = new vscode.ThemeColor(themeColorId);
    blinkInterval = setInterval(() => {
        statusBarItem.backgroundColor = statusBarItem.backgroundColor
            ? undefined
            : new vscode.ThemeColor(themeColorId);
    }, 800);
    blinkTimeout = setTimeout(() => {
        if (blinkInterval) {
            clearInterval(blinkInterval);
            blinkInterval = undefined;
        }
        statusBarItem.backgroundColor = new vscode.ThemeColor(themeColorId);
        blinkTimeout = undefined;
    }, BLINK_DURATION_MS);
}

function updateStatusBar(state: PatchState): void {
    const config = vscode.workspace.getConfiguration('cursorRtl');
    if (!config.get<boolean>('showStatusBar', true)) {
        statusBarItem.hide();
        return;
    }

    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = undefined;
    }
    if (blinkTimeout) {
        clearTimeout(blinkTimeout);
        blinkTimeout = undefined;
    }

    switch (state) {
        case 'on':
            statusBarItem.text = '$(check) RTL: ON';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'RTL patch is active. Click for options.';
            break;
        case 'off':
            statusBarItem.text = '$(circle-slash) RTL: OFF';
            statusBarItem.tooltip = 'RTL patch is not applied. Click for options.';
            startBlink('statusBarItem.errorBackground');
            break;
    }

    statusBarItem.show();
}

async function showQuickPick(): Promise<void> {
    const state = getPatchState();

    const items: vscode.QuickPickItem[] = [];

    if (state === 'on') {
        items.push(
            { label: '$(circle-slash) Disable RTL', description: 'Remove patch and restore original preload.js' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    } else {
        items.push(
            { label: '$(check) Enable RTL', description: 'Apply RTL patch to Cursor' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    }

    items.push({
        label: '$(text-size) Code Editor Direction',
        description: `Currently: ${getEditorRtlMode()}`,
    });

    items.push({
        label: '$(pulse) Diagnostics',
        description: 'Generate a full diagnostics report',
    });

    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Cursor RTL',
    });

    if (!picked) {
        return;
    }

    if (picked.label.includes('Enable')) {
        await vscode.commands.executeCommand('cursorRtl.enable');
    } else if (picked.label.includes('Disable')) {
        await vscode.commands.executeCommand('cursorRtl.disable');
    } else if (picked.label.includes('Editor Direction')) {
        await vscode.commands.executeCommand('cursorRtl.setEditorRtl');
    } else if (picked.label.includes('Diagnostics')) {
        await vscode.commands.executeCommand('cursorRtl.diagnostics');
    } else if (picked.label.includes('Status')) {
        await vscode.commands.executeCommand('cursorRtl.status');
    }
}

type EditorRtlMode = 'auto' | 'always' | 'off';

function getEditorRtlMode(): EditorRtlMode {
    const value = vscode.workspace
        .getConfiguration('cursorRtl')
        .get<string>('editorRtl', 'auto');
    return value === 'always' || value === 'off' ? value : 'auto';
}

// Persist the editor-RTL mode where the injected renderer script can fetch
// it (out/vs/workbench/cursor-rtl-config.json). rtl.js polls this file, so
// changes apply live without a reload.
function writeEditorConfig(): void {
    try {
        fs.writeFileSync(
            getConfigPath(),
            JSON.stringify({ editorRtl: getEditorRtlMode() })
        );
    } catch {
        // Non-critical: rtl.js defaults to 'auto' when the file is absent.
    }
}

async function setEditorRtlCommand(): Promise<void> {
    const current = getEditorRtlMode();
    const options: Array<{ label: string; description: string; mode: EditorRtlMode }> = [
        { label: '$(sparkle) Auto', description: "Follow each file's dominant language", mode: 'auto' },
        { label: '$(arrow-right) Always RTL', description: 'Force every code editor right-to-left', mode: 'always' },
        { label: '$(circle-slash) Off', description: "Never change the code editor's direction", mode: 'off' },
    ];

    const picked = await vscode.window.showQuickPick(
        options.map((item) => ({
            ...item,
            label: item.mode === current ? `${item.label} $(check)` : item.label,
        })),
        { placeHolder: `Code editor RTL direction (current: ${current})` }
    );

    if (!picked) {
        return;
    }

    await vscode.workspace
        .getConfiguration('cursorRtl')
        .update('editorRtl', picked.mode, vscode.ConfigurationTarget.Global);
    action('editor_rtl_set', { mode: picked.mode });
}

async function offerReload(message: string): Promise<void> {
    const reload = await vscode.window.showInformationMessage(
        message,
        'Reload Window',
        'Later'
    );
    if (reload === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

interface LastAutoReload {
    cursorVersion: string;
    time: number;
}

// Auto-reload guard (plan §3.6): never reload automatically twice for the
// same Cursor version within 10 minutes, so a patch that fails to stick can't
// put the window in a reload loop.
function autoReloadAllowed(context: vscode.ExtensionContext, cursorVersion: string): boolean {
    const last = context.globalState.get<LastAutoReload>(LAST_AUTO_RELOAD_KEY);
    if (!last || last.cursorVersion !== cursorVersion) {
        return true;
    }
    return Date.now() - last.time > AUTO_RELOAD_GUARD_MS;
}

// Applies the full patch set (rtl.js + config + workbench.js + checksum) and
// reloads the window so it takes effect. Shared by first enable, re-enable
// and the automatic after-Cursor-update path.
async function applyFullPatch(
    context: vscode.ExtensionContext,
    { firstTime, auto }: { firstTime: boolean; auto: boolean }
): Promise<void> {
    const preloadJsPath = getPreloadJsPath();
    const productVersion = getProductVersion();
    const rtlVersion = getBundledRtlVersion(context) ?? '0.0.0';

    copyRtlScript(getRtlDir(), context.extensionPath);
    writeEditorConfig();
    applyPatch(preloadJsPath, productVersion, rtlVersion);

    // Also patch the auxiliary preload used by the Agents window.
    // Errors here are non-fatal: the main IDE windows will still have RTL;
    // the Agents window will simply be skipped until the next enable/reload.
    try {
        applyPatch(getPreloadAuxJsPath(), productVersion, rtlVersion);
    } catch (err) {
        actionError(err, { op: 'patch_apply_aux' });
    }

    try {
        updateChecksum(getProductJsonPath(), preloadJsPath);
    } catch (err) {
        actionError(err, { op: 'checksum_update' });
        vscode.window.showWarningMessage(
            'Cursor RTL: The patch was applied, but the integrity checksum could not be updated. ' +
            'Cursor may show an "installation appears to be corrupt" warning — it is safe to ' +
            'ignore (choose "Don\'t show again").'
        );
    }

    action(firstTime ? 'patch_apply' : auto ? 'patch_auto_reapply' : 'patch_reapply');
    await context.globalState.update(EVER_ENABLED_KEY, true);
    await context.globalState.update(DISABLED_BY_USER_KEY, undefined);
    updateStatusBar('on');

    const config = vscode.workspace.getConfiguration('cursorRtl');
    const autoReload = config.get<boolean>('autoReloadAfterPatch', true);

    if (autoReload && autoReloadAllowed(context, productVersion)) {
        await context.globalState.update(LAST_AUTO_RELOAD_KEY, {
            cursorVersion: productVersion,
            time: Date.now(),
        } satisfies LastAutoReload);
        if (auto) {
            // Give the toast a moment to render so the reload isn't a mystery.
            vscode.window.showInformationMessage('Cursor RTL: re-applied after a Cursor update — reloading window.');
            await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else {
        await offerReload(
            firstTime
                ? 'RTL patch applied. Reload the window to activate it.'
                : 'RTL patch re-applied. Reload the window to activate it.'
        );
    }
}

const FIX_PERMISSIONS_BUTTON = 'Fix permissions (Admin)';

// Runs the one-time elevated ACL grant (elevate.ts) behind a UAC prompt and,
// when it sticks, retries the operation that just failed. From then on the
// machine-wide install behaves like a per-user one — no elevation needed for
// enable/disable, the auto re-patch after Cursor updates, script refresh or
// the uninstall hook.
async function runPermissionFix(retry: () => Promise<void>): Promise<void> {
    const result = await grantWriteAccess();
    action('elevation_grant', { result });
    if (result === 'granted') {
        try {
            await retry();
        } catch (err) {
            actionError(err, { op: 'elevation_retry' });
            vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
        }
    } else if (result === 'cancelled') {
        vscode.window.showInformationMessage(
            'Cursor RTL: The administrator prompt was dismissed; nothing was changed.'
        );
    } else {
        vscode.window.showErrorMessage(
            'Cursor RTL: Fixing permissions failed. Run Cursor as Administrator once and try again.'
        );
    }
}

// A permission failure on a machine-wide install gets a one-click fix button
// next to the error; any other error keeps the plain message.
async function showErrorWithPermissionFix(
    err: unknown,
    message: string,
    retry: () => Promise<void>
): Promise<void> {
    if (process.platform !== 'win32' || !isPermissionError(err)) {
        void vscode.window.showErrorMessage(message);
        return;
    }
    const choice = await vscode.window.showErrorMessage(message, FIX_PERMISSIONS_BUTTON);
    if (choice === FIX_PERMISSIONS_BUTTON) {
        await runPermissionFix(retry);
    }
}

// Single apply entry point for both "enable" and "fix after a Cursor
// update" — the underlying operation is identical and idempotent. Only a
// first-ever enable asks for consent with a dry-run preview.
async function enableCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const firstTime = !context.globalState.get<boolean>(EVER_ENABLED_KEY) &&
        !isPatched(validation.preloadJsPath);

    if (firstTime) {
        const dryRun = getDryRunSummary(validation.preloadJsPath, getRtlDir());
        const detail = dryRun.map((a) => `• ${a}`).join('\n');

        const confirm = await vscode.window.showWarningMessage(
            'Enable RTL support for Cursor?\n\nThis will modify Cursor app files.',
            { modal: true, detail },
            'Enable'
        );

        if (confirm !== 'Enable') {
            return;
        }
    }

    try {
        await applyFullPatch(context, { firstTime, auto: false });
    } catch (err) {
        actionError(err, { op: firstTime ? 'patch_apply' : 'patch_reapply' });
        await showErrorWithPermissionFix(
            err,
            `Cursor RTL: ${handlePermissionError(err)}`,
            () => applyFullPatch(context, { firstTime, auto: false })
        );
    }
}

async function disableCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        'Disable RTL support?\n\nThis will restore the original preload.js and product.json.',
        { modal: true },
        'Disable'
    );

    if (confirm !== 'Disable') {
        return;
    }

    const doRemove = async (): Promise<void> => {
        const preloadJsPath = validation.preloadJsPath;
        removePatch(preloadJsPath, getProductVersion());
        // Also restore the auxiliary preload (Agents window). Best-effort.
        try {
            removePatch(getPreloadAuxJsPath(), getProductVersion());
        } catch {
            // non-critical
        }
        try {
            restoreChecksum(getProductJsonPath(), preloadJsPath);
        } catch {
            // Non-critical: the checksum matching a clean file is only cosmetic.
        }
        removeRtlFiles(getRtlDir());
        await context.globalState.update(DISABLED_BY_USER_KEY, true);
        action('patch_remove');
        updateStatusBar('off');

        await offerReload('RTL patch removed. Reload the window to apply.');
    };

    try {
        await doRemove();
    } catch (err) {
        actionError(err, { op: 'patch_remove' });
        await showErrorWithPermissionFix(
            err,
            `Cursor RTL: ${handlePermissionError(err)}`,
            doRemove
        );
    }
}

async function statusCommand(): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const state = getPatchState();
    action('status_check', { state });

    if (state === 'on') {
        vscode.window.showInformationMessage(
            'Cursor RTL: Patch is ACTIVE. RTL support is enabled.'
        );
    } else {
        vscode.window.showInformationMessage(
            'Cursor RTL: Patch is NOT applied. Use "Cursor RTL: Enable" to activate.'
        );
    }
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const version = context.extension.packageJSON.version;
    return typeof version === 'string' ? version : '0.0.0';
}

function getNumberSetting(name: string, defaultValue: number, minValue: number): number {
    const config = vscode.workspace.getConfiguration('cursorRtl');
    const value = config.get<number>(name, defaultValue);
    return Math.max(minValue, Number.isFinite(value) ? value : defaultValue);
}

function getUpdateCheckConfig(): {
    enabled: boolean;
    intervalMs: number;
} {
    const config = vscode.workspace.getConfiguration('cursorRtl');
    return {
        enabled: config.get<boolean>('checkForExtensionUpdates', true),
        intervalMs: getNumberSetting('updateCheckIntervalHours', 6, 1) * MS_PER_HOUR,
    };
}

const PENDING_UPDATE_KEY = 'pendingUpdateVersion';

// A new release was found: install it automatically. The only UI is small
// toasts (download/install progress, then a reload offer) — no modal dialogs
// and no user action beyond the final reload.
async function handleUpdateAvailable(
    context: vscode.ExtensionContext,
    result: Extract<UpdateCheckResult, { status: 'updateAvailable' }>,
    mode: UpdateCheckMode
): Promise<void> {
    action('version_available', { mode, version: result.remoteVersion });

    // Already installed (possibly by another window) and awaiting reload —
    // don't reinstall and re-toast on every periodic check.
    if (context.globalState.get<string>(PENDING_UPDATE_KEY) === result.remoteVersion) {
        return;
    }

    // The marketplace conversion below uninstalls before it installs, and
    // the GitHub VSIX is the recovery path if the gallery install then
    // fails — so a release without a VSIX asset installs nothing, and a
    // later check retries once the release carries one.
    if (!result.vsixDownloadUrl) {
        return;
    }

    // Prefer the marketplace over the GitHub VSIX: a fresh gallery install
    // writes source: 'gallery' with pinned: false into extensions.json,
    // converting this VSIX install into one Cursor auto-updates itself —
    // after the reload isMarketplaceInstall is true and this checker stands
    // down for good.
    if (await tryMarketplaceUpdate(context, result, mode)) {
        return;
    }

    await autoInstallExtensionUpdate(context, result, mode);
}

// The newest version of this extension present on disk, read from the
// sibling install directories (~/.cursor/extensions/<publisher>.<name>-*).
// vscode.extensions still reports the loaded (old) version until reload, so
// the disk is the only place a just-installed copy is visible.
function getNewestInstalledVersion(context: vscode.ExtensionContext): string | null {
    try {
        const extensionsRoot = path.dirname(context.extensionPath);
        const prefix = `${context.extension.id.toLowerCase()}-`;
        let newest: string | null = null;
        for (const entry of fs.readdirSync(extensionsRoot)) {
            if (!entry.toLowerCase().startsWith(prefix)) {
                continue;
            }
            try {
                const raw = fs.readFileSync(
                    path.join(extensionsRoot, entry, 'package.json'),
                    'utf-8'
                );
                const version = (JSON.parse(raw) as { version?: string }).version;
                if (version && (!newest || isNewer(version, newest))) {
                    newest = version;
                }
            } catch {
                // Half-removed install dir — skip it.
            }
        }
        return newest;
    } catch {
        return null;
    }
}

// Installs the update from Cursor's marketplace by extension ID. Returns
// false — sending the caller to the GitHub VSIX fallback — when the gallery
// is unreachable or its mirror hasn't picked up the release yet (the
// installer silently no-ops when it has nothing newer, so success is
// verified against the disk, not the command result).
//
// The uninstall first is what makes this a real conversion: installExtension
// alone re-extracts the newer version but carries the VSIX install's
// pinned: true over to the new extensions.json entry, and pinned installs
// are excluded from Cursor's auto-updates (verified in the lab, 2026-09-02).
// Only uninstall + install writes pinned: false. The uninstalled extension
// keeps running until restart, so it can run both commands on itself, and
// the caller guarantees a GitHub VSIX exists as the recovery install if the
// gallery install fails after the uninstall.
async function tryMarketplaceUpdate(
    context: vscode.ExtensionContext,
    result: Extract<UpdateCheckResult, { status: 'updateAvailable' }>,
    mode: UpdateCheckMode
): Promise<boolean> {
    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Cursor RTL: Updating to ${result.remoteVersion}`,
            },
            async (progress) => {
                progress.report({ message: 'Installing from marketplace…' });
                try {
                    await vscode.commands.executeCommand(
                        'workbench.extensions.uninstallExtension',
                        context.extension.id
                    );
                } catch (err) {
                    // Not fatal: the install below still updates the
                    // version; the pin then survives and this checker
                    // simply stays in charge of future updates.
                    actionError(err, { op: 'update_uninstall_marketplace', mode });
                }
                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    context.extension.id
                );
            }
        );
    } catch (err) {
        actionError(err, {
            op: 'update_install_marketplace',
            mode,
            version: result.remoteVersion,
        });
        return false;
    }

    const installed = getNewestInstalledVersion(context);
    if (!installed || !isNewer(installed, result.currentVersion)) {
        action('update_marketplace_lagging', { mode, installed: installed ?? 'none' });
        return false;
    }

    action('update_install_marketplace_ok', { mode, version: installed });
    // Keyed by remoteVersion (not installed) so the pending dedup above
    // matches what the next GitHub check reports.
    await context.globalState.update(PENDING_UPDATE_KEY, result.remoteVersion);
    await offerReload(
        `Cursor RTL updated to ${installed} from the marketplace. Reload the window to activate it.`
    );
    return true;
}

// Downloads the release VSIX and installs it in the background. On any
// failure, falls back to the manual flow (browser download links).
async function autoInstallExtensionUpdate(
    context: vscode.ExtensionContext,
    result: Extract<UpdateCheckResult, { status: 'updateAvailable' }>,
    mode: UpdateCheckMode
): Promise<void> {
    const vsixDir = context.globalStorageUri.fsPath;
    // Per-process file name: several open windows may update concurrently,
    // and a shared path would let one window overwrite a VSIX mid-install.
    const vsixPath = path.join(
        vsixDir,
        `cursor-rtl-${result.remoteVersion}-${process.pid}.vsix`
    );

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Cursor RTL: Updating to ${result.remoteVersion}`,
            },
            async (progress) => {
                progress.report({ message: 'Downloading…' });
                fs.mkdirSync(vsixDir, { recursive: true });
                await downloadFile(result.vsixDownloadUrl as string, vsixPath);
                progress.report({ message: 'Installing…' });
                await vscode.commands.executeCommand(
                    'workbench.extensions.installExtension',
                    vscode.Uri.file(vsixPath)
                );
            }
        );
    } catch (err) {
        actionError(err, { op: 'update_install', mode, version: result.remoteVersion });
        cleanupVsix(vsixPath);
        await showManualUpdateFallback(result, mode, err);
        return;
    }

    action('update_install_ok', { mode, version: result.remoteVersion });
    cleanupVsix(vsixPath);
    await context.globalState.update(PENDING_UPDATE_KEY, result.remoteVersion);

    await offerReload(
        `Cursor RTL updated to ${result.remoteVersion}. Reload the window to activate it.`
    );
}

function cleanupVsix(vsixPath: string): void {
    try {
        if (fs.existsSync(vsixPath)) {
            fs.unlinkSync(vsixPath);
        }
    } catch {
        // best-effort
    }
}

async function showManualUpdateFallback(
    result: Extract<UpdateCheckResult, { status: 'updateAvailable' }>,
    mode: UpdateCheckMode,
    err: unknown
): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const openReleasePage: vscode.MessageItem = { title: 'Open Release Page' };
    const downloadVsix: vscode.MessageItem = { title: 'Download VSIX' };
    const actions: vscode.MessageItem[] = [openReleasePage];
    if (result.vsixDownloadUrl) {
        actions.push(downloadVsix);
    }

    const choice = await vscode.window.showWarningMessage(
        `Cursor RTL: Automatic update failed (${message}). You can update manually instead.`,
        ...actions
    );

    if (choice === openReleasePage) {
        action('update_action_release_page', { mode, version: result.remoteVersion });
        await vscode.env.openExternal(vscode.Uri.parse(result.releaseUrl));
    } else if (choice === downloadVsix && result.vsixDownloadUrl) {
        action('update_action_download_vsix', { mode, version: result.remoteVersion });
        await vscode.env.openExternal(vscode.Uri.parse(result.vsixDownloadUrl));
    }
}

async function runExtensionUpdateCheck(
    context: vscode.ExtensionContext,
    mode: UpdateCheckMode
): Promise<void> {
    // Installing a GitHub VSIX over a marketplace install would strip the
    // gallery metadata and detach the user from Cursor's own auto-updates,
    // so marketplace installs never touch the GitHub flow. Scheduling
    // already skips them; this guard is defense in depth.
    if (isMarketplaceInstall(context.extensionPath)) {
        action('update_check_skipped_marketplace', { mode });
        return;
    }

    const config = getUpdateCheckConfig();
    if (!config.enabled) {
        return;
    }

    action('update_check_started', { mode });
    const result = await checkForExtensionUpdate(getExtensionVersion(context));

    if (result.status === 'failed') {
        action('update_check_failed', { mode, error: result.error });
        return;
    }

    if (result.status === 'upToDate') {
        // Any previously auto-installed update is now the running version.
        void context.globalState.update(PENDING_UPDATE_KEY, undefined);
        return;
    }

    await handleUpdateAvailable(context, result, mode);
}

function clearScheduledUpdateChecks(): void {
    if (startupUpdateCheckTimeout) {
        clearTimeout(startupUpdateCheckTimeout);
        startupUpdateCheckTimeout = undefined;
    }

    if (updateCheckInterval) {
        clearInterval(updateCheckInterval);
        updateCheckInterval = undefined;
    }
}

function scheduleExtensionUpdateChecks(context: vscode.ExtensionContext): void {
    clearScheduledUpdateChecks();

    const config = getUpdateCheckConfig();
    if (!config.enabled) {
        return;
    }

    // Marketplace installs are kept current by Cursor's own extension
    // updater — running our GitHub checker too would double the update UX.
    // runExtensionUpdateCheck re-checks as defense in depth.
    if (isMarketplaceInstall(context.extensionPath)) {
        action('update_checks_skipped_marketplace_install');
        return;
    }

    startupUpdateCheckTimeout = setTimeout(() => {
        void runExtensionUpdateCheck(context, 'startup');
    }, STARTUP_UPDATE_CHECK_DELAY_MS);

    updateCheckInterval = setInterval(() => {
        void runExtensionUpdateCheck(context, 'periodic');
    }, config.intervalMs);
}

// 1.2.x migration (plan §3.8): undo the old main-process patch. Failures are
// swallowed — the leftover is harmless (rtl.js's re-injection guard) and the
// next Cursor update erases the patched main.js anyway.
//
// A patched main.js or a loader file next to it means RTL was enabled under
// 1.2.x, and 1.2.x never wrote everEnabled. Record that consent here, before
// the leftovers are removed, so the startup flow takes the silent automatic
// re-apply path instead of showing the first-install dialog to every
// upgrading user (a dismissed dialog would have switched RTL off for good).
async function runLegacyMigration(context: vscode.ExtensionContext): Promise<void> {
    try {
        const mainJsPath = getMainJsPath();
        const legacyPatched = fs.existsSync(mainJsPath) && isLegacyPatched(mainJsPath);
        const legacyLoader = fs.existsSync(
            path.join(path.dirname(mainJsPath), LEGACY_LOADER_FILENAME)
        );
        if (
            (legacyPatched || legacyLoader) &&
            !context.globalState.get<boolean>(EVER_ENABLED_KEY)
        ) {
            await context.globalState.update(EVER_ENABLED_KEY, true);
            action('legacy_consent_carried_over');
        }
        if (legacyPatched) {
            removeLegacyPatch(mainJsPath);
            action('legacy_migrated');
        } else if (legacyLoader) {
            fs.rmSync(path.join(path.dirname(mainJsPath), LEGACY_LOADER_FILENAME), { force: true });
        }
    } catch {
        // best-effort
    }
}

function getBundledRtlVersion(context: vscode.ExtensionContext): string | null {
    return getRtlScriptVersion(
        path.join(context.extensionPath, 'resources', 'rtl.js')
    );
}

interface RefreshWarned {
    version: string;
    appPid: number;
}

const REFRESH_WARNED_KEY = 'refreshWarned';

// A failed script refresh (typically: Cursor installed under Program Files
// and no write permission) is worth one warning per Cursor launch, not one
// per window or per reload. process.ppid is the Cursor main process — stable
// across window reloads and shared by all windows of a run, different on the
// next launch — so (version, ppid) in globalState dedups exactly to that.
function warnRefreshFailed(
    context: vscode.ExtensionContext,
    bundled: string,
    err: unknown
): void {
    const prev = context.globalState.get<RefreshWarned>(REFRESH_WARNED_KEY);
    if (prev && prev.version === bundled && prev.appPid === process.ppid) {
        return;
    }
    void context.globalState.update(REFRESH_WARNED_KEY, {
        version: bundled,
        appPid: process.ppid,
    } satisfies RefreshWarned);
    const buttons =
        process.platform === 'win32' && isPermissionError(err)
            ? [FIX_PERMISSIONS_BUTTON]
            : [];
    void vscode.window
        .showWarningMessage(
            `Cursor RTL: Updating the injected RTL script to ${bundled} failed. ` +
            `${handlePermissionError(err)} ` +
            'RTL keeps working with the previously installed version.',
            ...buttons
        )
        .then(async (choice) => {
            if (choice === FIX_PERMISSIONS_BUTTON) {
                await runPermissionFix(async () => refreshRtlScript(context));
            }
        });
}

// When the patch is already on, keep the installed cursor-rtl.js current with
// the copy bundled in this extension version (plan §3.6). The bootstrap block
// in preload.js is rewritten too, so its ?v= cache-buster makes the next
// reload fetch the new script. The reload is offered, never automatic.
function refreshRtlScript(context: vscode.ExtensionContext): void {
    let bundled: string | null = null;
    try {
        bundled = getBundledRtlVersion(context);
        if (!bundled) {
            return;
        }
        const installedScript = getRtlScriptVersion(getRtlScriptDestPath());
        const installedBootstrap = getInstalledBootstrapVersion(getPreloadJsPath());
        const installedBootstrapAux = getInstalledBootstrapVersion(getPreloadAuxJsPath());
        if (installedScript === bundled && installedBootstrap === bundled && installedBootstrapAux === bundled) {
            void context.globalState.update(REFRESH_WARNED_KEY, undefined);
            return;
        }
        copyRtlScript(getRtlDir(), context.extensionPath);
        const preloadJsPath = getPreloadJsPath();
        applyPatch(preloadJsPath, getProductVersion(), bundled);
        // Also refresh the auxiliary preload (Agents window). Best-effort.
        try {
            applyPatch(getPreloadAuxJsPath(), getProductVersion(), bundled);
        } catch {
            // non-critical
        }
        try {
            updateChecksum(getProductJsonPath(), preloadJsPath);
        } catch {
            // cosmetic — surfaced by diagnostics
        }
        void context.globalState.update(REFRESH_WARNED_KEY, undefined);
        action('rtl_script_refreshed', { from: installedScript ?? 'missing', to: bundled });
        void offerReload(
            `Cursor RTL: The RTL script was updated to ${bundled}. Reload the window to apply it.`
        );
    } catch (err) {
        // The installed script keeps working until the new one can be
        // written (e.g. after a permissions fix) — but say so, once per
        // Cursor launch.
        actionError(err, { op: 'rtl_refresh' });
        if (bundled) {
            warnRefreshFailed(context, bundled, err);
        }
    }
}

// Startup flow (plan §3.6).
async function runStartupFlow(context: vscode.ExtensionContext): Promise<void> {
    await runLegacyMigration(context);

    const validation = validatePaths();
    if (!validation.valid) {
        updateStatusBar('off');
        return;
    }

    if (isPatched(validation.preloadJsPath)) {
        refreshRtlScript(context);
        writeEditorConfig();
        updateStatusBar('on');
        return;
    }

    if (context.globalState.get<boolean>(DISABLED_BY_USER_KEY)) {
        updateStatusBar('off');
        return;
    }

    if (!context.globalState.get<boolean>(EVER_ENABLED_KEY)) {
        // First install: ask for consent, like the Enable command.
        updateStatusBar('off');
        await enableCommand(context);
        if (getPatchState() === 'off') {
            // User declined — remember, so the dialog doesn't reappear on
            // every window. Enable clears this.
            await context.globalState.update(DISABLED_BY_USER_KEY, true);
        }
        return;
    }

    // A Cursor update wiped out/: re-apply and reload automatically.
    try {
        await applyFullPatch(context, { firstTime: false, auto: true });
    } catch (err) {
        actionError(err, { op: 'patch_auto_reapply' });
        updateStatusBar('off');
        const buttons =
            process.platform === 'win32' && isPermissionError(err)
                ? [FIX_PERMISSIONS_BUTTON, 'Retry']
                : ['Retry'];
        const choice = await vscode.window.showWarningMessage(
            `Cursor RTL: Re-applying the patch after a Cursor update failed. ${handlePermissionError(err)}`,
            ...buttons
        );
        if (choice === FIX_PERMISSIONS_BUTTON) {
            await runPermissionFix(() => applyFullPatch(context, { firstTime: false, auto: true }));
        } else if (choice === 'Retry') {
            await enableCommand(context);
        }
    }
}

// 'user' when Cursor is installed under the user's profile (e.g.
// %LOCALAPPDATA%\Programs\cursor), 'machine' otherwise (e.g. Program Files,
// /Applications) — the machine-wide case is where patching hits permission
// walls.
function getInstallScope(): string {
    try {
        let appRoot = path.resolve(vscode.env.appRoot);
        let home = path.resolve(os.homedir());
        if (process.platform === 'win32') {
            appRoot = appRoot.toLowerCase();
            home = home.toLowerCase();
        }
        return appRoot.startsWith(home + path.sep) ? 'user' : 'machine';
    } catch {
        return 'unknown';
    }
}

// The extension host inherits the IDE process's elevation. On Windows,
// fltmc.exe exits 0 only when elevated; on POSIX, uid 0 means root. The
// Windows probe spawns a process, so it runs asynchronously: activate()
// must not block the extension host on it.
function getElevation(): Promise<string> {
    if (process.platform !== 'win32') {
        try {
            return Promise.resolve(process.getuid?.() === 0 ? 'admin' : 'user');
        } catch {
            return Promise.resolve('unknown');
        }
    }
    return new Promise((resolve) => {
        try {
            const child = spawn('fltmc.exe', [], { windowsHide: true, stdio: 'ignore' });
            const timer = setTimeout(() => {
                child.kill();
                resolve('unknown');
            }, 3000);
            child.on('error', () => {
                clearTimeout(timer);
                resolve('unknown');
            });
            child.on('close', (code) => {
                clearTimeout(timer);
                resolve(code === 0 ? 'admin' : 'user');
            });
        } catch {
            resolve('unknown');
        }
    });
}

export function activate(context: vscode.ExtensionContext): { extendMarkdownIt(md: unknown): unknown } {
    const channel = (process.env as Record<string, string | undefined>).CURSOR_CHANNEL
        ?? (process.env as Record<string, string | undefined>).VSCODE_CHANNEL
        ?? '';
    initActions({
        clientVersion: vscode.version,
        extensionVersion: getExtensionVersion(context),
        channel,
        machineId: vscode.env.machineId,
        installScope: getInstallScope(),
        // Captured at activation, so events sent after a mid-session
        // VSIX→marketplace conversion still report the pre-conversion source
        // until the window reloads.
        installSource: isMarketplaceInstall(context.extensionPath) ? 'marketplace' : 'vsix',
        appName: vscode.env.appName,
        appRoot: vscode.env.appRoot,
    });

    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'cursorRtl.quickPick';
    context.subscriptions.push(statusBarItem);

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.quickPick', showQuickPick)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.enable', () =>
            enableCommand(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.disable', () =>
            disableCommand(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.status', () =>
            statusCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.setEditorRtl', () =>
            setEditorRtlCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.diagnostics', () =>
            runDiagnostics(context)
        )
    );

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cursorRtl.showStatusBar')) {
            updateStatusBar(getPatchState());
        }
        if (
            e.affectsConfiguration('cursorRtl.checkForExtensionUpdates') ||
            e.affectsConfiguration('cursorRtl.updateCheckIntervalHours')
        ) {
            scheduleExtensionUpdateChecks(context);
        }
        if (e.affectsConfiguration('cursorRtl.editorRtl')) {
            writeEditorConfig();
        }
        if (e.affectsConfiguration('cursorRtl.markdownPreview')) {
            void vscode.commands.executeCommand('markdown.preview.refresh');
        }
    }, null, context.subscriptions);

    // installSource rides on every event as a common property (set in
    // initActions above), ext_start included. elevation joins the common
    // properties once the async probe answers; ext_start waits for it so the
    // first event already carries it.
    void getElevation().then((elevation) => {
        setCommonProperty('elevation', elevation);
        action('ext_start', {
            state: getPatchState(),
            platform: process.platform,
        });
    });

    void runStartupFlow(context);

    scheduleExtensionUpdateChecks(context);

    // Consumed by the built-in markdown-language-features extension
    // (declared via "markdown.markdownItPlugins" in package.json).
    return {
        extendMarkdownIt(md: unknown) {
            const engine = md as MarkdownItLike & {
                use(plugin: (m: MarkdownItLike) => void): unknown;
            };
            return engine.use(
                markdownItCursorRtl(() =>
                    vscode.workspace
                        .getConfiguration('cursorRtl')
                        .get<boolean>('markdownPreview', true)
                )
            );
        },
    };
}

export function deactivate(): Promise<void> {
    action('ext_stop');
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = undefined;
    }
    if (blinkTimeout) {
        clearTimeout(blinkTimeout);
        blinkTimeout = undefined;
    }
    clearScheduledUpdateChecks();
    return disposeActions().catch(() => {});
}
