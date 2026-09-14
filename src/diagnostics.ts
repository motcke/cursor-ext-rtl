import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    getPreloadJsPath,
    getPreloadAuxJsPath,
    getProductJsonPath,
    getConfigPath,
    getMainJsPath,
    getRtlScriptDestPath,
} from './paths';
import {
    isPatched,
    getRtlScriptVersion,
    sha256Base64NoPad,
    isLegacyPatched,
} from './patcher';
import { CHECKSUM_KEY, LEGACY_LOADER_FILENAME } from './constants';
import { isMarketplaceInstall } from './updateChecker';
import { action } from './actions';

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
    preloadJsPath: string;
    preloadJsExists: boolean;
    patched: boolean;
    preloadJsWritable: boolean | null;
    backups: string[];
    preloadAuxJsPath: string;
    preloadAuxJsExists: boolean;
    auxPatched: boolean;
    productJsonPath: string;
    checksumInProduct: string | null;
    checksumActual: string | null;
    bundledRtlVersion: string | null;
    installedRtlPath: string;
    installedRtlExists: boolean;
    installedRtlVersion: string | null;
    configPath: string;
    configRaw: string | null;
    legacyMainPatched: boolean;
    legacyLoaderExists: boolean;
    settings: Record<string, string>;
}

function listBackupsForFile(dir: string, basename: string): string[] {
    const prefix = basename + '.rtl-backup-';
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(prefix))
            .sort();
    } catch {
        return [];
    }
}

function collectData(context: vscode.ExtensionContext): DiagnosticsData {
    const preloadJsPath = getPreloadJsPath();
    const preloadJsExists = fs.existsSync(preloadJsPath);
    const preloadAuxJsPath = getPreloadAuxJsPath();
    const preloadAuxJsExists = fs.existsSync(preloadAuxJsPath);

    let preloadJsWritable: boolean | null = null;
    if (preloadJsExists) {
        try {
            fs.accessSync(preloadJsPath, fs.constants.W_OK);
            preloadJsWritable = true;
        } catch {
            preloadJsWritable = false;
        }
    }

    const productJsonPath = getProductJsonPath();
    let checksumInProduct: string | null = null;
    try {
        const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf-8'));
        checksumInProduct = product.checksums?.[CHECKSUM_KEY] ?? null;
    } catch {
        checksumInProduct = null;
    }

    let checksumActual: string | null = null;
    if (preloadJsExists) {
        try {
            checksumActual = sha256Base64NoPad(preloadJsPath);
        } catch {
            checksumActual = null;
        }
    }

    const configPath = getConfigPath();
    let configRaw: string | null = null;
    try {
        configRaw = fs.readFileSync(configPath, 'utf-8').trim();
    } catch {
        configRaw = null;
    }

    const mainJsPath = getMainJsPath();
    const installedRtlPath = getRtlScriptDestPath();

    const config = vscode.workspace.getConfiguration('cursorRtl');
    const settingNames = [
        'editorRtl',
        'markdownPreview',
        'autoReloadAfterPatch',
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
        preloadJsPath,
        preloadJsExists,
        patched: preloadJsExists ? isPatched(preloadJsPath) : false,
        preloadJsWritable,
        backups: preloadJsExists ? listBackupsForFile(path.dirname(preloadJsPath), 'preload.js') : [],
        preloadAuxJsPath,
        preloadAuxJsExists,
        auxPatched: preloadAuxJsExists ? isPatched(preloadAuxJsPath) : false,
        productJsonPath,
        checksumInProduct,
        checksumActual,
        bundledRtlVersion: getRtlScriptVersion(
            path.join(context.extensionPath, 'resources', 'rtl.js')
        ),
        installedRtlPath,
        installedRtlExists: fs.existsSync(installedRtlPath),
        installedRtlVersion: getRtlScriptVersion(installedRtlPath),
        configPath,
        configRaw,
        legacyMainPatched: fs.existsSync(mainJsPath) ? isLegacyPatched(mainJsPath) : false,
        legacyLoaderExists: fs.existsSync(path.join(path.dirname(mainJsPath), LEGACY_LOADER_FILENAME)),
        settings,
    };
}

// Rule-based diagnosis, ordered from "not installed" to "fully healthy" so
// the first findings are always the most fundamental problems.
function diagnose(d: DiagnosticsData): Finding[] {
    const findings: Finding[] = [];

    if (!d.preloadJsExists) {
        findings.push({
            level: 'error',
            text: `Cursor's preload.js was not found at ${d.preloadJsPath}.`,
            fix: 'Cursor may be installed in a non-standard location, or this is not a Cursor window. RTL patching cannot work here.',
        });
        return findings;
    }

    if (!d.patched) {
        findings.push({
            level: 'warn',
            text: 'The RTL patch is not applied to preload.js.',
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update". After a Cursor update this normally happens automatically on startup.',
        });
    }

    if (d.patched && d.preloadAuxJsExists && !d.auxPatched) {
        findings.push({
            level: 'warn',
            text: 'preload.js is patched but preload-aux.js (Agents window) is not — RTL will not work in the Agents window.',
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update" to apply the patch to both files.',
        });
    }

    if (d.patched && !d.installedRtlExists) {
        findings.push({
            level: 'error',
            text: `preload.js is patched but the RTL script is missing (${d.installedRtlPath}). The import fails and RTL stays off.`,
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update" to restore it.',
        });
    }

    if (
        d.bundledRtlVersion &&
        d.installedRtlExists &&
        d.installedRtlVersion !== d.bundledRtlVersion
    ) {
        findings.push({
            level: 'warn',
            text: `The installed RTL script (${d.installedRtlVersion ?? 'unversioned'}) differs from the one bundled with this extension (${d.bundledRtlVersion}).`,
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update", then reload the window.',
        });
    }

    if (
        d.patched &&
        d.checksumInProduct !== null &&
        d.checksumActual !== null &&
        d.checksumInProduct !== d.checksumActual
    ) {
        findings.push({
            level: 'warn',
            text: 'The preload.js checksum in product.json does not match the file on disk — Cursor may warn that the installation is corrupt.',
            fix: 'Run "Cursor RTL: Enable RTL / Fix After Update" to rewrite the checksum. The warning itself is safe to ignore.',
        });
    }

    if (d.preloadJsWritable === false) {
        findings.push({
            level: 'warn',
            text: 'preload.js is not writable by the current user.',
            fix:
                process.platform === 'win32'
                    ? 'Future re-applies will need Cursor to run as Administrator.'
                    : 'Future re-applies will need elevated permissions (see README troubleshooting).',
        });
    }

    if (d.legacyMainPatched || d.legacyLoaderExists) {
        findings.push({
            level: 'warn',
            text: 'Leftovers of the old (pre-1.3.0) main.js patch are still present.',
            fix: 'They are harmless and normally removed automatically on startup. If they persist, run Cursor as Administrator once.',
        });
    }

    if (findings.length === 0) {
        findings.push({
            level: 'ok',
            text: 'Everything looks healthy: preload.js is patched, preload-aux.js (Agents window) is patched, the RTL script is current, and the checksum matches.',
            fix: 'If RTL still does not render, reload the window; if that does not help, open a GitHub issue with this report.',
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
        `| RTL script (bundled) | ${d.bundledRtlVersion ?? 'unknown'} |`,
        `| RTL script (installed) | ${d.installedRtlExists ? d.installedRtlVersion ?? 'unversioned' : 'not installed'} |`,
        `| Cursor (VS Code API) | ${d.clientVersion} |`,
        `| Platform | ${d.platform} ${d.arch} |`,
        '',
        '## Patch state',
        '',
        `- preload.js: \`${d.preloadJsPath}\``,
        `- preload.js exists: ${yesNo(d.preloadJsExists)}`,
        `- Patch applied (IDE windows): ${yesNo(d.patched)}`,
        `- preload.js writable: ${yesNo(d.preloadJsWritable)}`,
        `- Backups: ${d.backups.length}${d.backups.length > 0 ? ` (${d.backups.join(', ')})` : ''}`,
        `- preload-aux.js: \`${d.preloadAuxJsPath}\``,
        `- preload-aux.js exists: ${yesNo(d.preloadAuxJsExists)}`,
        `- Patch applied (Agents window): ${yesNo(d.auxPatched)}`,
        `- RTL script: \`${d.installedRtlPath}\` (exists: ${yesNo(d.installedRtlExists)})`,
        '',
        '## Integrity checksum',
        '',
        `- product.json: \`${d.productJsonPath}\``,
        `- Checksum in product.json: \`${d.checksumInProduct ?? 'missing'}\``,
        `- Checksum of preload.js on disk: \`${d.checksumActual ?? 'unknown'}\``,
        `- Match: ${yesNo(d.checksumInProduct !== null && d.checksumActual !== null ? d.checksumInProduct === d.checksumActual : null)}`,
        '',
        '## Runtime config',
        '',
        `- Config file: \`${d.configPath}\``,
        `- Contents: ${d.configRaw ? `\`${d.configRaw}\`` : 'missing (rtl.js defaults to editorRtl: auto)'}`,
        '',
        '## Legacy (pre-1.3.0) leftovers',
        '',
        `- main.js still patched: ${yesNo(d.legacyMainPatched)}`,
        `- Old loader file present: ${yesNo(d.legacyLoaderExists)}`,
        '',
        '## Settings',
        ''
    );

    for (const [name, value] of Object.entries(d.settings)) {
        lines.push(`- \`cursorRtl.${name}\`: ${value}`);
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
