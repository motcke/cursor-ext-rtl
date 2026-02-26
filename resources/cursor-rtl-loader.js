(function() {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var electron = require("electron");

    function findRtlScript() {
        var args = process.argv;
        var extDir = "";
        for (var i = 0; i < args.length; i++) {
            if (args[i] === "--extensions-dir" && args[i + 1]) { extDir = args[i + 1]; break; }
            if (args[i].startsWith("--extensions-dir=")) { extDir = args[i].split("=")[1]; break; }
        }
        if (!extDir) extDir = path.join(os.homedir(), ".cursor", "extensions");
        try {
            var dirs = fs.readdirSync(extDir)
                .filter(function(d) { return /^motcke\.cursor-rtl-\d/.test(d); })
                .sort();
            if (dirs.length > 0) {
                return path.join(extDir, dirs[dirs.length - 1], "resources", "rtl.js");
            }
        } catch (e) {}
        return "";
    }

    electron.app.on("browser-window-created", function(ev, win) {
        if (win && win.webContents) {
            win.webContents.on("did-finish-load", function() {
                try {
                    var rtlPath = findRtlScript();
                    if (!rtlPath) return;
                    var script = fs.readFileSync(rtlPath, "utf-8");
                    if (script) win.webContents.executeJavaScript(script).catch(function() {});
                } catch (e) {}
            });
        }
    });
})();
