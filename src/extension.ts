import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { validatePaths, getMainJsPath, getAppOutDir, getConfigPath } from './paths';
import {
    isPatched,
    hasBackups,
    applyPatch,
    removePatch,
    copyLoader,
    getLoaderVersion,
    getDryRunSummary,
    handlePermissionError,
} from './patcher';
import { LOADER_FILENAME } from './constants';
import {
    checkForExtensionUpdate,
    downloadFile,
    isMarketplaceInstall,
    UpdateCheckResult,
} from './updateChecker';
import { runDiagnostics } from './diagnostics';
import { init as initActions, action, error as actionError, dispose as disposeActions } from './actions';

let statusBarItem: vscode.StatusBarItem;
let fileWatcher: fs.FSWatcher | undefined;
let blinkInterval: ReturnType<typeof setInterval> | undefined;
let blinkTimeout: ReturnType<typeof setTimeout> | undefined;
let startupUpdateCheckTimeout: ReturnType<typeof setTimeout> | undefined;
let updateCheckInterval: ReturnType<typeof setInterval> | undefined;

type PatchState = 'on' | 'off' | 'update-needed';
type UpdateCheckMode = 'startup' | 'periodic' | 'manual';

const STARTUP_UPDATE_CHECK_DELAY_MS = 5_000;
const MS_PER_HOUR = 60 * 60 * 1000;

function getPatchState(mainJsPath: string): PatchState {
    if (!fs.existsSync(mainJsPath)) {
        return 'off';
    }
    if (isPatched(mainJsPath)) {
        return 'on';
    }
    if (hasBackups(mainJsPath)) {
        return 'update-needed';
    }
    return 'off';
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
        case 'update-needed':
            statusBarItem.text = '$(warning) RTL: UPDATE NEEDED';
            statusBarItem.tooltip =
                'Cursor was updated and the RTL patch needs to be re-applied. Click for options.';
            startBlink('statusBarItem.warningBackground');
            break;
    }

    statusBarItem.show();
}

async function showQuickPick(): Promise<void> {
    const mainJsPath = getMainJsPath();
    const state = getPatchState(mainJsPath);

    const items: vscode.QuickPickItem[] = [];

    if (state === 'on') {
        items.push(
            { label: '$(circle-slash) Disable RTL', description: 'Remove patch and restore original main.js' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    } else if (state === 'update-needed') {
        items.push(
            { label: '$(refresh) Fix RTL After Cursor Update', description: 'Re-apply the patch that the Cursor update removed' },
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

    if (picked.label.includes('Enable') || picked.label.includes('Fix RTL')) {
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

// Persist the editor-RTL mode where the injected loader can read it. The
// loader watches this file and pushes changes live into open windows.
function writeEditorConfig(): void {
    try {
        fs.writeFileSync(
            getConfigPath(),
            JSON.stringify({ editorRtl: getEditorRtlMode() })
        );
    } catch {
        // Non-critical: the loader defaults to 'auto' when the file is absent.
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

// Single apply entry point for both "enable" and "fix after a Cursor
// update" — the underlying operation is identical (copy loader + apply
// patch, both idempotent). Only a first-ever enable asks for consent with a
// dry-run preview; once the user has enabled before (backups exist or the
// patch is present), it runs straight away.
async function enableCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;
    const outDir = getAppOutDir();
    const firstTime = !isPatched(mainJsPath) && !hasBackups(mainJsPath);

    if (firstTime) {
        const dryRun = getDryRunSummary(mainJsPath);
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
        copyLoader(outDir, context.extensionPath);
        applyPatch(mainJsPath);
        action(firstTime ? 'patch_apply' : 'patch_reapply');
        updateStatusBar('on');
        setupFileWatcher(mainJsPath, context);

        const restart = await vscode.window.showInformationMessage(
            firstTime
                ? 'RTL patch applied successfully! Please close and reopen all Cursor windows to activate.'
                : 'RTL patch re-applied successfully! Please close and reopen all Cursor windows to activate.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: firstTime ? 'patch_apply' : 'patch_reapply' });
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
    }
}

async function disableCommand(): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;

    const confirm = await vscode.window.showWarningMessage(
        'Disable RTL support?\n\nThis will restore the original main.js from backup.',
        { modal: true },
        'Disable'
    );

    if (confirm !== 'Disable') {
        return;
    }

    try {
        removePatch(mainJsPath);
        action('patch_remove');
        updateStatusBar('off');

        const restart = await vscode.window.showInformationMessage(
            'RTL patch removed. Please close and reopen all Cursor windows to apply changes.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: 'patch_remove' });
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
    }
}

async function statusCommand(): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const state = getPatchState(validation.mainJsPath);
    action('status_check', { state });

    switch (state) {
        case 'on':
            vscode.window.showInformationMessage(
                'Cursor RTL: Patch is ACTIVE. RTL support is enabled.'
            );
            break;
        case 'off':
            vscode.window.showInformationMessage(
                'Cursor RTL: Patch is NOT applied. Use "Cursor RTL: Enable" to activate.'
            );
            break;
        case 'update-needed': {
            const choice = await vscode.window.showWarningMessage(
                'Cursor RTL: Cursor was updated and the patch needs to be re-applied.',
                'Fix Now'
            );
            if (choice === 'Fix Now') {
                await vscode.commands.executeCommand('cursorRtl.enable');
            }
            break;
        }
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

    // Release without a VSIX asset: nothing to auto-install.
    if (!result.vsixDownloadUrl) {
        if (mode === 'manual') {
            const choice = await vscode.window.showInformationMessage(
                `Cursor RTL: A new version is available (${result.remoteVersion}).`,
                'Open Release Page'
            );
            if (choice === 'Open Release Page') {
                action('update_action_release_page', { mode, version: result.remoteVersion });
                await vscode.env.openExternal(vscode.Uri.parse(result.releaseUrl));
            }
        }
        return;
    }

    // Already installed (possibly by another window) and awaiting reload —
    // don't reinstall and re-toast on every periodic check.
    if (context.globalState.get<string>(PENDING_UPDATE_KEY) === result.remoteVersion) {
        if (mode === 'manual') {
            await offerReload(
                `Cursor RTL ${result.remoteVersion} is already installed. Reload the window to activate it.`
            );
        }
        return;
    }

    await autoInstallExtensionUpdate(context, result, mode);
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
    const config = getUpdateCheckConfig();
    if (!config.enabled && mode !== 'manual') {
        return;
    }

    action('update_check_started', { mode });
    const result = await checkForExtensionUpdate(getExtensionVersion(context));

    if (result.status === 'failed') {
        action('update_check_failed', { mode, error: result.error });
        if (mode === 'manual') {
            vscode.window.showWarningMessage(
                `Cursor RTL: Could not check for extension updates. ${result.error}`
            );
        }
        return;
    }

    if (result.status === 'upToDate') {
        // Any previously auto-installed update is now the running version.
        void context.globalState.update(PENDING_UPDATE_KEY, undefined);
        if (mode === 'manual') {
            const version = result.remoteVersion ?? result.currentVersion;
            vscode.window.showInformationMessage(`Cursor RTL is up to date (${version}).`);
        }
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
    // The manual "Check for Extension Updates" command still works.
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

function refreshLoader(context: vscode.ExtensionContext): void {
    try {
        const outDir = getAppOutDir();
        copyLoader(outDir, context.extensionPath);
    } catch {
        // Non-critical — loader is self-discovering, works even if outdated
    }
}

// After refreshLoader has tried to silently update the installed loader, a
// remaining version gap means the copy failed (usually permissions on the
// Cursor app directory) or the loader file is gone — offer a proper Re-apply,
// which surfaces permission errors with guidance.
function checkLoaderVersionGap(context: vscode.ExtensionContext): void {
    const bundled = getLoaderVersion(
        path.join(context.extensionPath, 'resources', LOADER_FILENAME)
    );
    if (!bundled) {
        return;
    }

    const installed = getLoaderVersion(path.join(getAppOutDir(), LOADER_FILENAME));
    if (installed === bundled) {
        return;
    }

    action('loader_gap', { bundled, installed: installed ?? 'missing-or-pre-1.3.0' });
    void vscode.window
        .showWarningMessage(
            `Cursor RTL: The loader installed in Cursor is outdated ` +
            `(installed: ${installed ?? 'unknown'}, expected: ${bundled}). ` +
            `Re-apply the RTL patch to update it.`,
            'Fix Now',
            'Later'
        )
        .then(async (choice) => {
            if (choice === 'Fix Now') {
                await vscode.commands.executeCommand('cursorRtl.enable');
            }
        });
}

function setupFileWatcher(
    mainJsPath: string,
    context: vscode.ExtensionContext
): void {
    if (fileWatcher) {
        fileWatcher.close();
    }

    try {
        fileWatcher = fs.watch(mainJsPath, (eventType) => {
            if (eventType === 'change') {
                setTimeout(async () => {
                    const state = getPatchState(mainJsPath);
                    if (state === 'update-needed' || state === 'off') {
                        action('update_detect');
                        updateStatusBar('update-needed');

                        const config = vscode.workspace.getConfiguration('cursorRtl');
                        if (config.get<boolean>('autoReapply', false)) {
                            await enableCommand(context);
                        } else {
                            const choice = await vscode.window.showWarningMessage(
                                'Cursor was updated and the RTL patch was removed. Fix now?',
                                'Fix Now',
                                'Dismiss'
                            );
                            if (choice === 'Fix Now') {
                                await vscode.commands.executeCommand('cursorRtl.enable');
                            }
                        }
                    }
                }, 1000);
            }
        });
    } catch {
        // fs.watch may fail on some platforms/configurations -- non-critical
    }
}

export function activate(context: vscode.ExtensionContext): void {
    const channel = (process.env as Record<string, string | undefined>).CURSOR_CHANNEL
        ?? (process.env as Record<string, string | undefined>).VSCODE_CHANNEL
        ?? '';
    initActions({
        clientVersion: vscode.version,
        extensionVersion: getExtensionVersion(context),
        channel,
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
            disableCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.status', () =>
            statusCommand()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursorRtl.checkForUpdates', () =>
            runExtensionUpdateCheck(context, 'manual')
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

    writeEditorConfig();

    const mainJsPath = getMainJsPath();
    const state = getPatchState(mainJsPath);

    updateStatusBar(state);

    if (state === 'on') {
        refreshLoader(context);
        checkLoaderVersionGap(context);
    }

    if (fs.existsSync(mainJsPath) && (state === 'on' || state === 'update-needed')) {
        setupFileWatcher(mainJsPath, context);
    }

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cursorRtl.showStatusBar')) {
            const currentState = getPatchState(mainJsPath);
            updateStatusBar(currentState);
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
    }, null, context.subscriptions);

    const mainJsState = getPatchState(mainJsPath);
    action('ext_start', { state: mainJsState, platform: process.platform });

    scheduleExtensionUpdateChecks(context);
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
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = undefined;
    }
    clearScheduledUpdateChecks();
    return disposeActions().catch(() => {});
}
