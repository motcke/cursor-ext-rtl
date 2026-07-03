(function() {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");

    // Write log file to home directory — definitely writable by any user process
    var LOG_PREFIX = "[Cursor RTL Loader]";
    var homeDir = os.homedir();
    var LOG_FILE = path.join(homeDir, "cursor-rtl.log");
    var CONFIG_FILE = path.join(homeDir, ".cursor-rtl-config.json");
    // Machine-readable version marker. The extension compares this string
    // between its bundled loader and the copy installed next to main.js to
    // detect when the installed loader is stale and a Re-apply is needed.
    // Keep the exact `var LOADER_VERSION = "x.y.z"` form — it is parsed by regex.
    var LOADER_VERSION = "1.3.1";

    function readConfig() {
        try {
            var raw = fs.readFileSync(CONFIG_FILE, "utf-8");
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") return parsed;
        } catch (e) {}
        return { editorRtl: "auto" };
    }

    function log() {
        var args = Array.prototype.slice.call(arguments);
        var line = new Date().toISOString() + " " + args.join(" ") + "\n";
        try { fs.appendFileSync(LOG_FILE, line); } catch(e) {}
        console.warn.apply(console, [LOG_PREFIX].concat(args));
    }

    try {
        fs.writeFileSync(LOG_FILE, "=== cursor-rtl-loader started at " + new Date().toISOString() + " ===\nhome=" + homeDir + "\n");
    } catch(initErr) {
        console.warn(LOG_PREFIX, "FATAL: cannot write log to", LOG_FILE, initErr.message);
    }

    log("pid=" + process.pid, "version=" + LOADER_VERSION);

    // --- require electron (this is the most likely failure point) ---
    var electron;
    try {
        electron = require("electron");
        log("electron required ok. app=" + (electron.app ? "ok" : "undefined") + " BrowserWindow=" + (electron.BrowserWindow ? "ok" : "undefined"));
    } catch(e) {
        log("FATAL: require('electron') failed:", e.message);
        return;
    }

    // Extension dirs must be compared by semver, not lexicographically:
    // "1.1.10" sorts before "1.1.9" as a string but is the newer version.
    function parseExtensionVersion(dirName) {
        var m = dirName.match(/^motcke\.cursor-rtl-(\d+)\.(\d+)\.(\d+)/);
        if (!m) return [0, 0, 0];
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    function compareExtensionDirs(a, b) {
        var va = parseExtensionVersion(a);
        var vb = parseExtensionVersion(b);
        for (var i = 0; i < 3; i++) {
            if (va[i] !== vb[i]) return va[i] - vb[i];
        }
        return 0;
    }

    function findRtlScript() {
        var args = process.argv;
        var extDir = "";
        for (var i = 0; i < args.length; i++) {
            if (args[i] === "--extensions-dir" && args[i + 1]) { extDir = args[i + 1]; break; }
            if (typeof args[i].startsWith === "function" && args[i].startsWith("--extensions-dir=")) {
                extDir = args[i].slice("--extensions-dir=".length);
                break;
            }
        }
        if (!extDir) extDir = path.join(os.homedir(), ".cursor", "extensions");
        log("extensions dir:", extDir);
        try {
            var entries = fs.readdirSync(extDir);
            var dirs = entries
                .filter(function(d) { return /^motcke\.cursor-rtl-\d/.test(d); })
                .sort(compareExtensionDirs);
            log("cursor-rtl dirs found:", JSON.stringify(dirs));
            if (dirs.length > 0) {
                var rtlPath = path.join(extDir, dirs[dirs.length - 1], "resources", "rtl.js");
                var exists = fs.existsSync(rtlPath);
                log("rtl.js path:", rtlPath, "exists:", exists);
                if (exists) return rtlPath;
                return "";
            }
        } catch (e) {
            log("findRtlScript error:", e.message);
        }
        return "";
    }

    function isWorkbenchUrl(url) {
        return typeof url === "string" && url.indexOf("workbench.html") !== -1;
    }

    function isRtlRuntimeAlive(wc) {
        return wc.executeJavaScript('typeof window.__cursorRtlScanAll === "function"');
    }

    function runRtlScript(wc, label, currentUrl) {
        var rtlPath = findRtlScript();
        if (!rtlPath) {
            log(label, "rtl.js NOT FOUND");
            wc.__rtlInjecting = false;
            return;
        }
        var script = fs.readFileSync(rtlPath, "utf-8");
        var cfg = readConfig();
        var configScript = "window.__cursorRtlConfig = " + JSON.stringify(cfg) + ";\n";
        log(label, "calling executeJavaScript, script length:", script.length, "editorRtl:", cfg.editorRtl);
        wc.executeJavaScript(configScript + script)
            .then(function() { return isRtlRuntimeAlive(wc); })
            .then(function(alive) {
                wc.__rtlInjecting = false;
                if (alive) {
                    wc.__rtlInjectedUrl = currentUrl;
                    log(label, "executeJavaScript OK, runtime verified");
                } else {
                    wc.__rtlInjectedUrl = "";
                    log(label, "executeJavaScript finished but runtime not verified");
                }
            })
            .catch(function(err) {
                wc.__rtlInjecting = false;
                wc.__rtlInjectedUrl = "";
                log(label, "executeJavaScript ERROR:", err && err.message);
            });
    }

    function injectIntoWebContents(wc, label) {
        if (!wc || wc.isDestroyed()) { log(label, "wc destroyed, skip"); return; }
        if (wc.__rtlInjecting) { log(label, "injection in flight, skip"); return; }
        var currentUrl = "";
        try { currentUrl = wc.getURL ? wc.getURL() : ""; } catch(e) { currentUrl = ""; }
        if (!isWorkbenchUrl(currentUrl)) {
            log(label, "not workbench yet, skip url=" + currentUrl);
            return;
        }
        if (wc.__rtlInjectedUrl === currentUrl) {
            isRtlRuntimeAlive(wc)
                .then(function(alive) {
                    if (alive) {
                        log(label, "runtime already active for url, skip");
                        return;
                    }
                    log(label, "injection flag set but runtime missing, re-injecting");
                    wc.__rtlInjectedUrl = "";
                    injectIntoWebContents(wc, label + "-revive");
                })
                .catch(function() {
                    wc.__rtlInjectedUrl = "";
                    injectIntoWebContents(wc, label + "-revive");
                });
            return;
        }
        wc.__rtlInjecting = true;
        try {
            runRtlScript(wc, label, currentUrl);
        } catch (e) {
            wc.__rtlInjecting = false;
            wc.__rtlInjectedUrl = "";
            log(label, "inject error:", e.message);
        }
    }

    function scheduleInjectFallback(wc, winId) {
        var delays = [250, 1000];
        for (var i = 0; i < delays.length; i++) {
            (function(delay) {
                setTimeout(function() {
                    if (!wc || wc.isDestroyed()) return;
                    var url = "";
                    try { url = wc.getURL ? wc.getURL() : ""; } catch(e) { url = ""; }
                    if (!isWorkbenchUrl(url)) return;
                    isRtlRuntimeAlive(wc)
                        .then(function(alive) {
                            if (!alive) {
                                injectIntoWebContents(wc, "inject-fallback[" + winId + "@" + delay + "ms]");
                            }
                        })
                        .catch(function() {
                            injectIntoWebContents(wc, "inject-fallback[" + winId + "@" + delay + "ms]");
                        });
                }, delay);
            })(delays[i]);
        }
    }

    function setupWindow(win, label) {
        if (!win || !win.webContents) { log(label, "no webContents"); return; }
        var wc = win.webContents;
        var winId = win.id;
        var url = "";
        try { url = wc.getURL ? wc.getURL() : "?"; } catch(e) { url = "err"; }
        log(label, "id=" + winId, "url=" + url, "loading=" + wc.isLoading());
        wc.on("did-start-loading", function() {
            wc.__rtlInjectedUrl = "";
            log("did-start-loading win=" + winId, "cleared injection flag");
        });
        wc.on("did-finish-load", function() {
            var u = "";
            try { u = wc.getURL ? wc.getURL() : "?"; } catch(e) { u = "err"; }
            log("did-finish-load win=" + winId, "url=" + u);
            injectIntoWebContents(wc, "inject[" + winId + "]");
        });
        scheduleInjectFallback(wc, winId);
        if (!wc.isLoading() && !wc.isDestroyed()) {
            injectIntoWebContents(wc, "inject-now[" + winId + "]");
        }
    }

    try {
        electron.app.on("browser-window-created", function(ev, win) {
            log("browser-window-created id=" + win.id);
            setupWindow(win, "setup[" + win.id + "]");
        });
        log("browser-window-created listener registered");
    } catch(e) {
        log("FATAL: app.on failed:", e.message);
        return;
    }

    try {
        var existing = electron.BrowserWindow.getAllWindows();
        log("existing windows at loader start:", existing.length);
        for (var i = 0; i < existing.length; i++) {
            setupWindow(existing[i], "existing[" + existing[i].id + "]");
        }
    } catch (e) {
        log("getAllWindows error:", e.message);
    }

    // Live-push editor RTL mode changes to open workbench windows so toggling
    // the setting/quick-pick applies without a reload.
    function pushEditorMode(mode) {
        try {
            var wins = electron.BrowserWindow.getAllWindows();
            for (var i = 0; i < wins.length; i++) {
                (function(win) {
                    try {
                        var wc = win.webContents;
                        if (!wc || wc.isDestroyed()) return;
                        var url = wc.getURL ? wc.getURL() : "";
                        if (!isWorkbenchUrl(url)) return;
                        wc.executeJavaScript(
                            "window.__cursorRtlSetEditorMode && window.__cursorRtlSetEditorMode(" +
                            JSON.stringify(mode) + ")"
                        ).catch(function() {});
                    } catch (e) {}
                })(wins[i]);
            }
        } catch (e) {
            log("pushEditorMode error:", e.message);
        }
    }

    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({ editorRtl: "auto" }));
        }
        var configWatchTimer = null;
        fs.watch(CONFIG_FILE, function() {
            if (configWatchTimer) return;
            configWatchTimer = setTimeout(function() {
                configWatchTimer = null;
                var cfg = readConfig();
                log("config changed, pushing editorRtl:", cfg.editorRtl);
                pushEditorMode(cfg.editorRtl || "auto");
            }, 150);
        });
        log("watching config file:", CONFIG_FILE);
    } catch (e) {
        log("config watch not active:", e.message);
    }

    log("loader setup complete.");
})();
