import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const GITHUB_REPO = 'motcke/cursor-ext-rtl';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

interface GitHubAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name: string;
    html_url: string;
    assets: GitHubAsset[];
}

export type UpdateCheckResult =
    | {
        status: 'updateAvailable';
        currentVersion: string;
        remoteVersion: string;
        releaseUrl: string;
        vsixDownloadUrl?: string;
    }
    | {
        status: 'upToDate';
        currentVersion: string;
        remoteVersion?: string;
        releaseUrl?: string;
    }
    | {
        status: 'failed';
        currentVersion: string;
        error: string;
    };

function parseVersion(tag: string): number[] {
    return tag
        .replace(/^v/i, '')
        .split('.')
        .map((part) => {
            const match = part.match(/^\d+/);
            return match ? Number(match[0]) : 0;
        });
}

export function isNewer(remote: string, local: string): boolean {
    const r = parseVersion(remote);
    const l = parseVersion(local);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] ?? 0;
        const lv = l[i] ?? 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
    }
    return false;
}

function fetchLatestRelease(): Promise<GitHubRelease> {
    return new Promise((resolve, reject) => {
        const req = https.get(
            RELEASES_URL,
            { headers: { 'User-Agent': 'cursor-rtl-extension' } },
            (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    const location = res.headers.location;
                    if (!location) {
                        reject(new Error('Redirect with no location'));
                        return;
                    }
                    https.get(
                        location,
                        { headers: { 'User-Agent': 'cursor-rtl-extension' } },
                        (redirectRes) => collectResponse(redirectRes, resolve, reject)
                    ).on('error', reject);
                    return;
                }

                collectResponse(res, resolve, reject);
            }
        );
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });
    });
}

function collectResponse(
    res: import('http').IncomingMessage,
    resolve: (value: GitHubRelease) => void,
    reject: (reason: Error) => void
): void {
    if (res.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${res.statusCode}`));
        return;
    }
    let data = '';
    res.on('data', (chunk: string) => (data += chunk));
    res.on('end', () => {
        try {
            resolve(JSON.parse(data) as GitHubRelease);
        } catch {
            reject(new Error('Failed to parse GitHub response'));
        }
    });
    res.on('error', reject);
}

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_REDIRECTS = 5;

// Downloads a release asset to destPath. GitHub asset URLs redirect to a CDN,
// so redirects are followed (up to MAX_DOWNLOAD_REDIRECTS).
export function downloadFile(
    url: string,
    destPath: string,
    redirectsLeft: number = MAX_DOWNLOAD_REDIRECTS
): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'cursor-rtl-extension',
                    Accept: 'application/octet-stream',
                },
            },
            (res) => {
                const status = res.statusCode ?? 0;

                if ([301, 302, 303, 307, 308].includes(status)) {
                    res.resume();
                    const location = res.headers.location;
                    if (!location || redirectsLeft <= 0) {
                        reject(new Error('Too many redirects while downloading VSIX'));
                        return;
                    }
                    downloadFile(location, destPath, redirectsLeft - 1).then(resolve, reject);
                    return;
                }

                if (status !== 200) {
                    res.resume();
                    reject(new Error(`Download failed with HTTP ${status}`));
                    return;
                }

                const file = fs.createWriteStream(destPath);
                const fail = (err: Error) => {
                    file.destroy();
                    fs.unlink(destPath, () => reject(err));
                };
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve()));
                file.on('error', fail);
                res.on('error', fail);
            }
        );
        req.on('error', reject);
        req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
            req.destroy();
            reject(new Error('Download timed out'));
        });
    });
}

interface ExtensionsJsonEntry {
    relativeLocation?: string;
    location?: { path?: string };
    metadata?: { source?: string; pinned?: boolean };
}

// Reads the install source from extensions.json, the file Cursor keeps next
// to the installed extension dirs — its metadata.source ('gallery' | 'vsix')
// is the ground truth: current Cursor no longer stamps gallery identifiers
// into the installed package.json's __metadata, and even VSIX installs get
// gallery-resolved id/publisherId in extensions.json, so neither presence
// test works anymore. pinned counts too: a pinned install (every VSIX
// install, or a user-pinned version) is excluded from Cursor's auto-updates,
// so for our purposes it is not a marketplace install even with a gallery
// source. Returns undefined when extensions.json is missing, unmatched, or
// predates the source field (older Cursor) — the caller then falls back.
function marketplacePerExtensionsJson(extensionPath: string): boolean | undefined {
    try {
        const raw = fs.readFileSync(
            path.join(path.dirname(extensionPath), 'extensions.json'),
            'utf-8'
        );
        const entries = JSON.parse(raw) as ExtensionsJsonEntry[];
        if (!Array.isArray(entries)) return undefined;
        const dirName = path.basename(extensionPath).toLowerCase();
        const entry = entries.find((e) => {
            const rel = e.relativeLocation ?? e.location?.path?.split('/').pop();
            return rel?.toLowerCase() === dirName;
        });
        const source = entry?.metadata?.source;
        if (typeof source !== 'string') return undefined;
        return source === 'gallery' && entry?.metadata?.pinned !== true;
    } catch {
        return undefined;
    }
}

// Marketplace installs are auto-updated by Cursor itself, so our GitHub-based
// checker stands down for them. extensions.json decides (see above); the
// installed package.json's __metadata — where installs made by older Cursor
// versions carry gallery id/publisherId — is only the fallback. Unknown/parse
// failure counts as a VSIX install — the safe default is to keep checking.
export function isMarketplaceInstall(extensionPath: string): boolean {
    const perExtensionsJson = marketplacePerExtensionsJson(extensionPath);
    if (perExtensionsJson !== undefined) {
        return perExtensionsJson;
    }
    try {
        const raw = fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf-8');
        const metadata = (JSON.parse(raw) as {
            __metadata?: { source?: string; id?: string; publisherId?: string };
        }).__metadata;
        return (
            !!metadata &&
            (metadata.source === 'gallery' || !!metadata.id || !!metadata.publisherId)
        );
    } catch {
        return false;
    }
}

export async function checkForExtensionUpdate(currentVersion: string): Promise<UpdateCheckResult> {
    let release: GitHubRelease;
    try {
        release = await fetchLatestRelease();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            status: 'failed',
            currentVersion,
            error: message,
        };
    }

    if (!release.tag_name || !isNewer(release.tag_name, currentVersion)) {
        return {
            status: 'upToDate',
            currentVersion,
            remoteVersion: release.tag_name?.replace(/^v/i, ''),
            releaseUrl: release.html_url || RELEASES_LATEST_URL,
        };
    }

    const vsixAsset = release.assets.find((a) => a.name.endsWith('.vsix'));
    const remoteVersion = release.tag_name.replace(/^v/i, '');

    return {
        status: 'updateAvailable',
        currentVersion,
        remoteVersion,
        releaseUrl: release.html_url || RELEASES_LATEST_URL,
        vsixDownloadUrl: vsixAsset?.browser_download_url,
    };
}
