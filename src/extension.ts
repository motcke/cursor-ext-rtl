import * as vscode from 'vscode';
import * as fs from 'fs';
import { validatePaths, getMainJsPath, getAppOutDir } from './paths';
import {
    isPatched,
    hasBackups,
    applyPatch,
    removePatch,
    copyLoader,
    getDryRunSummary,
    handlePermissionError,
} from './patcher';
import { checkForUpdates } from './updateChecker';
import { init as initActions, action, error as actionError, dispose as disposeActions } from './actions';

let statusBarItem: vscode.StatusBarItem;
let fileWatcher: fs.FSWatcher | undefined;
let blinkInterval: ReturnType<typeof setInterval> | undefined;
let blinkTimeout: ReturnType<typeof setTimeout> | undefined;

type PatchState = 'on' | 'off' | 'update-needed';

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
    } else {
        items.push(
            { label: '$(check) Enable RTL', description: 'Apply RTL patch to Cursor' },
            { label: '$(info) Check Status', description: 'Show current RTL patch status' }
        );
    }

    if (state === 'update-needed' || state === 'off') {
        items.unshift({
            label: '$(refresh) Re-apply After Update',
            description: 'Re-apply patch after Cursor update',
        });
    }

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
    } else if (picked.label.includes('Re-apply')) {
        await vscode.commands.executeCommand('cursorRtl.reapply');
    } else if (picked.label.includes('Status')) {
        await vscode.commands.executeCommand('cursorRtl.status');
    }
}

async function enableCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;
    const outDir = getAppOutDir();

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

    try {
        copyLoader(outDir, context.extensionPath);
        applyPatch(mainJsPath);
        action('patch_apply');
        updateStatusBar('on');
        setupFileWatcher(mainJsPath, context);

        const restart = await vscode.window.showInformationMessage(
            'RTL patch applied successfully! Please close and reopen all Cursor windows to activate.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: 'patch_apply' });
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
                'Re-apply Now'
            );
            if (choice === 'Re-apply Now') {
                await vscode.commands.executeCommand('cursorRtl.reapply');
            }
            break;
        }
    }
}

async function reapplyCommand(context: vscode.ExtensionContext): Promise<void> {
    const validation = validatePaths();
    if (!validation.valid) {
        vscode.window.showErrorMessage(`Cursor RTL: ${validation.error}`);
        return;
    }

    const mainJsPath = validation.mainJsPath;
    const outDir = getAppOutDir();

    try {
        copyLoader(outDir, context.extensionPath);
        applyPatch(mainJsPath);
        action('patch_reapply');
        updateStatusBar('on');
        setupFileWatcher(mainJsPath, context);

        const restart = await vscode.window.showInformationMessage(
            'RTL patch re-applied successfully! Please close and reopen all Cursor windows to activate.',
            'Quit Cursor',
            'Later'
        );

        if (restart === 'Quit Cursor') {
            await vscode.commands.executeCommand('workbench.action.quit');
        }
    } catch (err) {
        actionError(err, { op: 'patch_reapply' });
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
    }
}

function refreshLoader(context: vscode.ExtensionContext): void {
    try {
        const outDir = getAppOutDir();
        copyLoader(outDir, context.extensionPath);
    } catch {
        // Non-critical — loader is self-discovering, works even if outdated
    }
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
                            await reapplyCommand(context);
                        } else {
                            const choice = await vscode.window.showWarningMessage(
                                'Cursor was updated and the RTL patch was removed. Re-apply?',
                                'Re-apply',
                                'Dismiss'
                            );
                            if (choice === 'Re-apply') {
                                await vscode.commands.executeCommand('cursorRtl.reapply');
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
    initActions({ clientVersion: vscode.version, channel });

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
        vscode.commands.registerCommand('cursorRtl.reapply', () =>
            reapplyCommand(context)
        )
    );

    const mainJsPath = getMainJsPath();
    const state = getPatchState(mainJsPath);

    updateStatusBar(state);

    if (state === 'on') {
        refreshLoader(context);
    }

    if (fs.existsSync(mainJsPath) && (state === 'on' || state === 'update-needed')) {
        setupFileWatcher(mainJsPath, context);
    }

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cursorRtl.showStatusBar')) {
            const currentState = getPatchState(mainJsPath);
            updateStatusBar(currentState);
        }
    }, null, context.subscriptions);

    const mainJsState = getPatchState(mainJsPath);
    action('ext_start', { state: mainJsState, platform: process.platform });

    const extensionVersion = context.extension.packageJSON.version as string;
    checkForUpdates(extensionVersion).then((found) => {
        if (found) action('version_available');
    }).catch(() => {});
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
    return disposeActions().catch(() => {});
}
