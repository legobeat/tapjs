"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainScript = void 0;
const proc_js_1 = require("./proc.js");
const mainScript = (def = 'TAP') => {
    //@ts-ignore
    if (typeof repl !== 'undefined' || '_eval' in proc_js_1.proc) {
        return def;
    }
    return proc_js_1.argv[1] || def;
};
exports.mainScript = mainScript;
//# sourceMappingURL=main-script.js.map