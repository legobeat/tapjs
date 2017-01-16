var Test = require('./test.js')
var util = require('util')

util.inherits(TAP, Test)
function TAP (options) {
  Test.call(this, options)
  // TODO unref the timer, once there is one.
}

TAP.prototype.oncomplete = function (results) {
  // maybe some diagnostic comments?  10 tests, 2 failed, etc.
  // prove-style?
  process.removeListener('uncaughtException', onUncaught)
  return Test.prototype.oncomplete.call(this, results)
}

var tap = new TAP({ name: 'TAP' })
module.exports = tap

process.on('exit', function (code) {
  if (!tap.results)
    tap.end()

  // console.error(tap)
  if (tap.results && !tap.results.ok && code === 0)
    process.exit(1)
})

var didPipe = false
TAP.prototype.pipe = function () {
  didPipe = true
  delete TAP.prototype.pipe
  delete TAP.prototype.push
  process.on('uncaughtException', onUncaught)
  return Test.prototype.pipe.apply(this, arguments)
}

TAP.prototype.push = function push () {
  this.pipe(process.stdout)
  process.stdout.emit = function (emit) { return function (ev, er) {
    if (ev === 'error' && er.code === 'EPIPE')
      return this.emit = emit
    return emit.apply(this, arguments)
  }}(process.stdout.emit)
  return this.push.apply(tap, arguments)
}

tap.Test = Test
tap.synonyms = require('./synonyms.js')

function onUncaught (er) {
  var child = tap
  while (child._currentChild && child._currentChild instanceof Test) {
    child = child._currentChild
  }
  child.threw(er)
}

// SIGTERM means being forcibly killed, almost always by timeout
var onExit = require('signal-exit')
onExit(function (code, signal) {
  if (signal !== 'SIGTERM' || !didPipe)
    return

  var handles = process._getActiveHandles().filter(function (h) {
    return h !== process.stdout &&
    h !== process.stdin &&
    h !== process.stderr
  })
  var requests = process._getActiveRequests()

  // Ignore this because it's really hard to test cover in a way
  // that isn't inconsistent and unpredictable.
  /* istanbul ignore next */
  var extra = {
    at: null,
    signal: signal
  }
  if (requests.length) {
    extra.requests = requests.map(function (r) {
      var ret = { type: r.constructor.name }
      if (r.context) {
        ret.context = r.context
      }
      return ret
    })
  }
  if (handles.length) {
    extra.handles = handles.map(function (h) {
      var ret = { type: h.constructor.name }
      if (h.msecs) {
        ret.msecs = h.msecs
      }
      if (h._events) {
        ret.events = Object.keys(h._events)
      }
      if (h._sockname) {
        ret.sockname = h._sockname
      }
      if (h._connectionKey) {
        ret.connectionKey = h._connectionKey
      }
      return ret
    })
  }

  if (!tap.results && tap._onTimeout)
    tap._onTimeout(extra)
  else {
    console.error('possible timeout: SIGTERM received after tap end')
    if (extra.handles || extra.requests) {
      delete extra.signal
      if (!extra.at) {
        delete extra.at
      }
      var yaml = require('js-yaml')
      console.error('  ---\n  ' +
               yaml.safeDump(extra).split('\n').join('\n  ').trim() +
               '\n  ...\n')
    }
    process.exit(1)
  }
})