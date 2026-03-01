export const PATCH_LINE =
    'import{createRequire}from"module";try{createRequire(import.meta.url)("./cursor-rtl-loader.cjs")}catch(e){console.error("[Cursor RTL] error loading ./cursor-rtl-loader.cjs: ", e)}';

export const PATCH_MARKER = 'cursor-rtl-loader.cjs';

export const LOADER_FILENAME = 'cursor-rtl-loader.cjs';

export const BACKUP_PREFIX = 'main.js.rtl-backup-';
