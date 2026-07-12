import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getMainJsPath, getAppOutDir, getConfigPath } from './paths';
import { isPatched, getLoaderVersion } from './patcher';
import { LOADER_FILENAME, BACKUP_PREFIX } from './constants';
import { isMarketplaceInstall } from './updateChecker';
import { action } from './actions';

const LOG_TAIL_LINES = 15;

interface Finding {
    level: 'ok' | 'warn' | 'error';
    text: string;
    fix?: string;
}

interface DiagnosticsData {
    extensionVersion: string;
    installSource: 'marketplace' | 'vsix';
    clientVersion: string;
    platform: string;
    arch: string;
    mainJsPath: string;
    mainJsExists: boolean;
    patched: boolean;
    backups: string[];
    signatureOk: boolean | null;
    mainJsWritable: boolean | null;
    bundledLoaderVersion: string | null;
    installedLoaderPath: string;
    installedLoaderExists: boolean;
    installedLoaderVersion: string | null;
    logPath: string;
    logExists: boolean;
    logMtime: string | null;
    runningLoaderVersion: string | null;
    logFatalLines: string[];
    logTail: string[];
    configPath: string;
    configRaw: string | null;
    settings: Record<string, string>;
}

function listBackups(mainJsDir: string): string[] {
    try {
        return fs
            .readdirSync(mainJsDir)
            .filter((f) => f.startsWith(BACKUP_PREFIX))
            .sort();
    } catch {
        return [];
    }
}

function readLogInfo(logPath: string): {
    exists: boolean;
    mtime: string | null;
    runningVersion: string | null;
    fatalLines: string[];
    tail: string[];
} {
    try {
        const stat = fs.statSync(logPath);
        const content = fs.readFileSync(logPath, 'utf-8');
        const lines = content.split(/\r?\n/).filter((l) => l.trim() !== '');

        // The loader rewrites the log at every Cursor start and logs its
        // version once, so the last version= entry is the running loader.
        let runningVersion: string | null = null;
        const versionMatches = content.match(/version=(\d+\.\d+\.\d+)/g);
        if (versionMatches && versionMatches.length > 0) {
            runningVersion = versionMatches[versionMatches.length - 1].replace('version=', '');
        }

        return {
            exists: true,
            mtime: stat.mtime.toISOString(),
            runningVersion,
            fatalLines: lines.filter((l) => l.includes('FATAL')),
            tail: lines.slice(-LOG_TAIL_LINES),
        };
    } catch {
        return { exists: false, mtime: null, runningVersion: null, fatalLines: [], tail: [] };
    }
}

function collectData(context: vscode.ExtensionContext): DiagnosticsData {
    const mainJsPath = getMainJsPath();
    const mainJsExists = fs.existsSync(mainJsPath);

    let signatureOk: boolean | null = null;
    if (mainJsExists) {
        try {
            signatureOk = fs
                .readFileSync(mainJsPath, 'utf-8')
                .includes('Copyright (C) Microsoft Corporation');
        } catch {
            signatureOk = null;
        }
    }

    let mainJsWritable: boolean | null = null;
    if (mainJsExists) {
        try {
            fs.accessSync(mainJsPath, fs.constants.W_OK);
            mainJsWritable = true;
        } catch {
            mainJsWritable = false;
        }
    }

    const installedLoaderPath = path.join(getAppOutDir(), LOADER_FILENAME);
    const logPath = path.join(os.homedir(), 'cursor-rtl.log');
    const logInfo = readLogInfo(logPath);

    const configPath = getConfigPath();
    let configRaw: string | null = null;
    try {
        configRaw = fs.readFileSync(configPath, 'utf-8').trim();
    } catch {
        configRaw = null;
    }

    const config = vscode.workspace.getConfiguration('cursorRtl');
    const settingNames = [
        'editorRtl',
        'autoReapply',
        'showStatusBar',
        'checkForExtensionUpdates',
        'updateCheckIntervalHours',
    ];
    const settings: Record<string, string> = {};
    for (const name of settingNames) {
        settings[name] = JSON.stringify(config.get(name));
    }

    const packageVersion = context.extension.packageJSON.version;

    return {
        extensionVersion: typeof packageVersion === 'string' ? packageVersion : 'unknown',
        installSource: isMarketplaceInstall(context.extensionPath) ? 'marketplace' : 'vsix',
        clientVersion: vscode.version,
        platform: process.platform,
        arch: process.arch,
        mainJsPath,
        mainJsExists,
        patched: mainJsExists ? isPatched(mainJsPath) : false,
        backups: mainJsExists ? listBackups(path.dirname(mainJsPath)) : [],
        signatureOk,
        mainJsWritable,
        bundledLoaderVersion: getLoaderVersion(
            path.join(context.extensionPath, 'resources', LOADER_FILENAME)
        ),
        installedLoaderPath,
        installedLoaderExists: fs.existsSync(installedLoaderPath),
        installedLoaderVersion: getLoaderVersion(installedLoaderPath),
        logPath,
        logExists: logInfo.exists,
        logMtime: logInfo.mtime,
        runningLoaderVersion: logInfo.runningVersion,
        logFatalLines: logInfo.fatalLines,
        logTail: logInfo.tail,
        configPath,
        configRaw,
        settings,
    };
}

// Rule-based diagnosis, ordered from "not installed" to "fully healthy" so
// the first findings are always the most fundamental problems.
function diagnose(d: DiagnosticsData): Finding[] {
    const findings: Finding[] = [];

    if (!d.mainJsExists) {
        findings.push({
            level: 'error',
            text: `Cursor's main.js was not found at ${d.mainJsPath}.`,
            fix: 'Cursor may be installed in a non-standard location, or this is not a Cursor window. RTL patching cannot work here.',
        });
        return findings;
    }

    if (!d.patched && d.backups.length === 0) {
        findings.push({
            level: 'warn',
            text: 'The RTL patch has never been applied in this Cursor installation.',
            fix: 'Run "Cursor RTL: Enable RTL Support" and restart Cursor.',
        });
        return findings;
    }

    if (!d.patched && d.backups.length > 0) {
        findings.push({
            level: 'error',
            text: 'A Cursor update overwrote main.js — the RTL patch is no longer applied.',
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update". Tip: enable cursorRtl.autoReapply to do this automatically.',
        });
    }

    if (d.patched && !d.installedLoaderExists) {
        findings.push({
            level: 'error',
            text: `main.js is patched but the loader file is missing (${d.installedLoaderPath}). Cursor logs a load error and RTL stays off.`,
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update" to restore the loader.',
        });
    }

    if (
        d.bundledLoaderVersion &&
        d.installedLoaderExists &&
        d.installedLoaderVersion !== d.bundledLoaderVersion
    ) {
        findings.push({
            level: 'warn',
            text: `The installed loader (${d.installedLoaderVersion ?? 'pre-1.3.0'}) is older than the one bundled with this extension (${d.bundledLoaderVersion}).`,
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update". If it fails with a permission error, run Cursor as Administrator once and retry.',
        });
    }

    if (d.patched && !d.logExists) {
        findings.push({
            level: 'warn',
            text: 'main.js is patched but the loader has not written its log — the patched code has not run yet.',
            fix: 'Close ALL Cursor windows and reopen (a full restart, not just a window reload).',
        });
    }

    if (
        d.logExists &&
        d.runningLoaderVersion &&
        d.installedLoaderVersion &&
        d.runningLoaderVersion !== d.installedLoaderVersion
    ) {
        findings.push({
            level: 'warn',
            text: `Cursor is still running loader ${d.runningLoaderVersion}, but ${d.installedLoaderVersion} is installed on disk.`,
            fix: 'Close ALL Cursor windows and reopen so the updated loader is loaded.',
        });
    }

    for (const line of d.logFatalLines) {
        findings.push({
            level: 'error',
            text: `Loader logged a fatal error: ${line}`,
            fix: 'Share the diagnostics report in a GitHub issue if this persists.',
        });
    }

    if (d.mainJsWritable === false) {
        findings.push({
            level: 'warn',
            text: 'main.js is not writable by the current user.',
            fix:
                process.platform === 'win32'
                    ? 'Future re-applies will need Cursor to run as Administrator.'
                    : 'Future re-applies will need elevated permissions (see README troubleshooting).',
        });
    }

    if (d.signatureOk === false) {
        findings.push({
            level: 'warn',
            text: 'main.js does not contain the expected Microsoft copyright signature.',
            fix: 'This Cursor version may be unsupported; the Enable / Fix command will refuse to patch it.',
        });
    }

    if (findings.length === 0) {
        findings.push({
            level: 'ok',
            text: 'Everything looks healthy: main.js is patched, the loader is current and has run.',
            fix: 'If RTL still does not render, check the log tail below and open a GitHub issue with this report.',
        });
    }

    return findings;
}

function formatReport(d: DiagnosticsData, findings: Finding[]): string {
    const icon = (level: Finding['level']) =>
        level === 'ok' ? '✅' : level === 'warn' ? '⚠️' : '❌';
    const yesNo = (v: boolean | null) => (v === null ? 'unknown' : v ? 'yes' : 'no');

    const lines: string[] = [
        '# Cursor RTL — Diagnostics Report',
        '',
        `_Generated: ${new Date().toISOString()}_`,
        '',
        '> This report contains local file paths (which may include your username).',
        '> Review before sharing.',
        '',
        '## Diagnosis',
        '',
    ];

    for (const f of findings) {
        lines.push(`- ${icon(f.level)} ${f.text}`);
        if (f.fix) {
            lines.push(`  - **Fix:** ${f.fix}`);
        }
    }

    lines.push(
        '',
        '## Versions',
        '',
        `| Item | Value |`,
        `|------|-------|`,
        `| Extension | ${d.extensionVersion} |`,
        `| Install source | ${d.installSource === 'marketplace' ? 'marketplace (updated by Cursor)' : 'manual VSIX (self-updater active)'} |`,
        `| Loader (bundled) | ${d.bundledLoaderVersion ?? 'unknown'} |`,
        `| Loader (installed) | ${d.installedLoaderExists ? d.installedLoaderVersion ?? 'pre-1.3.0 (no marker)' : 'not installed'} |`,
        `| Loader (running) | ${d.runningLoaderVersion ?? 'unknown'} |`,
        `| Cursor (VS Code API) | ${d.clientVersion} |`,
        `| Platform | ${d.platform} ${d.arch} |`,
        '',
        '## Patch state',
        '',
        `- main.js: \`${d.mainJsPath}\``,
        `- main.js exists: ${yesNo(d.mainJsExists)}`,
        `- Patch applied: ${yesNo(d.patched)}`,
        `- Microsoft signature present: ${yesNo(d.signatureOk)}`,
        `- main.js writable: ${yesNo(d.mainJsWritable)}`,
        `- Backups: ${d.backups.length}${d.backups.length > 0 ? ` (latest: \`${d.backups[d.backups.length - 1]}\`)` : ''}`,
        `- Loader file: \`${d.installedLoaderPath}\` (exists: ${yesNo(d.installedLoaderExists)})`,
        '',
        '## Runtime config',
        '',
        `- Config file: \`${d.configPath}\``,
        `- Contents: ${d.configRaw ? `\`${d.configRaw}\`` : 'missing (loader defaults to editorRtl: auto)'}`,
        '',
        '## Settings',
        ''
    );

    for (const [name, value] of Object.entries(d.settings)) {
        lines.push(`- \`cursorRtl.${name}\`: ${value}`);
    }

    lines.push('', '## Loader log', '', `- Path: \`${d.logPath}\``);
    if (d.logExists) {
        lines.push(`- Last modified: ${d.logMtime}`, '', '```', ...d.logTail, '```');
    } else {
        lines.push('- Log file not found (the loader has not run).');
    }

    lines.push('');
    return lines.join('\n');
}

export async function runDiagnostics(context: vscode.ExtensionContext): Promise<void> {
    const data = collectData(context);
    const findings = diagnose(data);
    const report = formatReport(data, findings);

    const worst = findings.some((f) => f.level === 'error')
        ? 'error'
        : findings.some((f) => f.level === 'warn')
            ? 'warn'
            : 'ok';
    action('diagnostics_run', { result: worst, findings: String(findings.length) });

    const doc = await vscode.workspace.openTextDocument({
        content: report,
        language: 'markdown',
    });
    await vscode.window.showTextDocument(doc, { preview: false });

    const copy = await vscode.window.showInformationMessage(
        'Cursor RTL: Diagnostics report ready.',
        'Copy to Clipboard'
    );
    if (copy === 'Copy to Clipboard') {
        await vscode.env.clipboard.writeText(report);
    }
}
