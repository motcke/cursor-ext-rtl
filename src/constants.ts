// The renderer-injection patch (plan §3.1): a bootstrap block appended to
// preload.js. preload is re-read from disk by the main process on every
// Reload Window (unlike anything served over vscode-file, which Chromium's
// heuristic cache keeps stale for the whole session), so a patch applied
// mid-session activates on the next reload.
//
// The bootstrap runs in the preload's isolated world: it registers a Trusted
// Types policy (a CSP-allowlisted name; the isolated world's policy registry
// is empty, so no collision with the page) and injects a classic <script>
// tag, so rtl.js itself runs in the main world exactly like the old
// executeJavaScript injection did. The ?v= query is the cache-buster that
// makes a new rtl.js version actually load on reload.
//
// FUTURE-BREAKAGE NOTE: the policy name 'amdLoader' must stay in the
// `trusted-types` allowlist of workbench.html's CSP, and Cursor's own
// preload must not start creating a policy with that name in its world.
// If a Cursor update breaks either assumption, the console shows
// "[Cursor RTL] bootstrap failed: ... TrustedScriptURL" (or "Policy
// already exists") and RTL stays off despite the patch being applied.
// Fix: pick another name from the current allowlist in workbench.html and
// update it here (and in scripts/lab/spike.mjs). Details: plan §5.
export function buildBootstrap(rtlVersion: string): string {
    return `
;(function(){/* cursor-rtl-injected v=${rtlVersion} */
    function inject() {
        try {
            var policy = null;
            if (typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy) {
                policy = trustedTypes.createPolicy('amdLoader', { createScriptURL: function (u) { return u; } });
            }
            var s = document.createElement('script');
            var url = '../../../workbench/cursor-rtl.js?v=${rtlVersion}';
            s.src = policy ? policy.createScriptURL(url) : url;
            s.setAttribute('data-cursor-rtl-bootstrap', '${rtlVersion}');
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            console.error('[Cursor RTL] bootstrap failed:', e);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();/* cursor-rtl-end */
`;
}

// Matches a whole installed bootstrap block, for stripping/replacing it.
export const BOOTSTRAP_BLOCK_RE = /\n?;\(function\(\)\{\/\* cursor-rtl-injected[\s\S]*?\/\* cursor-rtl-end \*\/\n?/;

export const PATCH_MARKER = 'cursor-rtl-injected';

// Parses the version out of an installed bootstrap block.
export const BOOTSTRAP_VERSION_RE = /cursor-rtl-injected v=(\d+\.\d+\.\d+)/;

export const RTL_FILENAME = 'cursor-rtl.js';

export const CONFIG_FILENAME = 'cursor-rtl-config.json';

// Key inside product.json's "checksums" map for the file we patch.
export const CHECKSUM_KEY = 'vs/base/parts/sandbox/electron-sandbox/preload.js';

// One backup per Cursor version; the product version is appended to the name.
export const BACKUP_PREFIX = 'preload.js.rtl-backup-';

// Markers of the 1.2.x main-process patch, kept only for migration.
export const LEGACY_MARKER = 'cursor-rtl-loader.cjs';
export const LEGACY_LOADER_FILENAME = 'cursor-rtl-loader.cjs';
export const LEGACY_BACKUP_PREFIX = 'main.js.rtl-backup-';
