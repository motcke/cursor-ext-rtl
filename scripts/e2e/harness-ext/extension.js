// e2e command bridge (never packaged): the suite writes a request into
// C:\cursor-rtl-lab\e2e-cmd.json and this extension executes it with
// vscode.commands.executeCommand, reporting into e2e-res.json. Keyboard-driven
// automation through CDP proved flaky in reloaded dev-host windows; command
// execution through the extension host is deterministic.
const vscode = require('vscode');
const fs = require('fs');

const CMD_FILE = 'C:\\cursor-rtl-lab\\e2e-cmd.json';
const RES_FILE = 'C:\\cursor-rtl-lab\\e2e-res.json';

let timer;

function reviveArg(arg) {
    if (arg && typeof arg === 'object' && typeof arg.__uri === 'string') {
        return vscode.Uri.file(arg.__uri);
    }
    return arg;
}

exports.activate = function () {
    const claimFile = CMD_FILE + '.' + process.pid;
    timer = setInterval(async () => {
        // Atomic claim: in multi-window sessions every extension host polls
        // this file; rename succeeds for exactly one of them.
        try {
            fs.renameSync(CMD_FILE, claimFile);
        } catch {
            return; // no pending request, or another window claimed it
        }
        let req;
        try {
            req = JSON.parse(fs.readFileSync(claimFile, 'utf-8'));
        } catch {
            return;
        } finally {
            try {
                fs.rmSync(claimFile, { force: true });
            } catch {
                // best-effort
            }
        }
        try {
            const result = await vscode.commands.executeCommand(
                req.command,
                ...(req.args ?? []).map(reviveArg)
            );
            fs.writeFileSync(RES_FILE, JSON.stringify({
                id: req.id,
                ok: true,
                result: typeof result === 'string' || typeof result === 'number' ? result : null,
            }));
        } catch (err) {
            fs.writeFileSync(RES_FILE, JSON.stringify({ id: req.id, ok: false, error: String(err) }));
        }
    }, 300);
};

exports.deactivate = function () {
    clearInterval(timer);
};
