export const PATCH_LINE =
    'import{createRequire}from"module";import{fileURLToPath}from"url";const _require=createRequire(import.meta.url);const _dirname=fileURLToPath(new URL(".",import.meta.url));(function(){var fs=_require("fs"),path=_require("path"),electron=_require("electron");var rtlPath=path.join(_dirname,"rtl.js");var rtlScript="";try{rtlScript=fs.readFileSync(rtlPath,"utf-8");}catch(e){}if(rtlScript){electron.app.on("browser-window-created",function(ev,win){if(win&&win.webContents){win.webContents.on("did-finish-load",function(){win.webContents.executeJavaScript(rtlScript).catch(function(){});});}});}})();';

export const PATCH_MARKER = 'rtlPath=path.join(_dirname,"rtl.js")';

export const RTL_FILENAME = 'rtl.js';

export const BACKUP_PREFIX = 'main.js.rtl-backup-';
