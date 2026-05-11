import * as https from 'https';

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

function isNewer(remote: string, local: string): boolean {
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
