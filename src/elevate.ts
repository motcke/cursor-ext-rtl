import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getPreloadJsPath, getRtlDir, getProductJsonPath } from './paths';

export type ElevationResult = 'granted' | 'cancelled' | 'failed' | 'unsupported';

// Marker exit code the outer powershell uses when Start-Process -Verb RunAs
// throws, i.e. the user dismissed the UAC prompt.
const UAC_CANCELLED_EXIT = 223;

export function isPermissionError(err: unknown): boolean {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === 'EPERM' || code === 'EACCES';
}

// True when every path the extension writes is writable as-is. openSync('r+')
// consults the real ACLs, unlike fs.accessSync on Windows.
export function verifyWriteAccess(): boolean {
    try {
        for (const f of [getPreloadJsPath(), getProductJsonPath()]) {
            fs.closeSync(fs.openSync(f, 'r+'));
        }
        const probe = path.join(getRtlDir(), `.rtl-write-probe-${process.pid}`);
        fs.writeFileSync(probe, '');
        fs.unlinkSync(probe);
        return true;
    } catch {
        return false;
    }
}

function psQuote(s: string): string {
    return `'${s.replace(/'/g, "''")}'`;
}

// One elevated run — a single UAC prompt — that grants the current user
// Modify on the few paths the extension writes, with inheritance, so every
// later operation (enable, disable, the automatic re-patch after a Cursor
// update, script refresh, the uninstall hook) runs unelevated like on a
// per-user install. Only icacls runs elevated; no patch logic does.
//
// The principal is resolved here, in the unelevated process: under
// over-the-shoulder UAC the elevated shell belongs to the admin account,
// not to the user who needs the grant.
export async function grantWriteAccess(): Promise<ElevationResult> {
    if (process.platform !== 'win32') {
        return 'unsupported';
    }
    if (!process.env.USERNAME) {
        return 'failed';
    }
    const principal = `${process.env.USERDOMAIN ?? '.'}\\${process.env.USERNAME}`;

    const preloadDir = path.dirname(getPreloadJsPath());
    const rtlDir = getRtlDir();
    const productJson = getProductJsonPath();
    const appDir = path.dirname(productJson);

    // (OI)(CI) makes files the Cursor updater re-creates inside these dirs
    // inherit the grant. (NP) on resources\app keeps it to immediate
    // children — product.json survives replacement, the rest of the tree
    // stays admin-only.
    const grants: Array<[string, string]> = [
        [preloadDir, `${principal}:(OI)(CI)M`],
        [rtlDir, `${principal}:(OI)(CI)M`],
        [productJson, `${principal}:M`],
        [appDir, `${principal}:(OI)(CI)(NP)M`],
    ];

    const inner = grants
        .map(
            ([p, grant]) =>
                `& icacls ${psQuote(p)} /grant ${psQuote(grant)} | Out-Null\r\n` +
                `if ($LASTEXITCODE -ne 0) { exit 1 }`
        )
        .join('\r\n')
        .concat('\r\nexit 0\r\n');

    const scriptPath = path.join(os.tmpdir(), `cursor-rtl-grant-${process.pid}.ps1`);
    fs.writeFileSync(scriptPath, inner, 'utf-8');

    const outer =
        `try { ` +
        `$p = Start-Process -FilePath 'powershell.exe' -ArgumentList ` +
        `'-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',${psQuote(scriptPath)} ` +
        `-Verb RunAs -Wait -PassThru; exit $p.ExitCode ` +
        `} catch { exit ${UAC_CANCELLED_EXIT} }`;

    const exitCode = await new Promise<number | null>((resolve) => {
        const child = spawn(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-Command', outer],
            { windowsHide: true, stdio: 'ignore' }
        );
        child.on('error', () => resolve(null));
        child.on('close', (code) => resolve(code));
    });

    try {
        fs.unlinkSync(scriptPath);
    } catch {
        // best-effort
    }

    if (exitCode === UAC_CANCELLED_EXIT) {
        return 'cancelled';
    }
    return verifyWriteAccess() ? 'granted' : 'failed';
}
