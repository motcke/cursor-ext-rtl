import * as vscode from 'vscode';
import * as fs from 'fs';
import { validatePaths, getMainJsPath, getAppOutDir } from './paths';
import {
    isPatched,
    hasBackups,
    applyPatch,
    removePatch,
    copyRtlScript,
    getDryRunSummary,
    handlePermissionError,
} from './patcher';

let statusBarItem: vscode.StatusBarItem;
let fileWatcher: fs.FSWatcher | undefined;

type PatchState = 'on' | 'off' | 'update-needed';

function getPatchState(mainJsPath: string): PatchState {
    if (!fs.existsSync(mainJsPath)) {
        return 'off';
    }
    if (isPatched(mainJsPath)) {
        return 'on';
    }
    return hasBackups(mainJsPath) ? 'update-needed' : 'off';
}

function updateStatusBar(state: PatchState): void {
    const config = vscode.workspace.getConfiguration('cursorRtl');
    if (!config.get<boolean>('showStatusBar', true)) {
        statusBarItem.hide();
        return;
    }

    switch (state) {
        case 'on':
            statusBarItem.text = '$(check) RTL: ON';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'RTL patch is active. Click for options.';
            break;
        case 'off':
            statusBarItem.text = '$(circle-slash) RTL: OFF';
            statusBarItem.backgroundColor = undefined;
            statusBarItem.tooltip = 'RTL patch is not applied. Click for options.';
            break;
        case 'update-needed':
            statusBarItem.text = '$(warning) RTL: UPDATE NEEDED';
            statusBarItem.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground'
            );
            statusBarItem.tooltip =
                'Cursor was updated and the RTL patch needs to be re-applied. Click for options.';
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

    const dryRun = getDryRunSummary(mainJsPath, context.extensionPath);
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
        applyPatch(mainJsPath);
        copyRtlScript(outDir, context.extensionPath);
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
        copyRtlScript(outDir, context.extensionPath);
        applyPatch(mainJsPath);
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
        vscode.window.showErrorMessage(`Cursor RTL: ${handlePermissionError(err)}`);
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

    if (fs.existsSync(mainJsPath) && (state === 'on' || state === 'update-needed')) {
        setupFileWatcher(mainJsPath, context);
    }

    vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cursorRtl.showStatusBar')) {
            const currentState = getPatchState(mainJsPath);
            updateStatusBar(currentState);
        }
    }, null, context.subscriptions);
}

export function deactivate(): void {
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = undefined;
    }
}
