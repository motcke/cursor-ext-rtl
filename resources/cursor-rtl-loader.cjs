(function() {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");

    // Write log file to home directory — definitely writable by any user process
    var LOG_PREFIX = "[Cursor RTL Loader]";
    var homeDir = os.homedir();
    var LOG_FILE = path.join(homeDir, "cursor-rtl.log");

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

    log("pid=" + process.pid, "version=1.2.0");

    // --- require electron (this is the most likely failure point) ---
    var electron;
    try {
        electron = require("electron");
        log("electron required ok. app=" + (electron.app ? "ok" : "undefined") + " BrowserWindow=" + (electron.BrowserWindow ? "ok" : "undefined"));
    } catch(e) {
        log("FATAL: require('electron') failed:", e.message);
        return;
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
                .sort();
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

    function injectIntoWebContents(wc, label) {
        if (!wc || wc.isDestroyed()) { log(label, "wc destroyed, skip"); return; }
        if (wc.__rtlInjected) { log(label, "already injected, skip"); return; }
        wc.__rtlInjected = true;
        try {
            var rtlPath = findRtlScript();
            if (!rtlPath) { log(label, "rtl.js NOT FOUND"); return; }
            var script = fs.readFileSync(rtlPath, "utf-8");
            log(label, "calling executeJavaScript, script length:", script.length);
            wc.executeJavaScript(script)
                .then(function() { log(label, "executeJavaScript OK"); })
                .catch(function(err) {
                    wc.__rtlInjected = false;
                    log(label, "executeJavaScript ERROR:", err && err.message);
                });
        } catch (e) {
            wc.__rtlInjected = false;
            log(label, "inject error:", e.message);
        }
    }

    function setupWindow(win, label) {
        if (!win || !win.webContents) { log(label, "no webContents"); return; }
        var wc = win.webContents;
        var winId = win.id;
        var url = "";
        try { url = wc.getURL ? wc.getURL() : "?"; } catch(e) { url = "err"; }
        log(label, "id=" + winId, "url=" + url, "loading=" + wc.isLoading());
        wc.on("did-finish-load", function() {
            var u = "";
            try { u = wc.getURL ? wc.getURL() : "?"; } catch(e) { u = "err"; }
            log("did-finish-load win=" + winId, "url=" + u);
            injectIntoWebContents(wc, "inject[" + winId + "]");
        });
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

    log("loader setup complete.");
})();
