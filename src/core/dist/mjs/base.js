import { Domain } from 'async-hook-domain';
import { AsyncResource } from 'async_hooks';
import { Minipass } from 'minipass';
import { hrtime } from 'node:process';
import { format } from 'node:util';
import { Parser, } from 'tap-parser';
import { extraFromError } from './extra-from-error.js';
export class TapWrap extends AsyncResource {
    test;
    constructor(test) {
        super(`tap.${test.constructor.name}`);
        this.test = test;
    }
}
export class Counts {
    total = 0;
    pass = 0;
    fail = 0;
    skip = 0;
    todo = 0;
    complete;
    constructor(c) {
        if (c)
            Object.assign(this, c);
    }
    toJSON() {
        const c = {
            total: this.total,
            pass: this.pass,
        };
        if (this.fail)
            c.fail = this.fail;
        if (this.todo)
            c.todo = this.todo;
        if (this.skip)
            c.skip = this.skip;
        return c;
    }
}
export class Lists {
    fail = [];
    todo = [];
    skip = [];
    pass = [];
}
const debug = (name) => (...args) => {
    const prefix = `TAP ${process.pid} ${name}: `;
    const msg = format(...args).trim();
    console.error(prefix + msg.split('\n').join(`\n${prefix}`));
};
export class Base extends Minipass {
    readyToProcess = false;
    options;
    indent;
    hook;
    // this actually is deterministically set in the ctor, but
    // in the hook, so tsc doesn't see it.
    hookDomain;
    timer;
    parser;
    debug;
    counts;
    lists;
    name;
    results;
    parent;
    bail;
    strict;
    omitVersion;
    preserveWhitespace;
    errors;
    childId;
    context;
    output;
    buffered;
    bailedOut;
    start;
    #started = false;
    time;
    hrtime;
    silent;
    deferred;
    constructor(options = {}) {
        super({ encoding: 'utf8' });
        // all tap streams are sync string minipasses
        this.hook = new TapWrap(this);
        this.options = options;
        this.counts = new Counts();
        this.lists = new Lists();
        this.silent = !!options.silent;
        // if it's null or an object, inherit from it.  otherwise, copy it.
        const ctx = options.context;
        if (ctx !== undefined) {
            this.context =
                typeof ctx === 'object' ? Object.create(ctx) : ctx;
        }
        else {
            this.context = null;
        }
        this.bail = !!options.bail;
        this.strict = !!options.strict;
        this.omitVersion = !!options.omitVersion;
        this.preserveWhitespace =
            options.preserveWhitespace !== false;
        this.buffered = !!options.buffered;
        this.bailedOut = false;
        this.errors = [];
        this.parent = options.parent;
        this.time = 0;
        this.hrtime = 0n;
        this.start = 0n;
        this.childId = options.childId || 0;
        // do we need this?  couldn't we just call the Minipass
        this.output = '';
        this.indent = options.indent || '';
        this.name = options.name || '(unnamed test)';
        this.hook.runInAsyncScope(() => (this.hookDomain = new Domain((er, type) => {
            if (!er || typeof er !== 'object')
                er = { error: er };
            er.tapCaught = type;
            this.threw(er);
        })));
        this.debug = !!options.debug
            ? debug(this.name)
            : () => { };
        this.parser =
            options.parser ||
                new Parser({
                    bail: this.bail,
                    strict: this.strict,
                    omitVersion: this.omitVersion,
                    preserveWhitespace: this.preserveWhitespace,
                    name: this.name,
                });
        this.setupParser();
        // ensure that a skip or todo on a child class reverts
        // back to Base's no-op main.
        if (options.skip || options.todo) {
            this.main = Base.prototype.main;
        }
    }
    setupParser() {
        this.parser.on('line', l => this.online(l));
        this.parser.once('bailout', reason => this.onbail(reason));
        this.parser.on('complete', result => this.oncomplete(result));
        this.parser.on('result', () => this.counts.total++);
        this.parser.on('pass', () => this.counts.pass++);
        this.parser.on('todo', res => {
            this.counts.todo++;
            this.lists.todo.push(res);
        });
        this.parser.on('skip', res => {
            // it is uselessly noisy to print out lists of tests skipped
            // because of a --grep or --only argument.
            if (/^filter: (only|\/.*\/)$/.test(res.skip))
                return;
            this.counts.skip++;
            this.lists.skip.push(res);
        });
        this.parser.on('fail', res => {
            this.counts.fail++;
            this.lists.fail.push(res);
        });
    }
    setTimeout(n) {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (n <= 0) {
            this.timer = undefined;
        }
        else {
            this.timer = setTimeout(() => this.timeout(), n);
            this.timer.unref();
        }
    }
    timeout(options = {
        expired: this.name,
        message: 'timeout!',
    }) {
        const { message = 'timeout!' } = options;
        this.setTimeout(0);
        options.expired = options.expired || this.name;
        // timeouts don't generally have a useful callsite information,
        // and no sense trying to capture it from @tapjs/stack
        const extra = {
            ...options,
            stack: '',
            at: {},
        };
        const threw = this.threw({ message }, extra);
        if (threw) {
            this.emit('timeout', threw);
        }
    }
    runMain(cb) {
        this.debug('BASE runMain');
        this.start = hrtime.bigint();
        this.#started = true;
        this.hook.runInAsyncScope(this.main, this, cb);
    }
    get started() {
        return this.#started;
    }
    main(cb) {
        cb();
    }
    write(c) {
        if (this.buffered) {
            this.output += c;
            return true;
        }
        return super.write(c);
    }
    onbail(reason) {
        this.bailedOut = reason || true;
        this.emit('bailout', reason);
    }
    online(line) {
        this.debug('LINE %j', line, [this.name, this.indent]);
        return this.write(this.indent + line);
    }
    oncomplete(results) {
        if (this.start) {
            this.hrtime = hrtime.bigint() - this.start;
            this.time =
                results.time ||
                    Math.floor(Number(this.hrtime) / 1000) / 1000;
        }
        this.debug('ONCOMPLETE %j %j', this.name, results);
        if (this.results) {
            Object.assign(results, this.results);
        }
        this.results = results;
        this.emit('complete', results);
        const errors = results.failures
            .filter(f => f.tapError)
            .map(f => {
            delete f.diag;
            delete f.ok;
            return f;
        });
        if (errors.length) {
            this.errors = errors;
        }
        super.end();
    }
    /**
     * extension point for plugins that want to be notified when the test
     * is about to end, whether explicitly or implicitly.
     */
    onbeforeend() { }
    /**
     * extension point for plugins that want to be notified when the test
     * is completely done, and terminating its parser.
     * Eg, used by Snapshot plugin to write the snapshot file.
     */
    onEOF() { }
    /**
     * extension point for TestBase to know when a child tests is done being
     * processed and it's safe to move on to the next one.
     *
     * @internal
     */
    ondone() { }
    emit(ev, ...data) {
        const ret = super.emit(ev, ...data);
        if (ev === 'end') {
            this.ondone();
            this.hook.emitDestroy();
            this.hookDomain.destroy();
        }
        return ret;
    }
    end() {
        return this;
    }
    threw(er, extra, proxy = false) {
        this.hook.emitDestroy();
        this.hookDomain.destroy();
        if (typeof er === 'string') {
            er = { message: er };
        }
        else if (!er || typeof er !== 'object') {
            er = { error: er };
        }
        if (this.name && !proxy) {
            er.test = this.name;
        }
        const message = er.message;
        if (!extra) {
            extra = extraFromError(er, extra);
        }
        // if we ended, we have to report it SOMEWHERE, unless we're
        // already in the process of bailing out, in which case it's
        // a bit excessive.
        if (this.results) {
            const alreadyBailing = !this.results.ok && this.bail;
            this.results.ok = false;
            if (this.parent) {
                this.parent.threw(er, extra, true);
            }
            else if (alreadyBailing) {
                // we are already bailing out, and this is the top level,
                // just make our way hastily to the nearest exit.
                return;
            }
            else if (!er.stack) {
                console.error(er);
            }
            else {
                if (message) {
                    er.message = message;
                }
                delete extra.stack;
                delete extra.at;
                console.error('%s: %s', er.name || 'Error', message);
                console.error(er.stack.split(/\n/).slice(1).join('\n'));
                console.error(extra);
            }
        }
        else {
            this.parser.ok = false;
        }
        return extra;
    }
    passing() {
        return this.parser.ok;
    }
}
//# sourceMappingURL=base.js.map