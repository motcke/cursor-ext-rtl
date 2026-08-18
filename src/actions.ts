import * as os from 'os';
import { TelemetryClient } from 'applicationinsights';


let _client: TelemetryClient | undefined;
const TELEMETRY_OPTOUT_ENV = [
    'CURSOR_RTL_TELEMETRY_OPTOUT',
    'CURSOR_RTL_DISABLE_TELEMETRY',
];

function isOptOutValue(value: string | undefined): boolean {
    if (!value) return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isTelemetryOptedOut(): boolean {
    return TELEMETRY_OPTOUT_ENV.some((name) => isOptOutValue(process.env[name]));
}

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
    extensionVersion?: string;
    channel?: string;
    machineId?: string;
};

export function init(opts?: InitOptions): void {
    if (_client) return;
    if (isTelemetryOptedOut()) return;
    try {
        const cs = 'InstrumentationKey=e516562a-c892-4da2-837b-fb746bfda335;IngestionEndpoint=https://israelcentral-0.in.applicationinsights.azure.com/;LiveEndpoint=https://israelcentral.livediagnostics.monitor.azure.com/;ApplicationId=37c0836b-66ae-4444-8339-2fbbc80e1a68';
        // Statsbeat must be disabled via env before the client initializes.
        process.env.APPLICATION_INSIGHTS_NO_STATSBEAT = 'true';
        process.env.APPLICATIONINSIGHTS_STATSBEAT_DISABLED = 'true';
        _client = new TelemetryClient(cs);
        // applicationinsights v3 auto-instruments the whole extension-host
        // process (Cursor's own spans, HTTP calls, and uncaught exceptions),
        // which is noise we pay to ingest. Keep only explicit trackEvent/
        // trackException calls; config is applied lazily on first track call.
        _client.config.enableAutoCollectPerformance = false;
        _client.config.enableAutoCollectExceptions = false;
        _client.config.enableAutoCollectDependencies = false;
        _client.config.enableAutoCollectRequests = false;
        _client.config.enableAutoCollectPreAggregatedMetrics = false;
        _client.config.enableAutoCollectHeartbeat = false;
        const extra: Record<string, string> = {};
        if (opts?.clientVersion) extra.clientVersion = opts.clientVersion;
        if (opts?.extensionVersion) extra.extensionVersion = opts.extensionVersion;
        if (opts?.channel) extra.channel = opts.channel;
        if (opts?.machineId) extra.machineId = opts.machineId;
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
