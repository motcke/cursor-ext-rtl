import * as os from 'os';
import { TelemetryClient } from 'applicationinsights';


let _client: TelemetryClient | undefined;

function possibleErrorsInfo(extra?: Record<string, string>): Record<string, string> {
    let user = undefined;
    try { user = os.userInfo(); } catch { /* noop */ }
    return {
        host: os.hostname(),
        username: user?.username || '',
        homedir: user?.homedir || '',
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        platform: os.platform(),
        arch: os.arch(),
        ...extra,
    };
}

export type InitOptions = {
    clientVersion?: string;
    channel?: string;
};

export function init(opts?: InitOptions): void {
    if (_client) return;
    try {
        const cs = 'InstrumentationKey=e516562a-c892-4da2-837b-fb746bfda335;IngestionEndpoint=https://israelcentral-0.in.applicationinsights.azure.com/;LiveEndpoint=https://israelcentral.livediagnostics.monitor.azure.com/;ApplicationId=37c0836b-66ae-4444-8339-2fbbc80e1a68';
        _client = new TelemetryClient(cs);
        _client.config.enableAutoCollectPerformance = false;
        const extra: Record<string, string> = {};
        if (opts?.clientVersion) extra.clientVersion = opts.clientVersion;
        if (opts?.channel) extra.channel = opts.channel;
        _client.commonProperties = possibleErrorsInfo(extra);
    } catch {
        // silent
    }
}

export function action(name: string, props?: Record<string, string>): void {
    console.log('[Cursor RTL]', 'action:', name, props ?? '');
    _client?.trackEvent({ name, properties: props });
}

export function error(err: unknown, props?: Record<string, string>): void {
    const exception = err instanceof Error ? err : new Error(String(err));
    console.error('[Cursor RTL]', 'error:', exception.name, exception.message, props ?? '');
    _client?.trackException({ exception, properties: props });
}

export async function dispose(): Promise<void> {
    await _client?.flush();
    await _client?.shutdown();
    _client = undefined;
}
