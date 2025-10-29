(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],2:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],3:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.12.7
(function() {
  (function() {
    var actualCAF, actualRAF, i, len, prefix, ref;
    if (typeof window !== "undefined" && window !== null) {
      if (actualRAF = window.requestAnimationFrame) {
        actualCAF = window.cancelAnimationFrame || window.cancelRequestAnimationFrame;
      } else {
        ref = ['moz', 'webkit', 'ms', 'o'];
        for (i = 0, len = ref.length; i < len; i++) {
          prefix = ref[i];
          if (actualRAF = window[prefix + "RequestAnimationFrame"]) {
            actualCAF = window[prefix + "CancelAnimationFrame"] || window[prefix + "CancelRequestAnimationFrame"];
            break;
          }
        }
      }
      if (actualRAF) {
        actualRAF = actualRAF.bind(window);
        if (actualCAF) {
          actualCAF = actualCAF.bind(window);
        }
      }
      if (!actualRAF) {
        actualRAF = function(callback) {
          callback();
          return null;
        };
        actualCAF = function(timeout) {
          return null;
        };
      }
    } else {
      actualRAF = process.nextTick;
      actualCAF = null;
    }
    if (!actualCAF) {
      exports.requestAnimationFrame = function(callback) {
        var state;
        state = {
          active: true
        };
        actualRAF(function() {
          if (state.active) {
            return callback();
          }
        });
        return state;
      };
      return exports.cancelAnimationFrame = function(state) {
        return state.active = false;
      };
    } else {
      exports.requestAnimationFrame = actualRAF;
      return exports.cancelAnimationFrame = actualCAF;
    }
  })();

  exports.createLoop = function(options) {
    var frameCallback, frameReq, handle, lastTick, timerCallback, timerReq;
    if (options == null) {
      options = {};
    }
    lastTick = timerReq = frameReq = null;
    timerCallback = function() {
      var now;
      timerReq = null;
      now = Date.now();
      while (now - lastTick >= options.rate) {
        options.tick();
        lastTick += options.rate;
      }
      if (typeof options.idle === "function") {
        options.idle();
      }
      if (options.frame && !frameReq) {
        frameReq = exports.requestAnimationFrame(frameCallback);
      }
      return timerReq = setTimeout(timerCallback, options.rate);
    };
    frameCallback = function() {
      frameReq = null;
      return options.frame();
    };
    handle = {
      start: function() {
        if (!timerReq) {
          lastTick = Date.now();
          return timerReq = setTimeout(timerCallback, options.rate);
        }
      },
      stop: function() {
        if (timerReq) {
          clearInterval(timerReq);
          timerReq = null;
        }
        if (frameReq) {
          exports.cancelAnimationFrame(frameReq);
          return frameReq = null;
        }
      }
    };
    return handle;
  };

}).call(this);

}).call(this,require('_process'))
},{"_process":2}],4:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var buildPacker, buildUnpacker, fromUint16, fromUint32, fromUint8, pack, toUint16, toUint32, toUint8, unpack;

  toUint8 = function(n) {
    return [n & 0xFF];
  };

  toUint16 = function(n) {
    return [(n & 0xFF00) >> 8, n & 0x00FF];
  };

  toUint32 = function(n) {
    return [(n & 0xFF000000) >> 24, (n & 0x00FF0000) >> 16, (n & 0x0000FF00) >> 8, n & 0x000000FF];
  };

  fromUint8 = function(d, o) {
    return d[o];
  };

  fromUint16 = function(d, o) {
    return (d[o] << 8) + d[o + 1];
  };

  fromUint32 = function(d, o) {
    return (d[o] << 24) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];
  };

  buildPacker = function() {
    var bitIndex, bits, data, flushBitFields, retval;
    data = [];
    bits = null;
    bitIndex = 0;
    flushBitFields = function() {
      if (bits === null) {
        return;
      }
      data.push(bits);
      return bits = null;
    };
    retval = function(type, value) {
      if (type === 'f') {
        if (bits === null) {
          bits = !!value ? 1 : 0;
          return bitIndex = 1;
        } else {
          if (!!value) {
            bits |= 1 << bitIndex;
          }
          bitIndex++;
          if (bitIndex === 8) {
            return flushBitFields();
          }
        }
      } else {
        flushBitFields();
        return data = data.concat((function() {
          switch (type) {
            case 'B':
              return toUint8(value);
            case 'H':
              return toUint16(value);
            case 'I':
              return toUint32(value);
            default:
              throw new Error("Unknown format character " + type);
          }
        })());
      }
    };
    retval.finish = function() {
      flushBitFields();
      return data;
    };
    return retval;
  };

  buildUnpacker = function(data, offset) {
    var bitIndex, idx, retval;
    offset || (offset = 0);
    idx = offset;
    bitIndex = 0;
    retval = function(type) {
      var bit, bytes, ref, value;
      if (type === 'f') {
        bit = (1 << bitIndex) & data[idx];
        value = bit > 0;
        bitIndex++;
        if (bitIndex === 8) {
          idx++;
          bitIndex = 0;
        }
      } else {
        if (bitIndex !== 0) {
          idx++;
          bitIndex = 0;
        }
        ref = (function() {
          switch (type) {
            case 'B':
              return [fromUint8(data, idx), 1];
            case 'H':
              return [fromUint16(data, idx), 2];
            case 'I':
              return [fromUint32(data, idx), 4];
            default:
              throw new Error("Unknown format character " + type);
          }
        })(), value = ref[0], bytes = ref[1];
        idx += bytes;
      }
      return value;
    };
    retval.finish = function() {
      if (bitIndex !== 0) {
        idx++;
      }
      return idx - offset;
    };
    return retval;
  };

  pack = function(fmt) {
    var i, j, len, packer, type, value;
    packer = buildPacker();
    for (i = j = 0, len = fmt.length; j < len; i = ++j) {
      type = fmt[i];
      value = arguments[i + 1];
      packer(type, value);
    }
    return packer.finish();
  };

  unpack = function(fmt, data, offset) {
    var type, unpacker, values;
    unpacker = buildUnpacker(data, offset);
    values = (function() {
      var j, len, results;
      results = [];
      for (j = 0, len = fmt.length; j < len; j++) {
        type = fmt[j];
        results.push(unpacker(type));
      }
      return results;
    })();
    return [values, unpacker.finish()];
  };

  exports.buildPacker = buildPacker;

  exports.buildUnpacker = buildUnpacker;

  exports.pack = pack;

  exports.unpack = unpack;

}).call(this);

},{}],5:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var BaseWorld,
    slice = [].slice;

  BaseWorld = (function() {
    function BaseWorld() {
      this.objects = [];
    }

    BaseWorld.prototype.tick = function() {
      var j, len, obj, ref;
      ref = this.objects.slice(0);
      for (j = 0, len = ref.length; j < len; j++) {
        obj = ref[j];
        this.update(obj);
      }
    };

    BaseWorld.prototype.insert = function(obj) {
      var i, j, k, len, other, ref, ref1, ref2;
      ref = this.objects;
      for (i = j = 0, len = ref.length; j < len; i = ++j) {
        other = ref[i];
        if (obj.updatePriority > other.updatePriority) {
          break;
        }
      }
      this.objects.splice(i, 0, obj);
      for (i = k = ref1 = i, ref2 = this.objects.length; ref1 <= ref2 ? k < ref2 : k > ref2; i = ref1 <= ref2 ? ++k : --k) {
        this.objects[i].idx = i;
      }
      return obj;
    };

    BaseWorld.prototype.remove = function(obj) {
      var i, j, ref, ref1;
      this.objects.splice(obj.idx, 1);
      for (i = j = ref = obj.idx, ref1 = this.objects.length; ref <= ref1 ? j < ref1 : j > ref1; i = ref <= ref1 ? ++j : --j) {
        this.objects[i].idx = i;
      }
      obj.idx = null;
      return obj;
    };

    BaseWorld.prototype.registerType = function(type) {};

    BaseWorld.prototype.spawn = function() {
      var args, type;
      type = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    };

    BaseWorld.prototype.update = function(obj) {};

    BaseWorld.prototype.destroy = function(obj) {};

    return BaseWorld;

  })();

  module.exports = BaseWorld;

}).call(this);

},{}],6:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var BaseWorld, ClientWorld, buildUnpacker, ref, unpack,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty,
    slice = [].slice;

  BaseWorld = require('../base');

  ref = require('../../struct'), unpack = ref.unpack, buildUnpacker = ref.buildUnpacker;

  ClientWorld = (function(superClass) {
    extend(ClientWorld, superClass);

    ClientWorld.prototype.registerType = function(type) {
      if (!this.hasOwnProperty('types')) {
        this.types = [];
      }
      return this.types.push(type);
    };

    function ClientWorld() {
      ClientWorld.__super__.constructor.apply(this, arguments);
      this.changes = [];
    }

    ClientWorld.prototype.spawn = function() {
      var args, obj, type;
      type = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
      obj = this.insert(new type(this));
      this.changes.unshift(['create', obj.idx, obj]);
      obj._net_transient = true;
      obj.spawn.apply(obj, args);
      obj.anySpawn();
      return obj;
    };

    ClientWorld.prototype.update = function(obj) {
      obj.update();
      obj.emit('update');
      obj.emit('anyUpdate');
      return obj;
    };

    ClientWorld.prototype.destroy = function(obj) {
      this.changes.unshift(['destroy', obj.idx, obj]);
      this.remove(obj);
      obj.emit('destroy');
      if (obj._net_transient) {
        obj.emit('finalize');
      }
      return obj;
    };

    ClientWorld.prototype.netRestore = function() {
      var i, idx, j, k, len, len1, obj, ref1, ref2, ref3, type;
      if (!(this.changes.length > 0)) {
        return;
      }
      ref1 = this.changes;
      for (j = 0, len = ref1.length; j < len; j++) {
        ref2 = ref1[j], type = ref2[0], idx = ref2[1], obj = ref2[2];
        switch (type) {
          case 'create':
            if (obj.transient && !obj._net_revived) {
              obj.emit('finalize');
            }
            this.objects.splice(idx, 1);
            break;
          case 'destroy':
            obj._net_revived = true;
            this.objects.splice(idx, 0, obj);
        }
      }
      this.changes = [];
      ref3 = this.objects;
      for (i = k = 0, len1 = ref3.length; k < len1; i = ++k) {
        obj = ref3[i];
        obj.idx = i;
      }
    };

    ClientWorld.prototype.netSpawn = function(data, offset) {
      var obj, type;
      type = this.types[data[offset]];
      obj = this.insert(new type(this));
      obj._net_transient = false;
      obj._net_new = true;
      return 1;
    };

    ClientWorld.prototype.netUpdate = function(obj, data, offset) {
      var bytes, changes, ref1;
      ref1 = this.deserialize(obj, data, offset, obj._net_new), bytes = ref1[0], changes = ref1[1];
      if (obj._net_new) {
        obj.netSpawn();
        obj.anySpawn();
        obj._net_new = false;
      } else {
        obj.emit('netUpdate', changes);
        obj.emit('anyUpdate');
      }
      obj.emit('netSync');
      return bytes;
    };

    ClientWorld.prototype.netDestroy = function(data, offset) {
      var bytes, obj, obj_idx, ref1, ref2;
      ref1 = unpack('H', data, offset), (ref2 = ref1[0], obj_idx = ref2[0]), bytes = ref1[1];
      obj = this.objects[obj_idx];
      if (!obj._net_new) {
        obj.emit('netDestroy');
        obj.emit('anyDestroy');
        obj.emit('finalize');
      }
      this.remove(obj);
      return bytes;
    };

    ClientWorld.prototype.netTick = function(data, offset) {
      var bytes, j, len, obj, ref1;
      bytes = 0;
      ref1 = this.objects;
      for (j = 0, len = ref1.length; j < len; j++) {
        obj = ref1[j];
        bytes += this.netUpdate(obj, data, offset + bytes);
      }
      return bytes;
    };

    ClientWorld.prototype.deserialize = function(obj, data, offset, isCreate) {
      var changes, unpacker;
      unpacker = buildUnpacker(data, offset);
      changes = {};
      obj.serialization(isCreate, (function(_this) {
        return function(specifier, attribute, options) {
          var oldValue, other, ref1, value;
          options || (options = {});
          if (specifier === 'O') {
            other = _this.objects[unpacker('H')];
            if ((oldValue = (ref1 = obj[attribute]) != null ? ref1.$ : void 0) !== other) {
              changes[attribute] = oldValue;
              obj.ref(attribute, other);
            }
          } else {
            value = unpacker(specifier);
            if (options.rx != null) {
              value = options.rx(value);
            }
            if ((oldValue = obj[attribute]) !== value) {
              changes[attribute] = oldValue;
              obj[attribute] = value;
            }
          }
        };
      })(this));
      return [unpacker.finish(), changes];
    };

    return ClientWorld;

  })(BaseWorld);

  module.exports = ClientWorld;

}).call(this);

},{"../../struct":4,"../base":5}],7:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var BaseWorld, NetLocalWorld,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty,
    slice = [].slice;

  BaseWorld = require('../base');

  NetLocalWorld = (function(superClass) {
    extend(NetLocalWorld, superClass);

    function NetLocalWorld() {
      return NetLocalWorld.__super__.constructor.apply(this, arguments);
    }

    NetLocalWorld.prototype.spawn = function() {
      var args, obj, type;
      type = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
      obj = this.insert(new type(this));
      obj.spawn.apply(obj, args);
      obj.anySpawn();
      return obj;
    };

    NetLocalWorld.prototype.update = function(obj) {
      obj.update();
      obj.emit('update');
      obj.emit('anyUpdate');
      return obj;
    };

    NetLocalWorld.prototype.destroy = function(obj) {
      obj.destroy();
      obj.emit('destroy');
      obj.emit('finalize');
      this.remove(obj);
      return obj;
    };

    return NetLocalWorld;

  })(BaseWorld);

  module.exports = NetLocalWorld;

}).call(this);

},{"../base":5}],8:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var NetWorldObject, WorldObject,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  WorldObject = require('../object');

  NetWorldObject = (function(superClass) {
    extend(NetWorldObject, superClass);

    function NetWorldObject() {
      return NetWorldObject.__super__.constructor.apply(this, arguments);
    }

    NetWorldObject.prototype.charId = null;

    NetWorldObject.prototype.serialization = function(isCreate, p) {};

    NetWorldObject.prototype.netSpawn = function() {};

    NetWorldObject.prototype.anySpawn = function() {};

    return NetWorldObject;

  })(WorldObject);

  module.exports = NetWorldObject;

}).call(this);

},{"../object":9}],9:[function(require,module,exports){
// Generated by CoffeeScript 1.12.7
(function() {
  var EventEmitter, WorldObject,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  EventEmitter = require('events').EventEmitter;

  WorldObject = (function(superClass) {
    extend(WorldObject, superClass);

    WorldObject.prototype.world = null;

    WorldObject.prototype.idx = null;

    WorldObject.prototype.updatePriority = 0;

    function WorldObject(world) {
      this.world = world;
    }

    WorldObject.prototype.spawn = function() {};

    WorldObject.prototype.update = function() {};

    WorldObject.prototype.destroy = function() {};

    WorldObject.prototype.ref = function(attribute, other) {
      var r, ref, ref1;
      if (((ref = this[attribute]) != null ? ref.$ : void 0) === other) {
        return this[attribute];
      }
      if ((ref1 = this[attribute]) != null) {
        ref1.clear();
      }
      if (!other) {
        return;
      }
      this[attribute] = r = {
        $: other,
        owner: this,
        attribute: attribute
      };
      r.events = {};
      r.on = function(event, listener) {
        var base;
        other.on(event, listener);
        ((base = r.events)[event] || (base[event] = [])).push(listener);
        return r;
      };
      r.clear = function() {
        var event, i, len, listener, listeners, ref2;
        ref2 = r.events;
        for (event in ref2) {
          listeners = ref2[event];
          for (i = 0, len = listeners.length; i < len; i++) {
            listener = listeners[i];
            other.removeListener(event, listener);
          }
        }
        r.owner.removeListener('finalize', r.clear);
        return r.owner[r.attribute] = null;
      };
      r.on('finalize', r.clear);
      r.owner.on('finalize', r.clear);
      return r;
    };

    return WorldObject;

  })(EventEmitter);

  module.exports = WorldObject;

}).call(this);

},{"events":1}],10:[function(require,module,exports){
var decodeBase64;

decodeBase64 = function(input) {
  var c, cc, i, j, len, output, outputIndex, outputLength, quad, quadIndex, tail;
  if (input.length % 4 !== 0) {
    throw new Error("Invalid base64 input length, not properly padded?");
  }
  outputLength = input.length / 4 * 3;
  tail = input.substr(-2);
  if (tail[0] === '=') {
    outputLength--;
  }
  if (tail[1] === '=') {
    outputLength--;
  }
  output = new Array(outputLength);
  quad = new Array(4);
  outputIndex = 0;
  for (i = j = 0, len = input.length; j < len; i = ++j) {
    c = input[i];
    cc = c.charCodeAt(0);
    quadIndex = i % 4;
    quad[quadIndex] = (function() {
      if ((65 <= cc && cc <= 90)) {
        return cc - 65;
      } else if ((97 <= cc && cc <= 122)) {
        return cc - 71;
      } else if ((48 <= cc && cc <= 57)) {
        return cc + 4;
      } else if (cc === 43) {
        return 62;
      } else if (cc === 47) {
        return 63;
      } else if (cc === 61) {
        return -1;
      } else {
        throw new Error("Invalid base64 input character: " + c);
      }
    })();
    if (quadIndex !== 3) {
      continue;
    }
    output[outputIndex++] = ((quad[0] & 0x3F) << 2) + ((quad[1] & 0x30) >> 4);
    if (quad[2] !== -1) {
      output[outputIndex++] = ((quad[1] & 0x0F) << 4) + ((quad[2] & 0x3C) >> 2);
    }
    if (quad[3] !== -1) {
      output[outputIndex++] = ((quad[2] & 0x03) << 6) + (quad[3] & 0x3F);
    }
  }
  return output;
};

exports.decodeBase64 = decodeBase64;


},{}],11:[function(require,module,exports){
module.exports = 'Qk1BUEJPTE8BEAsQW5H/D2Vjbv8PZV90/w9lVHX/D2VwbP8PZYFr/w9lq27/D2WueP8PZa58/w9l\nmpL/D2Veh/8PZWmJ/w9lcYn/D2Vsf/8PZWx4/w9lrYn/D2WBaP9aWlqvaf9aWlpWbv9aWlquev9a\nWlp5e/9aWlpsfP9aWlqLff9aWlpti/9aWlpVjf9aWlqlkv9aWlp+mP9aWlpMjABMfABcZA1sZAx8\nZAyMZAycZAysZAu4fAi4jAisnAWcnASMnAR8nARsnARcnAMQZk608fHx8fHx8fHx8fGRGGdNtaH0\ntNUB8PCQkgGSAeIB4vHh8pKRHWhNtZGU9YUE1QHnlOcAxIIB4gHiAfKygdKQkoEfaU21gZT1lQTV\nAde05wSSgYIB4pHCAfKC8ZEAhJKBIGpNtYGEhfSFBNUBx9TXBIeC8bKBooHiofICgQSBgoEja021\ngQSFhNUEhQTVAbf0xwSXEhwrGSAaIBwqGCAfKSFCsSBsTbWBBIUE5QSFBNWRl/TUl/KSsaIBkqGy\ngfKCBKKBIG1NtYEEhQSFpIUEhQT1AZf0xwT3t7LxAfIB8oIEooEjbk21gQSFBIWEFUhQSFBKUHpQ\nGn1NcE9/fCAfKioeIEooECBvTbWBBIUEtQSFBIUE9QG3tOcE9/eygZL3p5HCBKKBIXBNtYEEhQS1\nBIUEhQT1gbeU9wT394eSAaL3x5GiBKKBIHFNtYEEhdSFBIUE9RUffXIED355CHAff3lwGiBKKBAe\nck21gQT1hQSFBPUVH31wD09JQQeB9/eXsQSBgoEdc021gQT1hQSFBPUVH31yBA9+dAQHH399eAFA\nsRl0TbWB9KSFFH9QH35wT39wD09PS0AJKBAddU21gbUH9QTl8QGH4QTx8RFJH394eFlxBICSgSJ2\nTbWB9cUE1fGx0ATw8EBAEIcFlwCHhYcQeFl4WnFHooEgd021gfWFtLXx0QD0pAD0pDAQeVx4WXhR\ncKcAhwS3gSJ4TbXhtQTl8QLREE8IAkBNAEkDQBCHBYcldZeF96cEt4EleU21gbcBtQTl8eEgQPRA\nQEC0AJRAQBCHBYclBaeFl5XHBLWBJnpNtYG3AaUQSQtfHhkATwJASQBLBUBAELeVhwCHhceVhwSH\nlYEje021gbcBpQD09PSUAJQgQJQgQNRwQEAQX3p4W3JXWXtYECd8TbWBtwGlkBQLXxAtEQSwRAQE\nkASwdAQEBAEQhYeF9wW3JXXngSd9TbWBtwHVBMXx4SBAtCBAtAC0cEBAQBAJUHhZeVt5VHV1e1h4\nECp+TbWBtwHVBIXx8ZEwQEsATQBNB0BAEFcVeFlwWnBYcFl3V1dXVwWHgSd/TbWBtwGFsQSRp+EC\n0UBAQPSEAPRAQBCHpZeVB5UXWXNXV7WHgSeATbWBt6GgBKeV8dFwQEBATQBPBUBAEPcFpwWHBZd1\ndXV1cFh4ECSBTbWB96AEp5UH8aFAEECUANQgQNRAQECh15W3lUdXV7WHgSOCTbWB94CHBNUH8ZFC\nAQTwBJAkBLB0BAQBAHsffHJXXngQI4NNtYHwgIcElcfxAYIgEPSEAJQAtACUQEAQt+HnFXxZeBAf\nhE21gfCAhwTVhwGSsZIQHQBLAE0ATQEQ95fB97eBHIVNtYEAxwC3BKeVhwHyggCRAPQA9PSE98fx\n4R6GTbWBEHoAewF01YcB8oKQAfDw8AGHBPe3gPe3gR6HTbWBIHCnALc0V1t4HyogDx8fGBhwT3x4\nD3p4EByITbWBMHB6C3BNUHgfKyAfeg9+cE98eA95eRAeiU21gZD3IECXlRcfLCAYcAt8D3xxBPCA\nl7D3B5Efik21gQeAB4DHAPT09LSHAKcAhwD09MQwcHsPcHkQK4tNtYEHgAeAxyBAh4CXAaKQFAwk\nFwcKcApwCHAPeHBKCRBIEwQH0PcHkSaMTbWBB4AHgOQAh4CXAaKwwgGXEHwAew94eUEQkQSBAPQA\n94eBKo1NtYEHgAeAFH0IeAh4GSkPJhcHBw9/engCQQkQSBgBQMcQegh4WHgQK45NtYEHgAeAh/CA\nB4GSoPKBpwCHhccA15AHgCQQkQShFAxwCnAIeFh4ECmPTbWBhyBwh4CngIcAhwGioPISGnANegh6\nUXCXgCQQ4QSwB9CHhYeBKZBNtYGHMHB5AHgAeAhwCHAZKw8hIafwtwWHhZCHEE0aSAhwDHANeBAo\nkU21gYeQRwcHgASAhxB4GSsPISGnsPeFhwWAlwCk0QSAB/AXC3gQKpJNtYGnUHBweAB4CHIHGnsP\ncH8YH3hYcVCXAIShAqEUCXEEhwCnALeBKJNNtYEHoEcHB4AHgAeAFxp7D3hwHnwbeFhwCXgJShxJ\nCXkAeAt4ECaUTbWBB6BHBweAB4AnB4GnsJehpwH3p7G3gAeQBPGAFAp8C3kQIpVNtYGXAIcwcHgK\ncgcbewh8GXAffnoceAlNEgdKD3l5ECCWTbWRhwCnEHgAegFxt7CHwZcB9/cH8fGBEH9ATHoQHZdN\ntZGH8Aeggbewl6GnAfeHkfengPERDygrexAbmE21sfCXgAHHsKeBtwH34feHAPERDygpfRAQmU60\n8fHx8fHx8fHx8fGRBP///w=='.split('\n').join('');


},{}],12:[function(require,module,exports){
var BoloLocalWorld, BoloNetworkWorld;

BoloLocalWorld = require('./world/local');

BoloNetworkWorld = require('./world/client');

if (location.search === '?local') {
  module.exports = BoloLocalWorld;
} else {
  module.exports = BoloNetworkWorld;
}


},{"./world/client":19,"./world/local":20}],13:[function(require,module,exports){
var EventEmitter, Progress,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice;

EventEmitter = require('events').EventEmitter;

Progress = (function(superClass) {
  extend(Progress, superClass);

  function Progress(initialAmount) {
    this.lengthComputable = true;
    this.loaded = 0;
    this.total = initialAmount != null ? initialAmount : 0;
    this.wrappingUp = false;
  }

  Progress.prototype.add = function() {
    var amount, args, cb;
    args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    if (typeof args[0] === 'number') {
      amount = args.shift();
    } else {
      amount = 1;
    }
    if (typeof args[0] === 'function') {
      cb = args.shift();
    } else {
      cb = null;
    }
    this.total += amount;
    this.emit('progress', this);
    return (function(_this) {
      return function() {
        _this.step(amount);
        return typeof cb === "function" ? cb() : void 0;
      };
    })(this);
  };

  Progress.prototype.step = function(amount) {
    if (amount == null) {
      amount = 1;
    }
    this.loaded += amount;
    this.emit('progress', this);
    return this.checkComplete();
  };

  Progress.prototype.set = function(total, loaded) {
    this.total = total;
    this.loaded = loaded;
    this.emit('progress', this);
    return this.checkComplete();
  };

  Progress.prototype.wrapUp = function() {
    this.wrappingUp = true;
    return this.checkComplete();
  };

  Progress.prototype.checkComplete = function() {
    if (!(this.wrappingUp && this.loaded >= this.total)) {
      return;
    }
    return this.emit('complete');
  };

  return Progress;

})(EventEmitter);

module.exports = Progress;


},{"events":1}],14:[function(require,module,exports){
var BaseRenderer, MAP_SIZE_PIXELS, PI, PIXEL_SIZE_WORLD, TEAM_COLORS, TILE_SIZE_PIXELS, TILE_SIZE_WORLD, cos, max, min, ref, round, sin, sounds, sqrt;

min = Math.min, max = Math.max, round = Math.round, cos = Math.cos, sin = Math.sin, PI = Math.PI, sqrt = Math.sqrt;

ref = require('../../constants'), TILE_SIZE_PIXELS = ref.TILE_SIZE_PIXELS, TILE_SIZE_WORLD = ref.TILE_SIZE_WORLD, PIXEL_SIZE_WORLD = ref.PIXEL_SIZE_WORLD, MAP_SIZE_PIXELS = ref.MAP_SIZE_PIXELS;

sounds = require('../../sounds');

TEAM_COLORS = require('../../team_colors');

BaseRenderer = (function() {
  function BaseRenderer(world) {
    this.world = world;
    this.images = this.world.images;
    this.soundkit = this.world.soundkit;
    this.canvas = $('<canvas/>').appendTo('body');
    this.lastCenter = this.world.map.findCenterCell().getWorldCoordinates();
    this.mouse = [0, 0];
    this.canvas.click((function(_this) {
      return function(e) {
        return _this.handleClick(e);
      };
    })(this));
    this.canvas.mousemove((function(_this) {
      return function(e) {
        return _this.mouse = [e.pageX, e.pageY];
      };
    })(this));
    this.setup();
    this.handleResize();
    $(window).resize((function(_this) {
      return function() {
        return _this.handleResize();
      };
    })(this));
  }

  BaseRenderer.prototype.setup = function() {};

  BaseRenderer.prototype.centerOn = function(x, y, cb) {};

  BaseRenderer.prototype.drawTile = function(tx, ty, sdx, sdy) {};

  BaseRenderer.prototype.drawStyledTile = function(tx, ty, style, sdx, sdy) {};

  BaseRenderer.prototype.drawMap = function(sx, sy, w, h) {};

  BaseRenderer.prototype.drawBuilderIndicator = function(builder) {};

  BaseRenderer.prototype.onRetile = function(cell, tx, ty) {};

  BaseRenderer.prototype.draw = function() {
    var ref1, ref2, ref3, x, y;
    if (this.world.player) {
      ref1 = this.world.player, x = ref1.x, y = ref1.y;
      if (this.world.player.fireball != null) {
        ref2 = this.world.player.fireball.$, x = ref2.x, y = ref2.y;
      }
    } else {
      x = y = null;
    }
    if (!((x != null) && (y != null))) {
      ref3 = this.lastCenter, x = ref3[0], y = ref3[1];
    } else {
      this.lastCenter = [x, y];
    }
    this.centerOn(x, y, (function(_this) {
      return function(left, top, width, height) {
        var i, len, obj, ox, oy, ref4, ref5, tx, ty;
        _this.drawMap(left, top, width, height);
        ref4 = _this.world.objects;
        for (i = 0, len = ref4.length; i < len; i++) {
          obj = ref4[i];
          if (!((obj.styled != null) && (obj.x != null) && (obj.y != null))) {
            continue;
          }
          ref5 = obj.getTile(), tx = ref5[0], ty = ref5[1];
          ox = round(obj.x / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          oy = round(obj.y / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          switch (obj.styled) {
            case true:
              _this.drawStyledTile(tx, ty, obj.team, ox, oy);
              break;
            case false:
              _this.drawTile(tx, ty, ox, oy);
          }
        }
        return _this.drawOverlay();
      };
    })(this));
    if (this.hud) {
      return this.updateHud();
    }
  };

  BaseRenderer.prototype.playSound = function(sfx, x, y, owner) {
    var dist, dx, dy, mode, name;
    mode = this.world.player && owner === this.world.player ? 'Self' : (dx = x - this.lastCenter[0], dy = y - this.lastCenter[1], dist = sqrt(dx * dx + dy * dy), dist > 40 * TILE_SIZE_WORLD ? 'None' : dist > 15 * TILE_SIZE_WORLD ? 'Far' : 'Near');
    if (mode === 'None') {
      return;
    }
    name = (function() {
      switch (sfx) {
        case sounds.BIG_EXPLOSION:
          return "bigExplosion" + mode;
        case sounds.BUBBLES:
          if (mode === 'Self') {
            return "bubbles";
          }
          break;
        case sounds.FARMING_TREE:
          return "farmingTree" + mode;
        case sounds.HIT_TANK:
          return "hitTank" + mode;
        case sounds.MAN_BUILDING:
          return "manBuilding" + mode;
        case sounds.MAN_DYING:
          return "manDying" + mode;
        case sounds.MAN_LAY_MINE:
          if (mode === 'Near') {
            return "manLayMineNear";
          }
          break;
        case sounds.MINE_EXPLOSION:
          return "mineExplosion" + mode;
        case sounds.SHOOTING:
          return "shooting" + mode;
        case sounds.SHOT_BUILDING:
          return "shotBuilding" + mode;
        case sounds.SHOT_TREE:
          return "shotTree" + mode;
        case sounds.TANK_SINKING:
          return "tankSinking" + mode;
      }
    })();
    if (name) {
      return this.soundkit[name]();
    }
  };

  BaseRenderer.prototype.handleResize = function() {
    this.canvas[0].width = window.innerWidth;
    this.canvas[0].height = window.innerHeight;
    this.canvas.css({
      width: window.innerWidth + 'px',
      height: window.innerHeight + 'px'
    });
    return $('body').css({
      width: window.innerWidth + 'px',
      height: window.innerHeight + 'px'
    });
  };

  BaseRenderer.prototype.handleClick = function(e) {
    var action, cell, flexible, mx, my, ref1, ref2, trees;
    e.preventDefault();
    this.world.input.focus();
    if (!this.currentTool) {
      return;
    }
    ref1 = this.mouse, mx = ref1[0], my = ref1[1];
    cell = this.getCellAtScreen(mx, my);
    ref2 = this.world.checkBuildOrder(this.currentTool, cell), action = ref2[0], trees = ref2[1], flexible = ref2[2];
    if (action) {
      return this.world.buildOrder(action, trees, cell);
    }
  };

  BaseRenderer.prototype.getViewAreaAtWorld = function(x, y) {
    var height, left, ref1, top, width;
    ref1 = this.canvas[0], width = ref1.width, height = ref1.height;
    left = round(x / PIXEL_SIZE_WORLD - width / 2);
    left = max(0, min(MAP_SIZE_PIXELS - width, left));
    top = round(y / PIXEL_SIZE_WORLD - height / 2);
    top = max(0, min(MAP_SIZE_PIXELS - height, top));
    return [left, top, width, height];
  };

  BaseRenderer.prototype.getCellAtScreen = function(x, y) {
    var cameraX, cameraY, height, left, ref1, ref2, top, width;
    ref1 = this.lastCenter, cameraX = ref1[0], cameraY = ref1[1];
    ref2 = this.getViewAreaAtWorld(cameraX, cameraY), left = ref2[0], top = ref2[1], width = ref2[2], height = ref2[3];
    return this.world.map.cellAtPixel(left + x, top + y);
  };

  BaseRenderer.prototype.drawOverlay = function() {
    var b, player;
    if ((player = this.world.player) && player.armour !== 255) {
      b = player.builder.$;
      if (!(b.order === b.states.inTank || b.order === b.states.parachuting)) {
        this.drawBuilderIndicator(b);
      }
      this.drawReticle();
    }
    this.drawNames();
    return this.drawCursor();
  };

  BaseRenderer.prototype.drawReticle = function() {
    var distance, rad, x, y;
    distance = this.world.player.firingRange * TILE_SIZE_PIXELS;
    rad = (256 - this.world.player.direction) * 2 * PI / 256;
    x = round(this.world.player.x / PIXEL_SIZE_WORLD + cos(rad) * distance) - TILE_SIZE_PIXELS / 2;
    y = round(this.world.player.y / PIXEL_SIZE_WORLD + sin(rad) * distance) - TILE_SIZE_PIXELS / 2;
    return this.drawTile(17, 4, x, y);
  };

  BaseRenderer.prototype.drawCursor = function() {
    var cell, mx, my, ref1;
    ref1 = this.mouse, mx = ref1[0], my = ref1[1];
    cell = this.getCellAtScreen(mx, my);
    return this.drawTile(18, 6, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
  };

  BaseRenderer.prototype.initHud = function() {
    this.hud = $('<div/>').appendTo('body');
    this.initHudTankStatus();
    this.initHudPillboxes();
    this.initHudBases();
    this.initHudToolSelect();
    this.initHudNotices();
    return this.updateHud();
  };

  BaseRenderer.prototype.initHudTankStatus = function() {
    var bar, container, i, indicator, len, ref1;
    container = $('<div/>', {
      id: 'tankStatus'
    }).appendTo(this.hud);
    $('<div/>', {
      "class": 'deco'
    }).appendTo(container);
    this.tankIndicators = {};
    ref1 = ['shells', 'mines', 'armour', 'trees'];
    for (i = 0, len = ref1.length; i < len; i++) {
      indicator = ref1[i];
      bar = $('<div/>', {
        "class": 'gauge',
        id: "tank-" + indicator
      }).appendTo(container);
      this.tankIndicators[indicator] = $('<div class="gauge-content"></div>').appendTo(bar);
    }
  };

  BaseRenderer.prototype.initHudPillboxes = function() {
    var container, node, pill;
    container = $('<div/>', {
      id: 'pillStatus'
    }).appendTo(this.hud);
    $('<div/>', {
      "class": 'deco'
    }).appendTo(container);
    this.pillIndicators = (function() {
      var i, len, ref1, results;
      ref1 = this.world.map.pills;
      results = [];
      for (i = 0, len = ref1.length; i < len; i++) {
        pill = ref1[i];
        node = $('<div/>', {
          "class": 'pill'
        }).appendTo(container);
        results.push([node, pill]);
      }
      return results;
    }).call(this);
  };

  BaseRenderer.prototype.initHudBases = function() {
    var base, container, node;
    container = $('<div/>', {
      id: 'baseStatus'
    }).appendTo(this.hud);
    $('<div/>', {
      "class": 'deco'
    }).appendTo(container);
    this.baseIndicators = (function() {
      var i, len, ref1, results;
      ref1 = this.world.map.bases;
      results = [];
      for (i = 0, len = ref1.length; i < len; i++) {
        base = ref1[i];
        node = $('<div/>', {
          "class": 'base'
        }).appendTo(container);
        results.push([node, base]);
      }
      return results;
    }).call(this);
  };

  BaseRenderer.prototype.initHudToolSelect = function() {
    var i, len, ref1, toolType, tools;
    this.currentTool = null;
    tools = $('<div id="tool-select" />').appendTo(this.hud);
    ref1 = ['forest', 'road', 'building', 'pillbox', 'mine'];
    for (i = 0, len = ref1.length; i < len; i++) {
      toolType = ref1[i];
      this.initHudTool(tools, toolType);
    }
    return tools.buttonset();
  };

  BaseRenderer.prototype.initHudTool = function(tools, toolType) {
    var label, tool, toolname;
    toolname = "tool-" + toolType;
    tool = $('<input/>', {
      type: 'radio',
      name: 'tool',
      id: toolname
    }).appendTo(tools);
    label = $('<label/>', {
      "for": toolname
    }).appendTo(tools);
    label.append($('<span/>', {
      "class": "bolo-tool bolo-" + toolname
    }));
    return tool.click((function(_this) {
      return function(e) {
        if (_this.currentTool === toolType) {
          _this.currentTool = null;
          tools.find('input').removeAttr('checked');
          tools.buttonset('refresh');
        } else {
          _this.currentTool = toolType;
        }
        return _this.world.input.focus();
      };
    })(this));
  };

  BaseRenderer.prototype.initHudNotices = function() {
    if (location.hostname.split('.')[1] === 'github') {
      $('<div/>').html('This is a work-in-progress; less than alpha quality!<br>\nTo see multiplayer in action, follow instructions on Github.').css({
        'position': 'absolute',
        'top': '70px',
        'left': '0px',
        'width': '100%',
        'text-align': 'center',
        'font-family': 'monospace',
        'font-size': '16px',
        'font-weight': 'bold',
        'color': 'white'
      }).appendTo(this.hud);
    }
    if (location.hostname.split('.')[1] === 'github' || location.hostname.substr(-6) === '.no.de') {
      return $('<a href="http://github.com/stephank/orona"></a>').css({
        'position': 'absolute',
        'top': '0px',
        'right': '0px'
      }).html('<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">').appendTo(this.hud);
    }
  };

  BaseRenderer.prototype.updateHud = function() {
    var base, color, i, j, len, len1, node, p, pill, prop, ref1, ref2, ref3, ref4, ref5, results, statuskey, value;
    ref1 = this.pillIndicators;
    for (i = 0, len = ref1.length; i < len; i++) {
      ref2 = ref1[i], node = ref2[0], pill = ref2[1];
      statuskey = pill.inTank + ";" + pill.carried + ";" + pill.armour + ";" + pill.team;
      if (pill.hudStatusKey === statuskey) {
        continue;
      }
      pill.hudStatusKey = statuskey;
      if (pill.inTank || pill.carried) {
        node.attr('status', 'carried');
      } else if (pill.armour === 0) {
        node.attr('status', 'dead');
      } else {
        node.attr('status', 'healthy');
      }
      color = TEAM_COLORS[pill.team] || {
        r: 112,
        g: 112,
        b: 112
      };
      node.css({
        'background-color': "rgb(" + color.r + "," + color.g + "," + color.b + ")"
      });
    }
    ref3 = this.baseIndicators;
    for (j = 0, len1 = ref3.length; j < len1; j++) {
      ref4 = ref3[j], node = ref4[0], base = ref4[1];
      statuskey = base.armour + ";" + base.team;
      if (base.hudStatusKey === statuskey) {
        continue;
      }
      base.hudStatusKey = statuskey;
      if (base.armour <= 9) {
        node.attr('status', 'vulnerable');
      } else {
        node.attr('status', 'healthy');
      }
      color = TEAM_COLORS[base.team] || {
        r: 112,
        g: 112,
        b: 112
      };
      node.css({
        'background-color': "rgb(" + color.r + "," + color.g + "," + color.b + ")"
      });
    }
    p = this.world.player;
    p.hudLastStatus || (p.hudLastStatus = {});
    ref5 = this.tankIndicators;
    results = [];
    for (prop in ref5) {
      node = ref5[prop];
      value = p.armour === 255 ? 0 : p[prop];
      if (p.hudLastStatus[prop] === value) {
        continue;
      }
      p.hudLastStatus[prop] = value;
      results.push(node.css({
        height: (round(value / 40 * 100)) + "%"
      }));
    }
    return results;
  };

  return BaseRenderer;

})();

module.exports = BaseRenderer;


},{"../../constants":22,"../../sounds":37,"../../team_colors":39}],15:[function(require,module,exports){
var BaseRenderer, Common2dRenderer, PI, PIXEL_SIZE_WORLD, TEAM_COLORS, TILE_SIZE_PIXELS, cos, distance, heading, min, ref, ref1, round, sin,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

min = Math.min, round = Math.round, PI = Math.PI, sin = Math.sin, cos = Math.cos;

ref = require('../../constants'), TILE_SIZE_PIXELS = ref.TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD = ref.PIXEL_SIZE_WORLD;

ref1 = require('../../helpers'), distance = ref1.distance, heading = ref1.heading;

BaseRenderer = require('./base');

TEAM_COLORS = require('../../team_colors');

Common2dRenderer = (function(superClass) {
  extend(Common2dRenderer, superClass);

  function Common2dRenderer() {
    return Common2dRenderer.__super__.constructor.apply(this, arguments);
  }

  Common2dRenderer.prototype.setup = function() {
    var ctx, e, imageData, img, temp;
    try {
      this.ctx = this.canvas[0].getContext('2d');
      this.ctx.drawImage;
    } catch (error) {
      e = error;
      throw "Could not initialize 2D canvas: " + e.message;
    }
    img = this.images.overlay;
    temp = $('<canvas/>')[0];
    temp.width = img.width;
    temp.height = img.height;
    ctx = temp.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(img, 0, 0);
    imageData = ctx.getImageData(0, 0, img.width, img.height);
    this.overlay = imageData.data;
    return this.prestyled = {};
  };

  Common2dRenderer.prototype.drawTile = function(tx, ty, dx, dy, ctx) {
    return (ctx || this.ctx).drawImage(this.images.base, tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, dx, dy, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
  };

  Common2dRenderer.prototype.createPrestyled = function(color) {
    var base, ctx, data, factor, height, i, imageData, j, k, ref2, ref3, source, width, x, y;
    base = this.images.styled;
    width = base.width, height = base.height;
    source = $('<canvas/>')[0];
    source.width = width;
    source.height = height;
    ctx = source.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(base, 0, 0);
    imageData = ctx.getImageData(0, 0, width, height);
    data = imageData.data;
    for (x = j = 0, ref2 = width; 0 <= ref2 ? j < ref2 : j > ref2; x = 0 <= ref2 ? ++j : --j) {
      for (y = k = 0, ref3 = height; 0 <= ref3 ? k < ref3 : k > ref3; y = 0 <= ref3 ? ++k : --k) {
        i = 4 * (y * width + x);
        factor = this.overlay[i] / 255;
        data[i + 0] = round(factor * color.r + (1 - factor) * data[i + 0]);
        data[i + 1] = round(factor * color.g + (1 - factor) * data[i + 1]);
        data[i + 2] = round(factor * color.b + (1 - factor) * data[i + 2]);
        data[i + 3] = min(255, data[i + 3] + this.overlay[i]);
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return source;
  };

  Common2dRenderer.prototype.drawStyledTile = function(tx, ty, style, dx, dy, ctx) {
    var color, source;
    if (!(source = this.prestyled[style])) {
      source = (color = TEAM_COLORS[style]) ? this.prestyled[style] = this.createPrestyled(color) : this.images.styled;
    }
    return (ctx || this.ctx).drawImage(source, tx * TILE_SIZE_PIXELS, ty * TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS, dx, dy, TILE_SIZE_PIXELS, TILE_SIZE_PIXELS);
  };

  Common2dRenderer.prototype.centerOn = function(x, y, cb) {
    var height, left, ref2, top, width;
    this.ctx.save();
    ref2 = this.getViewAreaAtWorld(x, y), left = ref2[0], top = ref2[1], width = ref2[2], height = ref2[3];
    this.ctx.translate(-left, -top);
    cb(left, top, width, height);
    return this.ctx.restore();
  };

  Common2dRenderer.prototype.drawBuilderIndicator = function(b) {
    var dist, offset, player, px, py, rad, x, y;
    player = b.owner.$;
    if ((dist = distance(player, b)) <= 128) {
      return;
    }
    px = player.x / PIXEL_SIZE_WORLD;
    py = player.y / PIXEL_SIZE_WORLD;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = min(1.0, (dist - 128) / 1024);
    offset = min(50, dist / 10240 * 50) + 32;
    rad = heading(player, b);
    this.ctx.beginPath();
    this.ctx.moveTo(x = px + cos(rad) * offset, y = py + sin(rad) * offset);
    rad += PI;
    this.ctx.lineTo(x + cos(rad - 0.4) * 10, y + sin(rad - 0.4) * 10);
    this.ctx.lineTo(x + cos(rad + 0.4) * 10, y + sin(rad + 0.4) * 10);
    this.ctx.closePath();
    this.ctx.fillStyle = 'yellow';
    this.ctx.fill();
    return this.ctx.restore();
  };

  Common2dRenderer.prototype.drawNames = function() {
    var dist, j, len, metrics, player, ref2, tank, x, y;
    this.ctx.save();
    this.ctx.strokeStyle = this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textBaselines = 'alphabetic';
    this.ctx.textAlign = 'left';
    player = this.world.player;
    ref2 = this.world.tanks;
    for (j = 0, len = ref2.length; j < len; j++) {
      tank = ref2[j];
      if (!(tank.name && tank.armour !== 255 && tank !== player)) {
        continue;
      }
      if (player) {
        if ((dist = distance(player, tank)) <= 768) {
          continue;
        }
        this.ctx.globalAlpha = min(1.0, (dist - 768) / 1536);
      } else {
        this.ctx.globalAlpha = 1.0;
      }
      metrics = this.ctx.measureText(tank.name);
      this.ctx.beginPath();
      this.ctx.moveTo(x = round(tank.x / PIXEL_SIZE_WORLD) + 16, y = round(tank.y / PIXEL_SIZE_WORLD) - 16);
      this.ctx.lineTo(x += 12, y -= 9);
      this.ctx.lineTo(x + metrics.width, y);
      this.ctx.stroke();
      this.ctx.fillText(tank.name, x, y - 2);
    }
    return this.ctx.restore();
  };

  return Common2dRenderer;

})(BaseRenderer);

module.exports = Common2dRenderer;


},{"../../constants":22,"../../helpers":23,"../../team_colors":39,"./base":14}],16:[function(require,module,exports){
var CachedSegment, Common2dRenderer, MAP_SIZE_SEGMENTS, MAP_SIZE_TILES, Offscreen2dRenderer, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_TILES, TILE_SIZE_PIXELS, floor, ref,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

floor = Math.floor;

ref = require('../../constants'), TILE_SIZE_PIXELS = ref.TILE_SIZE_PIXELS, MAP_SIZE_TILES = ref.MAP_SIZE_TILES;

Common2dRenderer = require('./common_2d');

SEGMENT_SIZE_TILES = 16;

MAP_SIZE_SEGMENTS = MAP_SIZE_TILES / SEGMENT_SIZE_TILES;

SEGMENT_SIZE_PIXEL = SEGMENT_SIZE_TILES * TILE_SIZE_PIXELS;

CachedSegment = (function() {
  function CachedSegment(renderer, x, y) {
    this.renderer = renderer;
    this.sx = x * SEGMENT_SIZE_TILES;
    this.sy = y * SEGMENT_SIZE_TILES;
    this.ex = this.sx + SEGMENT_SIZE_TILES - 1;
    this.ey = this.sy + SEGMENT_SIZE_TILES - 1;
    this.psx = x * SEGMENT_SIZE_PIXEL;
    this.psy = y * SEGMENT_SIZE_PIXEL;
    this.pex = this.psx + SEGMENT_SIZE_PIXEL - 1;
    this.pey = this.psy + SEGMENT_SIZE_PIXEL - 1;
    this.canvas = null;
  }

  CachedSegment.prototype.isInView = function(sx, sy, ex, ey) {
    if (ex < this.psx || ey < this.psy) {
      return false;
    } else if (sx > this.pex || sy > this.pey) {
      return false;
    } else {
      return true;
    }
  };

  CachedSegment.prototype.build = function() {
    this.canvas = $('<canvas/>')[0];
    this.canvas.width = this.canvas.height = SEGMENT_SIZE_PIXEL;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.translate(-this.psx, -this.psy);
    return this.renderer.world.map.each((function(_this) {
      return function(cell) {
        return _this.onRetile(cell, cell.tile[0], cell.tile[1]);
      };
    })(this), this.sx, this.sy, this.ex, this.ey);
  };

  CachedSegment.prototype.clear = function() {
    return this.canvas = this.ctx = null;
  };

  CachedSegment.prototype.onRetile = function(cell, tx, ty) {
    var obj, ref1;
    if (!this.canvas) {
      return;
    }
    if (obj = cell.pill || cell.base) {
      return this.renderer.drawStyledTile(cell.tile[0], cell.tile[1], (ref1 = obj.owner) != null ? ref1.$.team : void 0, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS, this.ctx);
    } else {
      return this.renderer.drawTile(cell.tile[0], cell.tile[1], cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS, this.ctx);
    }
  };

  return CachedSegment;

})();

Offscreen2dRenderer = (function(superClass) {
  extend(Offscreen2dRenderer, superClass);

  function Offscreen2dRenderer() {
    return Offscreen2dRenderer.__super__.constructor.apply(this, arguments);
  }

  Offscreen2dRenderer.prototype.setup = function() {
    var i, ref1, results, row, x, y;
    Offscreen2dRenderer.__super__.setup.apply(this, arguments);
    this.cache = new Array(MAP_SIZE_SEGMENTS);
    results = [];
    for (y = i = 0, ref1 = MAP_SIZE_SEGMENTS; 0 <= ref1 ? i < ref1 : i > ref1; y = 0 <= ref1 ? ++i : --i) {
      row = this.cache[y] = new Array(MAP_SIZE_SEGMENTS);
      results.push((function() {
        var j, ref2, results1;
        results1 = [];
        for (x = j = 0, ref2 = MAP_SIZE_SEGMENTS; 0 <= ref2 ? j < ref2 : j > ref2; x = 0 <= ref2 ? ++j : --j) {
          results1.push(row[x] = new CachedSegment(this, x, y));
        }
        return results1;
      }).call(this));
    }
    return results;
  };

  Offscreen2dRenderer.prototype.onRetile = function(cell, tx, ty) {
    var segx, segy;
    cell.tile = [tx, ty];
    segx = floor(cell.x / SEGMENT_SIZE_TILES);
    segy = floor(cell.y / SEGMENT_SIZE_TILES);
    return this.cache[segy][segx].onRetile(cell, tx, ty);
  };

  Offscreen2dRenderer.prototype.drawMap = function(sx, sy, w, h) {
    var alreadyBuiltOne, ex, ey, i, j, len, len1, ref1, row, segment;
    ex = sx + w - 1;
    ey = sy + h - 1;
    alreadyBuiltOne = false;
    ref1 = this.cache;
    for (i = 0, len = ref1.length; i < len; i++) {
      row = ref1[i];
      for (j = 0, len1 = row.length; j < len1; j++) {
        segment = row[j];
        if (!segment.isInView(sx, sy, ex, ey)) {
          if (segment.canvas) {
            segment.clear();
          }
          continue;
        }
        if (!segment.canvas) {
          if (alreadyBuiltOne) {
            continue;
          }
          segment.build();
          alreadyBuiltOne = true;
        }
        this.ctx.drawImage(segment.canvas, 0, 0, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL, segment.psx, segment.psy, SEGMENT_SIZE_PIXEL, SEGMENT_SIZE_PIXEL);
      }
    }
  };

  return Offscreen2dRenderer;

})(Common2dRenderer);

module.exports = Offscreen2dRenderer;


},{"../../constants":22,"./common_2d":15}],17:[function(require,module,exports){
var SoundKit;

SoundKit = (function() {
  function SoundKit() {
    var dummy;
    this.sounds = {};
    this.isSupported = false;
    if (typeof Audio !== "undefined" && Audio !== null) {
      dummy = new Audio();
      this.isSupported = dummy.canPlayType != null;
    }
  }

  SoundKit.prototype.register = function(name, url) {
    this.sounds[name] = url;
    return this[name] = (function(_this) {
      return function() {
        return _this.play(name);
      };
    })(this);
  };

  SoundKit.prototype.load = function(name, url, cb) {
    var loader;
    this.register(name, url);
    if (!this.isSupported) {
      return typeof cb === "function" ? cb() : void 0;
    }
    loader = new Audio();
    if (cb) {
      $(loader).one('canplaythrough', cb);
    }
    $(loader).one('error', (function(_this) {
      return function(e) {
        switch (e.code) {
          case e.MEDIA_ERR_SRC_NOT_SUPPORTED:
            _this.isSupported = false;
            return typeof cb === "function" ? cb() : void 0;
        }
      };
    })(this));
    loader.src = url;
    return loader.load();
  };

  SoundKit.prototype.play = function(name) {
    var effect;
    if (!this.isSupported) {
      return;
    }
    effect = new Audio();
    effect.src = this.sounds[name];
    effect.play();
    return effect;
  };

  return SoundKit;

})();

module.exports = SoundKit;


},{}],18:[function(require,module,exports){
var Vignette;

Vignette = (function() {
  function Vignette() {
    this.container = $('<div class="vignette"/>').appendTo('body');
    this.messageLine = $('<div class="vignette-message"/>').appendTo(this.container);
  }

  Vignette.prototype.message = function(text) {
    return this.messageLine.text(text);
  };

  Vignette.prototype.showProgress = function() {};

  Vignette.prototype.hideProgress = function() {};

  Vignette.prototype.progress = function(p) {};

  Vignette.prototype.destroy = function() {
    this.container.remove();
    return this.container = this.messageLine = null;
  };

  return Vignette;

})();

module.exports = Vignette;


},{}],19:[function(require,module,exports){
var BoloClientWorld, ClientWorld, JOIN_DIALOG_TEMPLATE, WorldBase, WorldMap, WorldPillbox, allObjects, decodeBase64, helpers, net, unpack,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

ClientWorld = require('villain/world/net/client');

WorldMap = require('../../world_map');

allObjects = require('../../objects/all');

WorldPillbox = require('../../objects/world_pillbox');

WorldBase = require('../../objects/world_base');

unpack = require('../../struct').unpack;

decodeBase64 = require('../base64').decodeBase64;

net = require('../../net');

helpers = require('../../helpers');

JOIN_DIALOG_TEMPLATE = "<div id=\"join-dialog\">\n  <div>\n    <p>What is your name?</p>\n    <p><input type=\"text\" id=\"join-nick-field\" name=\"join-nick-field\" maxlength=20></input></p>\n  </div>\n  <div id=\"join-team\">\n    <p>Choose a side:</p>\n    <p>\n      <input type=\"radio\" id=\"join-team-red\" name=\"join-team\" value=\"red\"></input>\n      <label for=\"join-team-red\"><span class=\"bolo-team bolo-team-red\"></span></label>\n      <input type=\"radio\" id=\"join-team-blue\" name=\"join-team\" value=\"blue\"></input>\n      <label for=\"join-team-blue\"><span class=\"bolo-team bolo-team-blue\"></span></label>\n    </p>\n  </div>\n  <div>\n    <p><input type=\"button\" name=\"join-submit\" id=\"join-submit\" value=\"Join game\"></input></p>\n  </div>\n</div>";

BoloClientWorld = (function(superClass) {
  extend(BoloClientWorld, superClass);

  BoloClientWorld.prototype.authority = false;

  function BoloClientWorld() {
    BoloClientWorld.__super__.constructor.apply(this, arguments);
    this.mapChanges = {};
    this.processingServerMessages = false;
  }

  BoloClientWorld.prototype.loaded = function(vignette) {
    var m, path, protocol, ws;
    this.vignette = vignette;
    this.vignette.message('Connecting to the multiplayer game');
    this.heartbeatTimer = 0;
    if (m = /^\?([a-z]{20})$/.exec(location.search)) {
      path = "/match/" + m[1];
    } else if (location.search) {
      return this.vignette.message('Invalid game ID');
    } else {
      path = "/demo";
    }
    protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(protocol + "//" + location.host + path);
    ws = $(this.ws);
    ws.one('open.bolo', (function(_this) {
      return function() {
        return _this.connected();
      };
    })(this));
    return ws.one('close.bolo', (function(_this) {
      return function() {
        return _this.failure('Connection lost');
      };
    })(this));
  };

  BoloClientWorld.prototype.connected = function() {
    var ws;
    this.vignette.message('Waiting for the game map');
    ws = $(this.ws);
    return ws.one('message.bolo', (function(_this) {
      return function(e) {
        return _this.receiveMap(e.originalEvent);
      };
    })(this));
  };

  BoloClientWorld.prototype.receiveMap = function(e) {
    this.map = WorldMap.load(decodeBase64(e.data));
    this.commonInitialization();
    this.vignette.message('Waiting for the game state');
    return $(this.ws).bind('message.bolo', (function(_this) {
      return function(e) {
        return _this.handleMessage(e.originalEvent);
      };
    })(this));
  };

  BoloClientWorld.prototype.synchronized = function() {
    var blue, disadvantaged, i, len, red, ref, tank;
    this.rebuildMapObjects();
    this.vignette.destroy();
    this.vignette = null;
    this.loop.start();
    red = blue = 0;
    ref = this.tanks;
    for (i = 0, len = ref.length; i < len; i++) {
      tank = ref[i];
      if (tank.team === 0) {
        red++;
      }
      if (tank.team === 1) {
        blue++;
      }
    }
    disadvantaged = blue < red ? 'blue' : 'red';
    this.joinDialog = $(JOIN_DIALOG_TEMPLATE).dialog({
      dialogClass: 'unclosable'
    });
    return this.joinDialog.find('#join-nick-field').val($.cookie('nick') || '').focus().keydown((function(_this) {
      return function(e) {
        if (e.which === 13) {
          return _this.join();
        }
      };
    })(this)).end().find("#join-team-" + disadvantaged).attr('checked', 'checked').end().find("#join-team").buttonset().end().find('#join-submit').button().click((function(_this) {
      return function() {
        return _this.join();
      };
    })(this));
  };

  BoloClientWorld.prototype.join = function() {
    var nick, team;
    nick = this.joinDialog.find('#join-nick-field').val();
    team = this.joinDialog.find('#join-team input[checked]').val();
    team = (function() {
      switch (team) {
        case 'red':
          return 0;
        case 'blue':
          return 1;
        default:
          return -1;
      }
    })();
    if (!(nick && team !== -1)) {
      return;
    }
    $.cookie('nick', nick);
    this.joinDialog.dialog('destroy');
    this.joinDialog = null;
    this.ws.send(JSON.stringify({
      command: 'join',
      nick: nick,
      team: team
    }));
    return this.input.focus();
  };

  BoloClientWorld.prototype.receiveWelcome = function(tank) {
    this.player = tank;
    this.renderer.initHud();
    return this.initChat();
  };

  BoloClientWorld.prototype.tick = function() {
    BoloClientWorld.__super__.tick.apply(this, arguments);
    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) {
          this.ws.send(net.INC_RANGE);
        } else {
          this.ws.send(net.DEC_RANGE);
        }
        this.rangeAdjustTimer = 0;
      }
    } else {
      this.rangeAdjustTimer = 0;
    }
    if (++this.heartbeatTimer === 10) {
      this.heartbeatTimer = 0;
      return this.ws.send('');
    }
  };

  BoloClientWorld.prototype.failure = function(message) {
    if (this.ws) {
      this.ws.close();
      $(this.ws).unbind('.bolo');
      this.ws = null;
    }
    return BoloClientWorld.__super__.failure.apply(this, arguments);
  };

  BoloClientWorld.prototype.soundEffect = function(sfx, x, y, owner) {};

  BoloClientWorld.prototype.mapChanged = function(cell, oldType, hadMine, oldLife) {
    if (this.processingServerMessages) {
      return;
    }
    if (this.mapChanges[cell.idx] == null) {
      cell._net_oldType = oldType;
      cell._net_hadMine = hadMine;
      cell._net_oldLife = oldLife;
      this.mapChanges[cell.idx] = cell;
    }
  };

  BoloClientWorld.prototype.initChat = function() {
    this.chatMessages = $('<div/>', {
      id: 'chat-messages'
    }).appendTo(this.renderer.hud);
    this.chatContainer = $('<div/>', {
      id: 'chat-input'
    }).appendTo(this.renderer.hud).hide();
    return this.chatInput = $('<input/>', {
      type: 'text',
      name: 'chat',
      maxlength: 140
    }).appendTo(this.chatContainer).keydown((function(_this) {
      return function(e) {
        return _this.handleChatKeydown(e);
      };
    })(this));
  };

  BoloClientWorld.prototype.openChat = function(options) {
    options || (options = {});
    this.chatContainer.show();
    return this.chatInput.val('').focus().team = options.team;
  };

  BoloClientWorld.prototype.commitChat = function() {
    this.ws.send(JSON.stringify({
      command: this.chatInput.team ? 'teamMsg' : 'msg',
      text: this.chatInput.val()
    }));
    return this.closeChat();
  };

  BoloClientWorld.prototype.closeChat = function() {
    this.chatContainer.hide();
    return this.input.focus();
  };

  BoloClientWorld.prototype.receiveChat = function(who, text, options) {
    var element;
    options || (options = {});
    element = options.team ? $('<p/>', {
      "class": 'msg-team'
    }).text("<" + who.name + "> " + text) : $('<p/>', {
      "class": 'msg'
    }).text("<" + who.name + "> " + text);
    this.chatMessages.append(element);
    return window.setTimeout((function(_this) {
      return function() {
        return element.remove();
      };
    })(this), 7000);
  };

  BoloClientWorld.prototype.handleKeydown = function(e) {
    if (!(this.ws && this.player)) {
      return;
    }
    switch (e.which) {
      case 32:
        return this.ws.send(net.START_SHOOTING);
      case 37:
        return this.ws.send(net.START_TURNING_CCW);
      case 38:
        return this.ws.send(net.START_ACCELERATING);
      case 39:
        return this.ws.send(net.START_TURNING_CW);
      case 40:
        return this.ws.send(net.START_BRAKING);
      case 84:
        return this.openChat();
      case 82:
        return this.openChat({
          team: true
        });
    }
  };

  BoloClientWorld.prototype.handleKeyup = function(e) {
    if (!(this.ws && this.player)) {
      return;
    }
    switch (e.which) {
      case 32:
        return this.ws.send(net.STOP_SHOOTING);
      case 37:
        return this.ws.send(net.STOP_TURNING_CCW);
      case 38:
        return this.ws.send(net.STOP_ACCELERATING);
      case 39:
        return this.ws.send(net.STOP_TURNING_CW);
      case 40:
        return this.ws.send(net.STOP_BRAKING);
    }
  };

  BoloClientWorld.prototype.handleChatKeydown = function(e) {
    if (!(this.ws && this.player)) {
      return;
    }
    switch (e.which) {
      case 13:
        this.commitChat();
        break;
      case 27:
        this.closeChat();
        break;
      default:
        return;
    }
    return e.preventDefault();
  };

  BoloClientWorld.prototype.buildOrder = function(action, trees, cell) {
    if (!(this.ws && this.player)) {
      return;
    }
    trees || (trees = 0);
    return this.ws.send([net.BUILD_ORDER, action, trees, cell.x, cell.y].join(','));
  };

  BoloClientWorld.prototype.handleMessage = function(e) {
    var ate, command, data, error, i, len, length, message, pos, ref;
    error = null;
    if (e.data.charAt(0) === '{') {
      try {
        this.handleJsonCommand(JSON.parse(e.data));
      } catch (error1) {
        e = error1;
        error = e;
      }
    } else if (e.data.charAt(0) === '[') {
      try {
        ref = JSON.parse(e.data);
        for (i = 0, len = ref.length; i < len; i++) {
          message = ref[i];
          this.handleJsonCommand(message);
        }
      } catch (error1) {
        e = error1;
        error = e;
      }
    } else {
      this.netRestore();
      try {
        data = decodeBase64(e.data);
        pos = 0;
        length = data.length;
        this.processingServerMessages = true;
        while (pos < length) {
          command = data[pos++];
          ate = this.handleBinaryCommand(command, data, pos);
          pos += ate;
        }
        this.processingServerMessages = false;
        if (pos !== length) {
          error = new Error("Message length mismatch, processed " + pos + " out of " + length + " bytes");
        }
      } catch (error1) {
        e = error1;
        error = e;
      }
    }
    if (error) {
      this.failure('Connection lost (protocol error)');
      if (typeof console !== "undefined" && console !== null) {
        console.log("Following exception occurred while processing message:", e.data);
      }
      throw error;
    }
  };

  BoloClientWorld.prototype.handleBinaryCommand = function(command, data, offset) {
    var ascii, bytes, cell, code, idx, life, mine, owner, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7, sfx, tank_idx, x, y;
    switch (command) {
      case net.SYNC_MESSAGE:
        this.synchronized();
        return 0;
      case net.WELCOME_MESSAGE:
        ref = unpack('H', data, offset), (ref1 = ref[0], tank_idx = ref1[0]), bytes = ref[1];
        this.receiveWelcome(this.objects[tank_idx]);
        return bytes;
      case net.CREATE_MESSAGE:
        return this.netSpawn(data, offset);
      case net.DESTROY_MESSAGE:
        return this.netDestroy(data, offset);
      case net.MAPCHANGE_MESSAGE:
        ref2 = unpack('BBBBf', data, offset), (ref3 = ref2[0], x = ref3[0], y = ref3[1], code = ref3[2], life = ref3[3], mine = ref3[4]), bytes = ref2[1];
        ascii = String.fromCharCode(code);
        cell = this.map.cells[y][x];
        cell.setType(ascii, mine);
        cell.life = life;
        return bytes;
      case net.SOUNDEFFECT_MESSAGE:
        ref4 = unpack('BHHH', data, offset), (ref5 = ref4[0], sfx = ref5[0], x = ref5[1], y = ref5[2], owner = ref5[3]), bytes = ref4[1];
        this.renderer.playSound(sfx, x, y, this.objects[owner]);
        return bytes;
      case net.TINY_UPDATE_MESSAGE:
        ref6 = unpack('H', data, offset), (ref7 = ref6[0], idx = ref7[0]), bytes = ref6[1];
        bytes += this.netUpdate(this.objects[idx], data, offset + bytes);
        return bytes;
      case net.UPDATE_MESSAGE:
        return this.netTick(data, offset);
      default:
        throw new Error("Bad command '" + command + "' from server, at offset " + (offset - 1));
    }
  };

  BoloClientWorld.prototype.handleJsonCommand = function(data) {
    switch (data.command) {
      case 'nick':
        return this.objects[data.idx].name = data.nick;
      case 'msg':
        return this.receiveChat(this.objects[data.idx], data.text);
      case 'teamMsg':
        return this.receiveChat(this.objects[data.idx], data.text, {
          team: true
        });
      default:
        throw new Error("Bad JSON command '" + data.command + "' from server.");
    }
  };

  BoloClientWorld.prototype.rebuildMapObjects = function() {
    var i, len, obj, ref, ref1;
    this.map.pills = [];
    this.map.bases = [];
    ref = this.objects;
    for (i = 0, len = ref.length; i < len; i++) {
      obj = ref[i];
      if (obj instanceof WorldPillbox) {
        this.map.pills.push(obj);
      } else if (obj instanceof WorldBase) {
        this.map.bases.push(obj);
      } else {
        continue;
      }
      if ((ref1 = obj.cell) != null) {
        ref1.retile();
      }
    }
  };

  BoloClientWorld.prototype.netRestore = function() {
    var cell, idx, ref;
    BoloClientWorld.__super__.netRestore.apply(this, arguments);
    ref = this.mapChanges;
    for (idx in ref) {
      cell = ref[idx];
      cell.setType(cell._net_oldType, cell._net_hadMine);
      cell.life = cell._net_oldLife;
    }
    return this.mapChanges = {};
  };

  return BoloClientWorld;

})(ClientWorld);

helpers.extend(BoloClientWorld.prototype, require('./mixin'));

allObjects.registerWithWorld(BoloClientWorld.prototype);

module.exports = BoloClientWorld;


},{"../../helpers":23,"../../net":25,"../../objects/all":27,"../../objects/world_base":35,"../../objects/world_pillbox":36,"../../struct":38,"../../world_map":40,"../base64":10,"./mixin":21,"villain/world/net/client":6}],20:[function(require,module,exports){
var BoloLocalWorld, EverardIsland, NetLocalWorld, Tank, WorldMap, allObjects, decodeBase64, helpers,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

NetLocalWorld = require('villain/world/net/local');

WorldMap = require('../../world_map');

EverardIsland = require('../everard');

allObjects = require('../../objects/all');

Tank = require('../../objects/tank');

decodeBase64 = require('../base64').decodeBase64;

helpers = require('../../helpers');

BoloLocalWorld = (function(superClass) {
  extend(BoloLocalWorld, superClass);

  function BoloLocalWorld() {
    return BoloLocalWorld.__super__.constructor.apply(this, arguments);
  }

  BoloLocalWorld.prototype.authority = true;

  BoloLocalWorld.prototype.loaded = function(vignette) {
    this.map = WorldMap.load(decodeBase64(EverardIsland));
    this.commonInitialization();
    this.spawnMapObjects();
    this.player = this.spawn(Tank, 0);
    this.renderer.initHud();
    vignette.destroy();
    return this.loop.start();
  };

  BoloLocalWorld.prototype.tick = function() {
    BoloLocalWorld.__super__.tick.apply(this, arguments);
    if (this.increasingRange !== this.decreasingRange) {
      if (++this.rangeAdjustTimer === 6) {
        if (this.increasingRange) {
          this.player.increaseRange();
        } else {
          this.player.decreaseRange();
        }
        return this.rangeAdjustTimer = 0;
      }
    } else {
      return this.rangeAdjustTimer = 0;
    }
  };

  BoloLocalWorld.prototype.soundEffect = function(sfx, x, y, owner) {
    return this.renderer.playSound(sfx, x, y, owner);
  };

  BoloLocalWorld.prototype.mapChanged = function(cell, oldType, hadMine, oldLife) {};

  BoloLocalWorld.prototype.handleKeydown = function(e) {
    switch (e.which) {
      case 32:
        return this.player.shooting = true;
      case 37:
        return this.player.turningCounterClockwise = true;
      case 38:
        return this.player.accelerating = true;
      case 39:
        return this.player.turningClockwise = true;
      case 40:
        return this.player.braking = true;
    }
  };

  BoloLocalWorld.prototype.handleKeyup = function(e) {
    switch (e.which) {
      case 32:
        return this.player.shooting = false;
      case 37:
        return this.player.turningCounterClockwise = false;
      case 38:
        return this.player.accelerating = false;
      case 39:
        return this.player.turningClockwise = false;
      case 40:
        return this.player.braking = false;
    }
  };

  BoloLocalWorld.prototype.buildOrder = function(action, trees, cell) {
    return this.player.builder.$.performOrder(action, trees, cell);
  };

  return BoloLocalWorld;

})(NetLocalWorld);

helpers.extend(BoloLocalWorld.prototype, require('./mixin'));

allObjects.registerWithWorld(BoloLocalWorld.prototype);

module.exports = BoloLocalWorld;


},{"../../helpers":23,"../../objects/all":27,"../../objects/tank":34,"../../world_map":40,"../base64":10,"../everard":11,"./mixin":21,"villain/world/net/local":7}],21:[function(require,module,exports){
var BoloClientWorldMixin, BoloWorldMixin, DefaultRenderer, Progress, SoundKit, TICK_LENGTH_MS, Vignette, createLoop, helpers;

createLoop = require('villain/loop').createLoop;

Progress = require('../progress');

Vignette = require('../vignette');

SoundKit = require('../soundkit');

DefaultRenderer = require('../renderer/offscreen_2d');

TICK_LENGTH_MS = require('../../constants').TICK_LENGTH_MS;

helpers = require('../../helpers');

BoloWorldMixin = require('../../world_mixin');

BoloClientWorldMixin = {
  start: function() {
    var vignette;
    vignette = new Vignette();
    return this.waitForCache(vignette, (function(_this) {
      return function() {
        return _this.loadResources(vignette, function() {
          return _this.loaded(vignette);
        });
      };
    })(this));
  },
  waitForCache: function(vignette, callback) {
    var afterCache, cache;
    return callback();
    vignette.message('Checking for newer versions');
    cache = $(applicationCache);
    cache.bind('downloading.bolo', function() {
      vignette.message('Downloading latest version');
      vignette.showProgress();
      return cache.bind('progress.bolo', function(p) {
        return vignette.progress(p);
      });
    });
    cache.bind('updateready.bolo', function() {
      vignette.hideProgress();
      vignette.message('Reloading latest version');
      return location.reload();
    });
    afterCache = function() {
      vignette.hideProgress();
      cache.unbind('.bolo');
      return callback();
    };
    cache.bind('cached.bolo', afterCache);
    return cache.bind('noupdate.bolo', afterCache);
  },
  loadResources: function(vignette, callback) {
    var progress;
    vignette.message('Loading resources');
    progress = new Progress();
    this.images = {};
    this.loadImages((function(_this) {
      return function(name) {
        var img;
        _this.images[name] = img = new Image();
        $(img).load(progress.add());
        return img.src = "images/" + name + ".png";
      };
    })(this));
    this.soundkit = new SoundKit();
    this.loadSounds((function(_this) {
      return function(name) {
        var i, j, methodName, parts, ref, src;
        src = "sounds/" + name + ".ogg";
        parts = name.split('_');
        for (i = j = 1, ref = parts.length; 1 <= ref ? j < ref : j > ref; i = 1 <= ref ? ++j : --j) {
          parts[i] = parts[i].substr(0, 1).toUpperCase() + parts[i].substr(1);
        }
        methodName = parts.join('');
        return _this.soundkit.load(methodName, src, progress.add());
      };
    })(this));
    if (typeof applicationCache === "undefined" || applicationCache === null) {
      vignette.showProgress();
      progress.on('progress', function(p) {
        return vignette.progress(p);
      });
    }
    progress.on('complete', function() {
      vignette.hideProgress();
      return callback();
    });
    return progress.wrapUp();
  },
  loadImages: function(i) {
    i('base');
    i('styled');
    return i('overlay');
  },
  loadSounds: function(s) {
    s('big_explosion_far');
    s('big_explosion_near');
    s('bubbles');
    s('farming_tree_far');
    s('farming_tree_near');
    s('hit_tank_far');
    s('hit_tank_near');
    s('hit_tank_self');
    s('man_building_far');
    s('man_building_near');
    s('man_dying_far');
    s('man_dying_near');
    s('man_lay_mine_near');
    s('mine_explosion_far');
    s('mine_explosion_near');
    s('shooting_far');
    s('shooting_near');
    s('shooting_self');
    s('shot_building_far');
    s('shot_building_near');
    s('shot_tree_far');
    s('shot_tree_near');
    s('tank_sinking_far');
    return s('tank_sinking_near');
  },
  commonInitialization: function() {
    this.renderer = new DefaultRenderer(this);
    this.map.world = this;
    this.map.setView(this.renderer);
    this.boloInit();
    this.loop = createLoop({
      rate: TICK_LENGTH_MS,
      tick: (function(_this) {
        return function() {
          return _this.tick();
        };
      })(this),
      frame: (function(_this) {
        return function() {
          return _this.renderer.draw();
        };
      })(this)
    });
    this.increasingRange = false;
    this.decreasingRange = false;
    this.rangeAdjustTimer = 0;
    this.input = $('<input/>', {
      id: 'input-dummy',
      type: 'text',
      autocomplete: 'off'
    });
    this.input.insertBefore(this.renderer.canvas).focus();
    return this.input.add(this.renderer.canvas).add('#tool-select label').keydown((function(_this) {
      return function(e) {
        e.preventDefault();
        switch (e.which) {
          case 90:
            return _this.increasingRange = true;
          case 88:
            return _this.decreasingRange = true;
          default:
            return _this.handleKeydown(e);
        }
      };
    })(this)).keyup((function(_this) {
      return function(e) {
        e.preventDefault();
        switch (e.which) {
          case 90:
            return _this.increasingRange = false;
          case 88:
            return _this.decreasingRange = false;
          default:
            return _this.handleKeyup(e);
        }
      };
    })(this));
  },
  failure: function(message) {
    var ref;
    if ((ref = this.loop) != null) {
      ref.stop();
    }
    return $('<div/>').text(message).dialog({
      modal: true,
      dialogClass: 'unclosable'
    });
  },
  checkBuildOrder: function(action, cell) {
    var builder, flexible, pills, ref, trees;
    builder = this.player.builder.$;
    if (builder.order !== builder.states.inTank) {
      return [false];
    }
    if (cell.mine) {
      return [false];
    }
    ref = (function() {
      switch (action) {
        case 'forest':
          if (cell.base || cell.pill || !cell.isType('#')) {
            return [false];
          } else {
            return ['forest', 0];
          }
          break;
        case 'road':
          if (cell.base || cell.pill || cell.isType('|', '}', 'b', '^')) {
            return [false];
          } else if (cell.isType('#')) {
            return ['forest', 0];
          } else if (cell.isType('=')) {
            return [false];
          } else if (cell.isType(' ') && cell.hasTankOnBoat()) {
            return [false];
          } else {
            return ['road', 2];
          }
          break;
        case 'building':
          if (cell.base || cell.pill || cell.isType('b', '^')) {
            return [false];
          } else if (cell.isType('#')) {
            return ['forest', 0];
          } else if (cell.isType('}')) {
            return ['repair', 1];
          } else if (cell.isType('|')) {
            return [false];
          } else if (cell.isType(' ')) {
            if (cell.hasTankOnBoat()) {
              return [false];
            } else {
              return ['boat', 20];
            }
          } else if (cell === this.player.cell) {
            return [false];
          } else {
            return ['building', 2];
          }
          break;
        case 'pillbox':
          if (cell.pill) {
            if (cell.pill.armour === 16) {
              return [false];
            } else if (cell.pill.armour >= 11) {
              return ['repair', 1, true];
            } else if (cell.pill.armour >= 7) {
              return ['repair', 2, true];
            } else if (cell.pill.armour >= 3) {
              return ['repair', 3, true];
            } else if (cell.pill.armour < 3) {
              return ['repair', 4, true];
            }
          } else if (cell.isType('#')) {
            return ['forest', 0];
          } else if (cell.base || cell.isType('b', '^', '|', '}', ' ')) {
            return [false];
          } else if (cell === this.player.cell) {
            return [false];
          } else {
            return ['pillbox', 4];
          }
          break;
        case 'mine':
          if (cell.base || cell.pill || cell.isType('^', ' ', '|', 'b', '}')) {
            return [false];
          } else {
            return ['mine'];
          }
      }
    }).call(this), action = ref[0], trees = ref[1], flexible = ref[2];
    if (!action) {
      return [false];
    }
    if (action === 'mine') {
      if (this.player.mines === 0) {
        return [false];
      }
      return ['mine'];
    }
    if (action === 'pill') {
      pills = this.player.getCarryingPillboxes();
      if (pills.length === 0) {
        return [false];
      }
    }
    if (this.player.trees < trees) {
      if (!flexible) {
        return [false];
      }
      trees = this.player.trees;
    }
    return [action, trees, flexible];
  }
};

helpers.extend(BoloClientWorldMixin, BoloWorldMixin);

module.exports = BoloClientWorldMixin;


},{"../../constants":22,"../../helpers":23,"../../world_mixin":41,"../progress":13,"../renderer/offscreen_2d":16,"../soundkit":17,"../vignette":18,"villain/loop":3}],22:[function(require,module,exports){
exports.PIXEL_SIZE_WORLD = 8;

exports.TILE_SIZE_PIXELS = 32;

exports.TILE_SIZE_WORLD = exports.TILE_SIZE_PIXELS * exports.PIXEL_SIZE_WORLD;

exports.MAP_SIZE_TILES = 256;

exports.MAP_SIZE_PIXELS = exports.MAP_SIZE_TILES * exports.TILE_SIZE_PIXELS;

exports.MAP_SIZE_WORLD = exports.MAP_SIZE_TILES * exports.TILE_SIZE_WORLD;

exports.TICK_LENGTH_MS = 20;


},{}],23:[function(require,module,exports){
var atan2, distance, extend, heading, sqrt;

sqrt = Math.sqrt, atan2 = Math.atan2;

extend = exports.extend = function(object, properties) {
  var key, val;
  for (key in properties) {
    val = properties[key];
    object[key] = val;
  }
  return object;
};

distance = exports.distance = function(a, b) {
  var dx, dy;
  dx = a.x - b.x;
  dy = a.y - b.y;
  return sqrt(dx * dx + dy * dy);
};

heading = exports.heading = function(a, b) {
  return atan2(b.y - a.y, b.x - a.x);
};


},{}],24:[function(require,module,exports){
var Base, MAP_SIZE_TILES, Map, MapCell, MapObject, MapView, Pillbox, Start, TERRAIN_TYPES, createTerrainMap, floor, min, round,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty,
  slice = [].slice;

round = Math.round, floor = Math.floor, min = Math.min;

MAP_SIZE_TILES = require('./constants').MAP_SIZE_TILES;

TERRAIN_TYPES = [
  {
    ascii: '|',
    description: 'building'
  }, {
    ascii: ' ',
    description: 'river'
  }, {
    ascii: '~',
    description: 'swamp'
  }, {
    ascii: '%',
    description: 'crater'
  }, {
    ascii: '=',
    description: 'road'
  }, {
    ascii: '#',
    description: 'forest'
  }, {
    ascii: ':',
    description: 'rubble'
  }, {
    ascii: '.',
    description: 'grass'
  }, {
    ascii: '}',
    description: 'shot building'
  }, {
    ascii: 'b',
    description: 'river with boat'
  }, {
    ascii: '^',
    description: 'deep sea'
  }
];

createTerrainMap = function() {
  var j, len, results, type;
  results = [];
  for (j = 0, len = TERRAIN_TYPES.length; j < len; j++) {
    type = TERRAIN_TYPES[j];
    results.push(TERRAIN_TYPES[type.ascii] = type);
  }
  return results;
};

createTerrainMap();

MapCell = (function() {
  function MapCell(map1, x1, y1) {
    this.map = map1;
    this.x = x1;
    this.y = y1;
    this.type = TERRAIN_TYPES['^'];
    this.mine = this.isEdgeCell();
    this.idx = this.y * MAP_SIZE_TILES + this.x;
  }

  MapCell.prototype.neigh = function(dx, dy) {
    return this.map.cellAtTile(this.x + dx, this.y + dy);
  };

  MapCell.prototype.isType = function() {
    var i, j, ref, type;
    for (i = j = 0, ref = arguments.length; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
      type = arguments[i];
      if (this.type === type || this.type.ascii === type) {
        return true;
      }
    }
    return false;
  };

  MapCell.prototype.isEdgeCell = function() {
    return this.x <= 20 || this.x >= 236 || this.y <= 20 || this.y >= 236;
  };

  MapCell.prototype.getNumericType = function() {
    var num;
    if (this.type.ascii === '^') {
      return -1;
    }
    num = TERRAIN_TYPES.indexOf(this.type);
    if (this.mine) {
      num += 8;
    }
    return num;
  };

  MapCell.prototype.setType = function(newType, mine, retileRadius) {
    var hadMine, oldType;
    retileRadius || (retileRadius = 1);
    oldType = this.type;
    hadMine = this.mine;
    if (mine !== void 0) {
      this.mine = mine;
    }
    if (typeof newType === 'string') {
      this.type = TERRAIN_TYPES[newType];
      if (newType.length !== 1 || (this.type == null)) {
        throw "Invalid terrain type: " + newType;
      }
    } else if (typeof newType === 'number') {
      if (newType >= 10) {
        newType -= 8;
        this.mine = true;
      } else {
        this.mine = false;
      }
      this.type = TERRAIN_TYPES[newType];
      if (this.type == null) {
        throw "Invalid terrain type: " + newType;
      }
    } else if (newType !== null) {
      this.type = newType;
    }
    if (this.isEdgeCell()) {
      this.mine = true;
    }
    if (!(retileRadius < 0)) {
      return this.map.retile(this.x - retileRadius, this.y - retileRadius, this.x + retileRadius, this.y + retileRadius);
    }
  };

  MapCell.prototype.setTile = function(tx, ty) {
    if (this.mine && !((this.pill != null) || (this.base != null))) {
      ty += 10;
    }
    return this.map.view.onRetile(this, tx, ty);
  };

  MapCell.prototype.retile = function() {
    if (this.pill != null) {
      return this.setTile(this.pill.armour, 2);
    } else if (this.base != null) {
      return this.setTile(16, 0);
    } else {
      switch (this.type.ascii) {
        case '^':
          return this.retileDeepSea();
        case '|':
          return this.retileBuilding();
        case ' ':
          return this.retileRiver();
        case '~':
          return this.setTile(7, 1);
        case '%':
          return this.setTile(5, 1);
        case '=':
          return this.retileRoad();
        case '#':
          return this.retileForest();
        case ':':
          return this.setTile(4, 1);
        case '.':
          return this.setTile(2, 1);
        case '}':
          return this.setTile(8, 1);
        case 'b':
          return this.retileBoat();
      }
    }
  };

  MapCell.prototype.retileDeepSea = function() {
    var above, aboveLeft, aboveRight, below, belowLeft, belowRight, left, neighbourSignificance, right;
    neighbourSignificance = (function(_this) {
      return function(dx, dy) {
        var n;
        n = _this.neigh(dx, dy);
        if (n.isType('^')) {
          return 'd';
        }
        if (n.isType(' ', 'b')) {
          return 'w';
        }
        return 'l';
      };
    })(this);
    above = neighbourSignificance(0, -1);
    aboveRight = neighbourSignificance(1, -1);
    right = neighbourSignificance(1, 0);
    belowRight = neighbourSignificance(1, 1);
    below = neighbourSignificance(0, 1);
    belowLeft = neighbourSignificance(-1, 1);
    left = neighbourSignificance(-1, 0);
    aboveLeft = neighbourSignificance(-1, -1);
    if (aboveLeft !== 'd' && above !== 'd' && left !== 'd' && right === 'd' && below === 'd') {
      return this.setTile(10, 3);
    } else if (aboveRight !== 'd' && above !== 'd' && right !== 'd' && left === 'd' && below === 'd') {
      return this.setTile(11, 3);
    } else if (belowRight !== 'd' && below !== 'd' && right !== 'd' && left === 'd' && above === 'd') {
      return this.setTile(13, 3);
    } else if (belowLeft !== 'd' && below !== 'd' && left !== 'd' && right === 'd' && above === 'd') {
      return this.setTile(12, 3);
    } else if (left === 'w' && right === 'd') {
      return this.setTile(14, 3);
    } else if (below === 'w' && above === 'd') {
      return this.setTile(15, 3);
    } else if (above === 'w' && below === 'd') {
      return this.setTile(16, 3);
    } else if (right === 'w' && left === 'd') {
      return this.setTile(17, 3);
    } else {
      return this.setTile(0, 0);
    }
  };

  MapCell.prototype.retileBuilding = function() {
    var above, aboveLeft, aboveRight, below, belowLeft, belowRight, left, neighbourSignificance, right;
    neighbourSignificance = (function(_this) {
      return function(dx, dy) {
        var n;
        n = _this.neigh(dx, dy);
        if (n.isType('|', '}')) {
          return 'b';
        }
        return 'o';
      };
    })(this);
    above = neighbourSignificance(0, -1);
    aboveRight = neighbourSignificance(1, -1);
    right = neighbourSignificance(1, 0);
    belowRight = neighbourSignificance(1, 1);
    below = neighbourSignificance(0, 1);
    belowLeft = neighbourSignificance(-1, 1);
    left = neighbourSignificance(-1, 0);
    aboveLeft = neighbourSignificance(-1, -1);
    if (aboveLeft === 'b' && above === 'b' && aboveRight === 'b' && left === 'b' && right === 'b' && belowLeft === 'b' && below === 'b' && belowRight === 'b') {
      return this.setTile(17, 1);
    } else if (right === 'b' && above === 'b' && below === 'b' && left === 'b' && aboveRight !== 'b' && aboveLeft !== 'b' && belowRight !== 'b' && belowLeft !== 'b') {
      return this.setTile(30, 1);
    } else if (right === 'b' && above === 'b' && below === 'b' && left === 'b' && aboveRight !== 'b' && aboveLeft !== 'b' && belowRight !== 'b' && belowLeft === 'b') {
      return this.setTile(22, 2);
    } else if (right === 'b' && above === 'b' && below === 'b' && left === 'b' && aboveRight !== 'b' && aboveLeft === 'b' && belowRight !== 'b' && belowLeft !== 'b') {
      return this.setTile(23, 2);
    } else if (right === 'b' && above === 'b' && below === 'b' && left === 'b' && aboveRight !== 'b' && aboveLeft !== 'b' && belowRight === 'b' && belowLeft !== 'b') {
      return this.setTile(24, 2);
    } else if (right === 'b' && above === 'b' && below === 'b' && left === 'b' && aboveRight === 'b' && aboveLeft !== 'b' && belowRight !== 'b' && belowLeft !== 'b') {
      return this.setTile(25, 2);
    } else if (aboveLeft === 'b' && above === 'b' && left === 'b' && right === 'b' && belowLeft === 'b' && below === 'b' && belowRight === 'b') {
      return this.setTile(16, 2);
    } else if (above === 'b' && aboveRight === 'b' && left === 'b' && right === 'b' && belowLeft === 'b' && below === 'b' && belowRight === 'b') {
      return this.setTile(17, 2);
    } else if (aboveLeft === 'b' && above === 'b' && aboveRight === 'b' && left === 'b' && right === 'b' && belowLeft === 'b' && below === 'b') {
      return this.setTile(18, 2);
    } else if (aboveLeft === 'b' && above === 'b' && aboveRight === 'b' && left === 'b' && right === 'b' && below === 'b' && belowRight === 'b') {
      return this.setTile(19, 2);
    } else if (left === 'b' && right === 'b' && above === 'b' && below === 'b' && aboveRight === 'b' && belowLeft === 'b' && aboveLeft !== 'b' && belowRight !== 'b') {
      return this.setTile(20, 2);
    } else if (left === 'b' && right === 'b' && above === 'b' && below === 'b' && belowRight === 'b' && aboveLeft === 'b' && aboveRight !== 'b' && belowLeft !== 'b') {
      return this.setTile(21, 2);
    } else if (above === 'b' && left === 'b' && right === 'b' && below === 'b' && belowRight === 'b' && aboveRight === 'b') {
      return this.setTile(8, 2);
    } else if (above === 'b' && left === 'b' && right === 'b' && below === 'b' && belowLeft === 'b' && aboveLeft === 'b') {
      return this.setTile(9, 2);
    } else if (above === 'b' && left === 'b' && right === 'b' && below === 'b' && belowLeft === 'b' && belowRight === 'b') {
      return this.setTile(10, 2);
    } else if (above === 'b' && left === 'b' && right === 'b' && below === 'b' && aboveLeft === 'b' && aboveRight === 'b') {
      return this.setTile(11, 2);
    } else if (above === 'b' && below === 'b' && left === 'b' && right !== 'b' && belowLeft === 'b' && aboveLeft !== 'b') {
      return this.setTile(12, 2);
    } else if (above === 'b' && below === 'b' && right === 'b' && belowRight === 'b' && left !== 'b' && aboveRight !== 'b') {
      return this.setTile(13, 2);
    } else if (above === 'b' && below === 'b' && right === 'b' && aboveRight === 'b' && belowRight !== 'b') {
      return this.setTile(14, 2);
    } else if (above === 'b' && below === 'b' && left === 'b' && aboveLeft === 'b' && belowLeft !== 'b') {
      return this.setTile(15, 2);
    } else if (right === 'b' && above === 'b' && left === 'b' && below !== 'b' && aboveLeft !== 'b' && aboveRight !== 'b') {
      return this.setTile(26, 1);
    } else if (right === 'b' && below === 'b' && left === 'b' && belowLeft !== 'b' && belowRight !== 'b') {
      return this.setTile(27, 1);
    } else if (right === 'b' && above === 'b' && below === 'b' && aboveRight !== 'b' && belowRight !== 'b') {
      return this.setTile(28, 1);
    } else if (below === 'b' && above === 'b' && left === 'b' && aboveLeft !== 'b' && belowLeft !== 'b') {
      return this.setTile(29, 1);
    } else if (left === 'b' && right === 'b' && above === 'b' && aboveRight === 'b' && aboveLeft !== 'b') {
      return this.setTile(4, 2);
    } else if (left === 'b' && right === 'b' && above === 'b' && aboveLeft === 'b' && aboveRight !== 'b') {
      return this.setTile(5, 2);
    } else if (left === 'b' && right === 'b' && below === 'b' && belowLeft === 'b' && belowRight !== 'b') {
      return this.setTile(6, 2);
    } else if (left === 'b' && right === 'b' && below === 'b' && above !== 'b' && belowRight === 'b' && belowLeft !== 'b') {
      return this.setTile(7, 2);
    } else if (right === 'b' && above === 'b' && below === 'b') {
      return this.setTile(0, 2);
    } else if (left === 'b' && above === 'b' && below === 'b') {
      return this.setTile(1, 2);
    } else if (right === 'b' && left === 'b' && below === 'b') {
      return this.setTile(2, 2);
    } else if (right === 'b' && above === 'b' && left === 'b') {
      return this.setTile(3, 2);
    } else if (right === 'b' && below === 'b' && belowRight === 'b') {
      return this.setTile(18, 1);
    } else if (left === 'b' && below === 'b' && belowLeft === 'b') {
      return this.setTile(19, 1);
    } else if (right === 'b' && above === 'b' && aboveRight === 'b') {
      return this.setTile(20, 1);
    } else if (left === 'b' && above === 'b' && aboveLeft === 'b') {
      return this.setTile(21, 1);
    } else if (right === 'b' && below === 'b') {
      return this.setTile(22, 1);
    } else if (left === 'b' && below === 'b') {
      return this.setTile(23, 1);
    } else if (right === 'b' && above === 'b') {
      return this.setTile(24, 1);
    } else if (left === 'b' && above === 'b') {
      return this.setTile(25, 1);
    } else if (left === 'b' && right === 'b') {
      return this.setTile(11, 1);
    } else if (above === 'b' && below === 'b') {
      return this.setTile(12, 1);
    } else if (right === 'b') {
      return this.setTile(13, 1);
    } else if (left === 'b') {
      return this.setTile(14, 1);
    } else if (below === 'b') {
      return this.setTile(15, 1);
    } else if (above === 'b') {
      return this.setTile(16, 1);
    } else {
      return this.setTile(6, 1);
    }
  };

  MapCell.prototype.retileRiver = function() {
    var above, below, left, neighbourSignificance, right;
    neighbourSignificance = (function(_this) {
      return function(dx, dy) {
        var n;
        n = _this.neigh(dx, dy);
        if (n.isType('=')) {
          return 'r';
        }
        if (n.isType('^', ' ', 'b')) {
          return 'w';
        }
        return 'l';
      };
    })(this);
    above = neighbourSignificance(0, -1);
    right = neighbourSignificance(1, 0);
    below = neighbourSignificance(0, 1);
    left = neighbourSignificance(-1, 0);
    if (above === 'l' && below === 'l' && right === 'l' && left === 'l') {
      return this.setTile(30, 2);
    } else if (above === 'l' && below === 'l' && right === 'w' && left === 'l') {
      return this.setTile(26, 2);
    } else if (above === 'l' && below === 'l' && right === 'l' && left === 'w') {
      return this.setTile(27, 2);
    } else if (above === 'l' && below === 'w' && right === 'l' && left === 'l') {
      return this.setTile(28, 2);
    } else if (above === 'w' && below === 'l' && right === 'l' && left === 'l') {
      return this.setTile(29, 2);
    } else if (above === 'l' && left === 'l') {
      return this.setTile(6, 3);
    } else if (above === 'l' && right === 'l') {
      return this.setTile(7, 3);
    } else if (below === 'l' && left === 'l') {
      return this.setTile(8, 3);
    } else if (below === 'l' && right === 'l') {
      return this.setTile(9, 3);
    } else if (below === 'l' && above === 'l' && below === 'l') {
      return this.setTile(0, 3);
    } else if (left === 'l' && right === 'l') {
      return this.setTile(1, 3);
    } else if (left === 'l') {
      return this.setTile(2, 3);
    } else if (below === 'l') {
      return this.setTile(3, 3);
    } else if (right === 'l') {
      return this.setTile(4, 3);
    } else if (above === 'l') {
      return this.setTile(5, 3);
    } else {
      return this.setTile(1, 0);
    }
  };

  MapCell.prototype.retileRoad = function() {
    var above, aboveLeft, aboveRight, below, belowLeft, belowRight, left, neighbourSignificance, right;
    neighbourSignificance = (function(_this) {
      return function(dx, dy) {
        var n;
        n = _this.neigh(dx, dy);
        if (n.isType('=')) {
          return 'r';
        }
        if (n.isType('^', ' ', 'b')) {
          return 'w';
        }
        return 'l';
      };
    })(this);
    above = neighbourSignificance(0, -1);
    aboveRight = neighbourSignificance(1, -1);
    right = neighbourSignificance(1, 0);
    belowRight = neighbourSignificance(1, 1);
    below = neighbourSignificance(0, 1);
    belowLeft = neighbourSignificance(-1, 1);
    left = neighbourSignificance(-1, 0);
    aboveLeft = neighbourSignificance(-1, -1);
    if (aboveLeft !== 'r' && above === 'r' && aboveRight !== 'r' && left === 'r' && right === 'r' && belowLeft !== 'r' && below === 'r' && belowRight !== 'r') {
      return this.setTile(11, 0);
    } else if (above === 'r' && left === 'r' && right === 'r' && below === 'r') {
      return this.setTile(10, 0);
    } else if (left === 'w' && right === 'w' && above === 'w' && below === 'w') {
      return this.setTile(26, 0);
    } else if (right === 'r' && below === 'r' && left === 'w' && above === 'w') {
      return this.setTile(20, 0);
    } else if (left === 'r' && below === 'r' && right === 'w' && above === 'w') {
      return this.setTile(21, 0);
    } else if (above === 'r' && left === 'r' && below === 'w' && right === 'w') {
      return this.setTile(22, 0);
    } else if (right === 'r' && above === 'r' && left === 'w' && below === 'w') {
      return this.setTile(23, 0);
    } else if (above === 'w' && below === 'w') {
      return this.setTile(24, 0);
    } else if (left === 'w' && right === 'w') {
      return this.setTile(25, 0);
    } else if (above === 'w' && below === 'r') {
      return this.setTile(16, 0);
    } else if (right === 'w' && left === 'r') {
      return this.setTile(17, 0);
    } else if (below === 'w' && above === 'r') {
      return this.setTile(18, 0);
    } else if (left === 'w' && right === 'r') {
      return this.setTile(19, 0);
    } else if (right === 'r' && below === 'r' && above === 'r' && (aboveRight === 'r' || belowRight === 'r')) {
      return this.setTile(27, 0);
    } else if (left === 'r' && right === 'r' && below === 'r' && (belowLeft === 'r' || belowRight === 'r')) {
      return this.setTile(28, 0);
    } else if (left === 'r' && above === 'r' && below === 'r' && (belowLeft === 'r' || aboveLeft === 'r')) {
      return this.setTile(29, 0);
    } else if (left === 'r' && right === 'r' && above === 'r' && (aboveRight === 'r' || aboveLeft === 'r')) {
      return this.setTile(30, 0);
    } else if (left === 'r' && right === 'r' && below === 'r') {
      return this.setTile(12, 0);
    } else if (left === 'r' && above === 'r' && below === 'r') {
      return this.setTile(13, 0);
    } else if (left === 'r' && right === 'r' && above === 'r') {
      return this.setTile(14, 0);
    } else if (right === 'r' && above === 'r' && below === 'r') {
      return this.setTile(15, 0);
    } else if (below === 'r' && right === 'r' && belowRight === 'r') {
      return this.setTile(6, 0);
    } else if (below === 'r' && left === 'r' && belowLeft === 'r') {
      return this.setTile(7, 0);
    } else if (above === 'r' && left === 'r' && aboveLeft === 'r') {
      return this.setTile(8, 0);
    } else if (above === 'r' && right === 'r' && aboveRight === 'r') {
      return this.setTile(9, 0);
    } else if (below === 'r' && right === 'r') {
      return this.setTile(2, 0);
    } else if (below === 'r' && left === 'r') {
      return this.setTile(3, 0);
    } else if (above === 'r' && left === 'r') {
      return this.setTile(4, 0);
    } else if (above === 'r' && right === 'r') {
      return this.setTile(5, 0);
    } else if (right === 'r' || left === 'r') {
      return this.setTile(0, 1);
    } else if (above === 'r' || below === 'r') {
      return this.setTile(1, 1);
    } else {
      return this.setTile(10, 0);
    }
  };

  MapCell.prototype.retileForest = function() {
    var above, below, left, right;
    above = this.neigh(0, -1).isType('#');
    right = this.neigh(1, 0).isType('#');
    below = this.neigh(0, 1).isType('#');
    left = this.neigh(-1, 0).isType('#');
    if (!above && !left && right && below) {
      return this.setTile(9, 9);
    } else if (!above && left && !right && below) {
      return this.setTile(10, 9);
    } else if (above && left && !right && !below) {
      return this.setTile(11, 9);
    } else if (above && !left && right && !below) {
      return this.setTile(12, 9);
    } else if (above && !left && !right && !below) {
      return this.setTile(16, 9);
    } else if (!above && !left && !right && below) {
      return this.setTile(15, 9);
    } else if (!above && left && !right && !below) {
      return this.setTile(14, 9);
    } else if (!above && !left && right && !below) {
      return this.setTile(13, 9);
    } else if (!above && !left && !right && !below) {
      return this.setTile(8, 9);
    } else {
      return this.setTile(3, 1);
    }
  };

  MapCell.prototype.retileBoat = function() {
    var above, below, left, neighbourSignificance, right;
    neighbourSignificance = (function(_this) {
      return function(dx, dy) {
        var n;
        n = _this.neigh(dx, dy);
        if (n.isType('^', ' ', 'b')) {
          return 'w';
        }
        return 'l';
      };
    })(this);
    above = neighbourSignificance(0, -1);
    right = neighbourSignificance(1, 0);
    below = neighbourSignificance(0, 1);
    left = neighbourSignificance(-1, 0);
    if (above !== 'w' && left !== 'w') {
      return this.setTile(15, 6);
    } else if (above !== 'w' && right !== 'w') {
      return this.setTile(16, 6);
    } else if (below !== 'w' && right !== 'w') {
      return this.setTile(17, 6);
    } else if (below !== 'w' && left !== 'w') {
      return this.setTile(14, 6);
    } else if (left !== 'w') {
      return this.setTile(12, 6);
    } else if (right !== 'w') {
      return this.setTile(13, 6);
    } else if (below !== 'w') {
      return this.setTile(10, 6);
    } else {
      return this.setTile(11, 6);
    }
  };

  return MapCell;

})();

MapView = (function() {
  function MapView() {}

  MapView.prototype.onRetile = function(cell, tx, ty) {};

  return MapView;

})();

MapObject = (function() {
  function MapObject(map1) {
    this.map = map1;
    this.cell = this.map.cells[this.y][this.x];
  }

  return MapObject;

})();

Pillbox = (function(superClass) {
  extend(Pillbox, superClass);

  function Pillbox(map, x1, y1, owner_idx, armour, speed) {
    this.x = x1;
    this.y = y1;
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.speed = speed;
    Pillbox.__super__.constructor.apply(this, arguments);
  }

  return Pillbox;

})(MapObject);

Base = (function(superClass) {
  extend(Base, superClass);

  function Base(map, x1, y1, owner_idx, armour, shells, mines) {
    this.x = x1;
    this.y = y1;
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.shells = shells;
    this.mines = mines;
    Base.__super__.constructor.apply(this, arguments);
  }

  return Base;

})(MapObject);

Start = (function(superClass) {
  extend(Start, superClass);

  function Start(map, x1, y1, direction) {
    this.x = x1;
    this.y = y1;
    this.direction = direction;
    Start.__super__.constructor.apply(this, arguments);
  }

  return Start;

})(MapObject);

Map = (function() {
  Map.prototype.CellClass = MapCell;

  Map.prototype.PillboxClass = Pillbox;

  Map.prototype.BaseClass = Base;

  Map.prototype.StartClass = Start;

  function Map() {
    var j, k, ref, ref1, row, x, y;
    this.view = new MapView();
    this.pills = [];
    this.bases = [];
    this.starts = [];
    this.cells = new Array(MAP_SIZE_TILES);
    for (y = j = 0, ref = MAP_SIZE_TILES; 0 <= ref ? j < ref : j > ref; y = 0 <= ref ? ++j : --j) {
      row = this.cells[y] = new Array(MAP_SIZE_TILES);
      for (x = k = 0, ref1 = MAP_SIZE_TILES; 0 <= ref1 ? k < ref1 : k > ref1; x = 0 <= ref1 ? ++k : --k) {
        row[x] = new this.CellClass(this, x, y);
      }
    }
  }

  Map.prototype.setView = function(view) {
    this.view = view;
    return this.retile();
  };

  Map.prototype.cellAtTile = function(x, y) {
    var cell, ref;
    if (cell = (ref = this.cells[y]) != null ? ref[x] : void 0) {
      return cell;
    } else {
      return new this.CellClass(this, x, y, {
        isDummy: true
      });
    }
  };

  Map.prototype.each = function(cb, sx, sy, ex, ey) {
    var j, k, ref, ref1, ref2, ref3, row, x, y;
    if (!((sx != null) && sx >= 0)) {
      sx = 0;
    }
    if (!((sy != null) && sy >= 0)) {
      sy = 0;
    }
    if (!((ex != null) && ex < MAP_SIZE_TILES)) {
      ex = MAP_SIZE_TILES - 1;
    }
    if (!((ey != null) && ey < MAP_SIZE_TILES)) {
      ey = MAP_SIZE_TILES - 1;
    }
    for (y = j = ref = sy, ref1 = ey; ref <= ref1 ? j <= ref1 : j >= ref1; y = ref <= ref1 ? ++j : --j) {
      row = this.cells[y];
      for (x = k = ref2 = sx, ref3 = ex; ref2 <= ref3 ? k <= ref3 : k >= ref3; x = ref2 <= ref3 ? ++k : --k) {
        cb(row[x]);
      }
    }
    return this;
  };

  Map.prototype.clear = function(sx, sy, ex, ey) {
    return this.each(function(cell) {
      cell.type = TERRAIN_TYPES['^'];
      return cell.mine = cell.isEdgeCell();
    }, sx, sy, ex, ey);
  };

  Map.prototype.retile = function(sx, sy, ex, ey) {
    return this.each(function(cell) {
      return cell.retile();
    }, sx, sy, ex, ey);
  };

  Map.prototype.findCenterCell = function() {
    var b, l, r, t, x, y;
    t = l = MAP_SIZE_TILES - 1;
    b = r = 0;
    this.each(function(c) {
      if (l > c.x) {
        l = c.x;
      }
      if (r < c.x) {
        r = c.x;
      }
      if (t > c.y) {
        t = c.y;
      }
      if (b < c.y) {
        return b = c.y;
      }
    });
    if (l > r) {
      t = l = 0;
      b = r = MAP_SIZE_TILES - 1;
    }
    x = round(l + (r - l) / 2);
    y = round(t + (b - t) / 2);
    return this.cellAtTile(x, y);
  };

  Map.prototype.dump = function(options) {
    var b, bases, c, consecutiveCells, data, encodeNibbles, ensureRunSpace, ex, flushRun, flushSequence, j, k, len, len1, len2, len3, m, o, p, pills, ref, row, run, s, seq, starts, sx, y;
    options || (options = {});
    consecutiveCells = function(row, cb) {
      var cell, count, currentType, j, len, num, startx, x;
      currentType = null;
      startx = null;
      count = 0;
      for (x = j = 0, len = row.length; j < len; x = ++j) {
        cell = row[x];
        num = cell.getNumericType();
        if (currentType === num) {
          count++;
          continue;
        }
        if (currentType != null) {
          cb(currentType, count, startx);
        }
        currentType = num;
        startx = x;
        count = 1;
      }
      if (currentType != null) {
        cb(currentType, count, startx);
      }
    };
    encodeNibbles = function(nibbles) {
      var i, j, len, nibble, octets, val;
      octets = [];
      val = null;
      for (i = j = 0, len = nibbles.length; j < len; i = ++j) {
        nibble = nibbles[i];
        nibble = nibble & 0x0F;
        if (i % 2 === 0) {
          val = nibble << 4;
        } else {
          octets.push(val + nibble);
          val = null;
        }
      }
      if (val != null) {
        octets.push(val);
      }
      return octets;
    };
    pills = options.noPills ? [] : this.pills;
    bases = options.noBases ? [] : this.bases;
    starts = options.noStarts ? [] : this.starts;
    data = (function() {
      var j, len, ref, results;
      ref = 'BMAPBOLO';
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        c = ref[j];
        results.push(c.charCodeAt(0));
      }
      return results;
    })();
    data.push(1, pills.length, bases.length, starts.length);
    for (j = 0, len = pills.length; j < len; j++) {
      p = pills[j];
      data.push(p.x, p.y, p.owner_idx, p.armour, p.speed);
    }
    for (k = 0, len1 = bases.length; k < len1; k++) {
      b = bases[k];
      data.push(b.x, b.y, b.owner_idx, b.armour, b.shells, b.mines);
    }
    for (m = 0, len2 = starts.length; m < len2; m++) {
      s = starts[m];
      data.push(s.x, s.y, s.direction);
    }
    run = seq = sx = ex = y = null;
    flushRun = function() {
      var octets;
      if (run == null) {
        return;
      }
      flushSequence();
      octets = encodeNibbles(run);
      data.push(octets.length + 4, y, sx, ex);
      data = data.concat(octets);
      return run = null;
    };
    ensureRunSpace = function(numNibbles) {
      if (!((255 - 4) * 2 - run.length < numNibbles)) {
        return;
      }
      flushRun();
      run = [];
      return sx = ex;
    };
    flushSequence = function() {
      var localSeq;
      if (seq == null) {
        return;
      }
      localSeq = seq;
      seq = null;
      ensureRunSpace(localSeq.length + 1);
      run.push(localSeq.length - 1);
      run = run.concat(localSeq);
      return ex += localSeq.length;
    };
    ref = this.cells;
    for (o = 0, len3 = ref.length; o < len3; o++) {
      row = ref[o];
      y = row[0].y;
      run = sx = ex = seq = null;
      consecutiveCells(row, function(type, count, x) {
        var results, seqLen;
        if (type === -1) {
          flushRun();
          return;
        }
        if (run == null) {
          run = [];
          sx = ex = x;
        }
        if (count > 2) {
          flushSequence();
          while (count > 2) {
            ensureRunSpace(2);
            seqLen = min(count, 9);
            run.push(seqLen + 6, type);
            ex += seqLen;
            count -= seqLen;
          }
        }
        results = [];
        while (count > 0) {
          if (seq == null) {
            seq = [];
          }
          seq.push(type);
          if (seq.length === 8) {
            flushSequence();
          }
          results.push(count--);
        }
        return results;
      });
    }
    flushRun();
    data.push(4, 0xFF, 0xFF, 0xFF);
    return data;
  };

  Map.load = function(buffer) {
    var args, basesData, c, dataLen, ex, filePos, i, j, k, len, m, magic, map, numBases, numPills, numStarts, pillsData, readBytes, ref, ref1, ref2, ref3, ref4, run, runPos, seqLen, startsData, sx, takeNibble, type, version, x, y;
    filePos = 0;
    readBytes = function(num, msg) {
      var e, sub, x;
      sub = (function() {
        var j, len, ref, results;
        try {
          ref = buffer.slice(filePos, filePos + num);
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            x = ref[j];
            results.push(x);
          }
          return results;
        } catch (error) {
          e = error;
          throw msg;
        }
      })();
      filePos += num;
      return sub;
    };
    magic = readBytes(8, "Not a Bolo map.");
    ref = 'BMAPBOLO';
    for (i = j = 0, len = ref.length; j < len; i = ++j) {
      c = ref[i];
      if (c.charCodeAt(0) !== magic[i]) {
        throw "Not a Bolo map.";
      }
    }
    ref1 = readBytes(4, "Incomplete header"), version = ref1[0], numPills = ref1[1], numBases = ref1[2], numStarts = ref1[3];
    if (version !== 1) {
      throw "Unsupported map version: " + version;
    }
    map = new this();
    pillsData = (function() {
      var k, ref2, results;
      results = [];
      for (i = k = 0, ref2 = numPills; 0 <= ref2 ? k < ref2 : k > ref2; i = 0 <= ref2 ? ++k : --k) {
        results.push(readBytes(5, "Incomplete pillbox data"));
      }
      return results;
    })();
    basesData = (function() {
      var k, ref2, results;
      results = [];
      for (i = k = 0, ref2 = numBases; 0 <= ref2 ? k < ref2 : k > ref2; i = 0 <= ref2 ? ++k : --k) {
        results.push(readBytes(6, "Incomplete base data"));
      }
      return results;
    })();
    startsData = (function() {
      var k, ref2, results;
      results = [];
      for (i = k = 0, ref2 = numStarts; 0 <= ref2 ? k < ref2 : k > ref2; i = 0 <= ref2 ? ++k : --k) {
        results.push(readBytes(3, "Incomplete player start data"));
      }
      return results;
    })();
    while (true) {
      ref2 = readBytes(4, "Incomplete map data"), dataLen = ref2[0], y = ref2[1], sx = ref2[2], ex = ref2[3];
      dataLen -= 4;
      if (dataLen === 0 && y === 0xFF && sx === 0xFF && ex === 0xFF) {
        break;
      }
      run = readBytes(dataLen, "Incomplete map data");
      runPos = 0;
      takeNibble = function() {
        var index, nibble;
        index = floor(runPos);
        nibble = index === runPos ? (run[index] & 0xF0) >> 4 : run[index] & 0x0F;
        runPos += 0.5;
        return nibble;
      };
      x = sx;
      while (x < ex) {
        seqLen = takeNibble();
        if (seqLen < 8) {
          for (i = k = 1, ref3 = seqLen + 1; 1 <= ref3 ? k <= ref3 : k >= ref3; i = 1 <= ref3 ? ++k : --k) {
            map.cellAtTile(x++, y).setType(takeNibble(), void 0, -1);
          }
        } else {
          type = takeNibble();
          for (i = m = 1, ref4 = seqLen - 6; 1 <= ref4 ? m <= ref4 : m >= ref4; i = 1 <= ref4 ? ++m : --m) {
            map.cellAtTile(x++, y).setType(type, void 0, -1);
          }
        }
      }
    }
    map.pills = (function() {
      var len1, o, results;
      results = [];
      for (o = 0, len1 = pillsData.length; o < len1; o++) {
        args = pillsData[o];
        results.push((function(func, args, ctor) {
          ctor.prototype = func.prototype;
          var child = new ctor, result = func.apply(child, args);
          return Object(result) === result ? result : child;
        })(map.PillboxClass, [map].concat(slice.call(args)), function(){}));
      }
      return results;
    })();
    map.bases = (function() {
      var len1, o, results;
      results = [];
      for (o = 0, len1 = basesData.length; o < len1; o++) {
        args = basesData[o];
        results.push((function(func, args, ctor) {
          ctor.prototype = func.prototype;
          var child = new ctor, result = func.apply(child, args);
          return Object(result) === result ? result : child;
        })(map.BaseClass, [map].concat(slice.call(args)), function(){}));
      }
      return results;
    })();
    map.starts = (function() {
      var len1, o, results;
      results = [];
      for (o = 0, len1 = startsData.length; o < len1; o++) {
        args = startsData[o];
        results.push((function(func, args, ctor) {
          ctor.prototype = func.prototype;
          var child = new ctor, result = func.apply(child, args);
          return Object(result) === result ? result : child;
        })(map.StartClass, [map].concat(slice.call(args)), function(){}));
      }
      return results;
    })();
    return map;
  };

  Map.extended = function(child) {
    if (!child.load) {
      return child.load = this.load;
    }
  };

  return Map;

})();

exports.TERRAIN_TYPES = TERRAIN_TYPES;

exports.MapView = MapView;

exports.Map = Map;


},{"./constants":22}],25:[function(require,module,exports){
exports.SYNC_MESSAGE = 's'.charCodeAt(0);

exports.WELCOME_MESSAGE = 'W'.charCodeAt(0);

exports.CREATE_MESSAGE = 'C'.charCodeAt(0);

exports.DESTROY_MESSAGE = 'D'.charCodeAt(0);

exports.MAPCHANGE_MESSAGE = 'M'.charCodeAt(0);

exports.UPDATE_MESSAGE = 'U'.charCodeAt(0);

exports.TINY_UPDATE_MESSAGE = 'u'.charCodeAt(0);

exports.SOUNDEFFECT_MESSAGE = 'S'.charCodeAt(0);

exports.START_TURNING_CCW = 'L';

exports.STOP_TURNING_CCW = 'l';

exports.START_TURNING_CW = 'R';

exports.STOP_TURNING_CW = 'r';

exports.START_ACCELERATING = 'A';

exports.STOP_ACCELERATING = 'a';

exports.START_BRAKING = 'B';

exports.STOP_BRAKING = 'b';

exports.START_SHOOTING = 'S';

exports.STOP_SHOOTING = 's';

exports.INC_RANGE = 'I';

exports.DEC_RANGE = 'D';

exports.BUILD_ORDER = 'O';


},{}],26:[function(require,module,exports){
var BoloObject, NetWorldObject,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

NetWorldObject = require('villain/world/net/object');

BoloObject = (function(superClass) {
  extend(BoloObject, superClass);

  function BoloObject() {
    return BoloObject.__super__.constructor.apply(this, arguments);
  }

  BoloObject.prototype.styled = null;

  BoloObject.prototype.team = null;

  BoloObject.prototype.x = null;

  BoloObject.prototype.y = null;

  BoloObject.prototype.soundEffect = function(sfx) {
    return this.world.soundEffect(sfx, this.x, this.y, this);
  };

  BoloObject.prototype.getTile = function() {};

  return BoloObject;

})(NetWorldObject);

module.exports = BoloObject;


},{"villain/world/net/object":8}],27:[function(require,module,exports){
exports.registerWithWorld = function(w) {
  w.registerType(require('./world_pillbox'));
  w.registerType(require('./world_base'));
  w.registerType(require('./flood_fill'));
  w.registerType(require('./tank'));
  w.registerType(require('./explosion'));
  w.registerType(require('./mine_explosion'));
  w.registerType(require('./shell'));
  w.registerType(require('./fireball'));
  return w.registerType(require('./builder'));
};


},{"./builder":28,"./explosion":29,"./fireball":30,"./flood_fill":31,"./mine_explosion":32,"./shell":33,"./tank":34,"./world_base":35,"./world_pillbox":36}],28:[function(require,module,exports){
var BoloObject, Builder, MineExplosion, TILE_SIZE_WORLD, ceil, cos, distance, floor, heading, min, ref, round, sin, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

round = Math.round, floor = Math.floor, ceil = Math.ceil, min = Math.min, cos = Math.cos, sin = Math.sin;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

ref = require('../helpers'), distance = ref.distance, heading = ref.heading;

BoloObject = require('../object');

sounds = require('../sounds');

MineExplosion = require('./mine_explosion');

Builder = (function(superClass) {
  extend(Builder, superClass);

  Builder.prototype.states = {
    inTank: 0,
    waiting: 1,
    returning: 2,
    parachuting: 3,
    actions: {
      _min: 10,
      forest: 10,
      road: 11,
      repair: 12,
      boat: 13,
      building: 14,
      pillbox: 15,
      mine: 16
    }
  };

  Builder.prototype.styled = true;

  function Builder(world) {
    this.world = world;
    this.on('netUpdate', (function(_this) {
      return function(changes) {
        if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
          return _this.updateCell();
        }
      };
    })(this));
  }

  Builder.prototype.updateCell = function() {
    return this.cell = (this.x != null) && (this.y != null) ? this.world.map.cellAtWorld(this.x, this.y) : null;
  };

  Builder.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('O', 'owner');
    }
    p('B', 'order');
    if (this.order === this.states.inTank) {
      this.x = this.y = null;
    } else {
      p('H', 'x');
      p('H', 'y');
      p('H', 'targetX');
      p('H', 'targetY');
      p('B', 'trees');
      p('O', 'pillbox');
      p('f', 'hasMine');
    }
    if (this.order === this.states.waiting) {
      return p('B', 'waitTimer');
    }
  };

  Builder.prototype.getTile = function() {
    if (this.order === this.states.parachuting) {
      return [16, 1];
    } else {
      return [17, floor(this.animation / 3)];
    }
  };

  Builder.prototype.performOrder = function(action, trees, cell) {
    var pill, ref1;
    if (this.order !== this.states.inTank) {
      return;
    }
    if (!(this.owner.$.onBoat || this.owner.$.cell === cell || this.owner.$.cell.getManSpeed(this) > 0)) {
      return;
    }
    pill = null;
    if (action === 'mine') {
      if (this.owner.$.mines === 0) {
        return;
      }
      trees = 0;
    } else {
      if (this.owner.$.trees < trees) {
        return;
      }
      if (action === 'pillbox') {
        if (!(pill = this.owner.$.getCarryingPillboxes().pop())) {
          return;
        }
        pill.inTank = false;
        pill.carried = true;
      }
    }
    this.trees = trees;
    this.hasMine = action === 'mine';
    this.ref('pillbox', pill);
    if (this.hasMine) {
      this.owner.$.mines--;
    }
    this.owner.$.trees -= trees;
    this.order = this.states.actions[action];
    this.x = this.owner.$.x;
    this.y = this.owner.$.y;
    ref1 = cell.getWorldCoordinates(), this.targetX = ref1[0], this.targetY = ref1[1];
    return this.updateCell();
  };

  Builder.prototype.kill = function() {
    var ref1, ref2, ref3, startingPos;
    if (!this.world.authority) {
      return;
    }
    this.soundEffect(sounds.MAN_DYING);
    this.order = this.states.parachuting;
    this.trees = 0;
    this.hasMine = false;
    if (this.pillbox) {
      this.pillbox.$.placeAt(this.cell);
      this.ref('pillbox', null);
    }
    if (this.owner.$.armour === 255) {
      ref1 = [this.x, this.y], this.targetX = ref1[0], this.targetY = ref1[1];
    } else {
      ref2 = [this.owner.$.x, this.owner.$.y], this.targetX = ref2[0], this.targetY = ref2[1];
    }
    startingPos = this.world.map.getRandomStart();
    return ref3 = startingPos.cell.getWorldCoordinates(), this.x = ref3[0], this.y = ref3[1], ref3;
  };

  Builder.prototype.spawn = function(owner) {
    this.ref('owner', owner);
    return this.order = this.states.inTank;
  };

  Builder.prototype.anySpawn = function() {
    this.team = this.owner.$.team;
    return this.animation = 0;
  };

  Builder.prototype.update = function() {
    if (this.order === this.states.inTank) {
      return;
    }
    this.animation = (this.animation + 1) % 9;
    switch (this.order) {
      case this.states.waiting:
        if (this.waitTimer-- === 0) {
          return this.order = this.states.returning;
        }
        break;
      case this.states.parachuting:
        return this.parachutingIn({
          x: this.targetX,
          y: this.targetY
        });
      case this.states.returning:
        if (this.owner.$.armour !== 255) {
          return this.move(this.owner.$, 128, 160);
        }
        break;
      default:
        return this.move({
          x: this.targetX,
          y: this.targetY
        }, 16, 144);
    }
  };

  Builder.prototype.move = function(target, targetRadius, boatRadius) {
    var ahead, dx, dy, movementAxes, newx, newy, onBoat, rad, speed, targetCell;
    speed = this.cell.getManSpeed(this);
    onBoat = false;
    targetCell = this.world.map.cellAtWorld(this.targetX, this.targetY);
    if (speed === 0 && this.cell === targetCell) {
      speed = 16;
    }
    if (this.owner.$.armour !== 255 && this.owner.$.onBoat && distance(this, this.owner.$) < boatRadius) {
      onBoat = true;
      speed = 16;
    }
    speed = min(speed, distance(this, target));
    rad = heading(this, target);
    newx = this.x + (dx = round(cos(rad) * ceil(speed)));
    newy = this.y + (dy = round(sin(rad) * ceil(speed)));
    movementAxes = 0;
    if (dx !== 0) {
      ahead = this.world.map.cellAtWorld(newx, this.y);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(this) > 0) {
        this.x = newx;
        movementAxes++;
      }
    }
    if (dy !== 0) {
      ahead = this.world.map.cellAtWorld(this.x, newy);
      if (onBoat || ahead === targetCell || ahead.getManSpeed(this) > 0) {
        this.y = newy;
        movementAxes++;
      }
    }
    if (movementAxes === 0) {
      return this.order = this.states.returning;
    } else {
      this.updateCell();
      if (distance(this, target) <= targetRadius) {
        return this.reached();
      }
    }
  };

  Builder.prototype.reached = function() {
    var used;
    if (this.order === this.states.returning) {
      this.order = this.states.inTank;
      this.x = this.y = null;
      if (this.pillbox) {
        this.pillbox.$.inTank = true;
        this.pillbox.$.carried = false;
        this.ref('pillbox', null);
      }
      this.owner.$.trees = min(40, this.owner.$.trees + this.trees);
      this.trees = 0;
      if (this.hasMine) {
        this.owner.$.mines = min(40, this.owner.$.mines + 1);
      }
      this.hasMine = false;
      return;
    }
    if (this.cell.mine) {
      this.world.spawn(MineExplosion, this.cell);
      this.order = this.states.waiting;
      this.waitTimer = 20;
      return;
    }
    switch (this.order) {
      case this.states.actions.forest:
        if (this.cell.base || this.cell.pill || !this.cell.isType('#')) {
          break;
        }
        this.cell.setType('.');
        this.trees = 4;
        this.soundEffect(sounds.FARMING_TREE);
        break;
      case this.states.actions.road:
        if (this.cell.base || this.cell.pill || this.cell.isType('|', '}', 'b', '^', '#', '=')) {
          break;
        }
        if (this.cell.isType(' ') && this.cell.hasTankOnBoat()) {
          break;
        }
        this.cell.setType('=');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.repair:
        if (this.cell.pill) {
          used = this.cell.pill.repair(this.trees);
          this.trees -= used;
        } else if (this.cell.isType('}')) {
          this.cell.setType('|');
          this.trees = 0;
        } else {
          break;
        }
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.boat:
        if (!(this.cell.isType(' ') && !this.cell.hasTankOnBoat())) {
          break;
        }
        this.cell.setType('b');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.building:
        if (this.cell.base || this.cell.pill || this.cell.isType('b', '^', '#', '}', '|', ' ')) {
          break;
        }
        this.cell.setType('|');
        this.trees = 0;
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.pillbox:
        if (this.cell.pill || this.cell.base || this.cell.isType('b', '^', '#', '|', '}', ' ')) {
          break;
        }
        this.pillbox.$.armour = 15;
        this.trees = 0;
        this.pillbox.$.placeAt(this.cell);
        this.ref('pillbox', null);
        this.soundEffect(sounds.MAN_BUILDING);
        break;
      case this.states.actions.mine:
        if (this.cell.base || this.cell.pill || this.cell.isType('^', ' ', '|', 'b', '}')) {
          break;
        }
        this.cell.setType(null, true, 0);
        this.hasMine = false;
        this.soundEffect(sounds.MAN_LAY_MINE);
    }
    this.order = this.states.waiting;
    return this.waitTimer = 20;
  };

  Builder.prototype.parachutingIn = function(target) {
    var rad;
    if (distance(this, target) <= 16) {
      return this.order = this.states.returning;
    } else {
      rad = heading(this, target);
      this.x += round(cos(rad) * 3);
      this.y += round(sin(rad) * 3);
      return this.updateCell();
    }
  };

  return Builder;

})(BoloObject);

module.exports = Builder;


},{"../constants":22,"../helpers":23,"../object":26,"../sounds":37,"./mine_explosion":32}],29:[function(require,module,exports){
var BoloObject, Explosion, floor,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

floor = Math.floor;

BoloObject = require('../object');

Explosion = (function(superClass) {
  extend(Explosion, superClass);

  function Explosion() {
    return Explosion.__super__.constructor.apply(this, arguments);
  }

  Explosion.prototype.styled = false;

  Explosion.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    return p('B', 'lifespan');
  };

  Explosion.prototype.getTile = function() {
    switch (floor(this.lifespan / 3)) {
      case 7:
        return [20, 3];
      case 6:
        return [21, 3];
      case 5:
        return [20, 4];
      case 4:
        return [21, 4];
      case 3:
        return [20, 5];
      case 2:
        return [21, 5];
      case 1:
        return [18, 4];
      default:
        return [19, 4];
    }
  };

  Explosion.prototype.spawn = function(x, y) {
    this.x = x;
    this.y = y;
    return this.lifespan = 23;
  };

  Explosion.prototype.update = function() {
    if (this.lifespan-- === 0) {
      return this.world.destroy(this);
    }
  };

  return Explosion;

})(BoloObject);

module.exports = Explosion;


},{"../object":26}],30:[function(require,module,exports){
var BoloObject, Explosion, Fireball, PI, TILE_SIZE_WORLD, cos, round, sin, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

round = Math.round, cos = Math.cos, sin = Math.sin, PI = Math.PI;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

sounds = require('../sounds');

BoloObject = require('../object');

Explosion = require('./explosion');

Fireball = (function(superClass) {
  extend(Fireball, superClass);

  function Fireball() {
    return Fireball.__super__.constructor.apply(this, arguments);
  }

  Fireball.prototype.styled = null;

  Fireball.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('B', 'direction');
      p('f', 'largeExplosion');
    }
    p('H', 'x');
    p('H', 'y');
    return p('B', 'lifespan');
  };

  Fireball.prototype.getDirection16th = function() {
    return round((this.direction - 1) / 16) % 16;
  };

  Fireball.prototype.spawn = function(x1, y1, direction, largeExplosion) {
    this.x = x1;
    this.y = y1;
    this.direction = direction;
    this.largeExplosion = largeExplosion;
    return this.lifespan = 80;
  };

  Fireball.prototype.update = function() {
    if (this.lifespan-- % 2 === 0) {
      if (this.wreck()) {
        return;
      }
      this.move();
    }
    if (this.lifespan === 0) {
      this.explode();
      return this.world.destroy(this);
    }
  };

  Fireball.prototype.wreck = function() {
    var cell;
    this.world.spawn(Explosion, this.x, this.y);
    cell = this.world.map.cellAtWorld(this.x, this.y);
    if (cell.isType('^')) {
      this.world.destroy(this);
      this.soundEffect(sounds.TANK_SINKING);
      return true;
    } else if (cell.isType('b')) {
      cell.setType(' ');
      this.soundEffect(sounds.SHOT_BUILDING);
    } else if (cell.isType('#')) {
      cell.setType('.');
      this.soundEffect(sounds.SHOT_TREE);
    }
    return false;
  };

  Fireball.prototype.move = function() {
    var ahead, dx, dy, newx, newy, radians, ref;
    if (this.dx == null) {
      radians = (256 - this.direction) * 2 * PI / 256;
      this.dx = round(cos(radians) * 48);
      this.dy = round(sin(radians) * 48);
    }
    ref = this, dx = ref.dx, dy = ref.dy;
    newx = this.x + dx;
    newy = this.y + dy;
    if (dx !== 0) {
      ahead = dx > 0 ? newx + 24 : newx - 24;
      ahead = this.world.map.cellAtWorld(ahead, newy);
      if (!ahead.isObstacle()) {
        this.x = newx;
      }
    }
    if (dy !== 0) {
      ahead = dy > 0 ? newy + 24 : newy - 24;
      ahead = this.world.map.cellAtWorld(newx, ahead);
      if (!ahead.isObstacle()) {
        return this.y = newy;
      }
    }
  };

  Fireball.prototype.explode = function() {
    var builder, cell, cells, dx, dy, i, j, len, len1, ref, ref1, ref2, results, tank, x, y;
    cells = [this.world.map.cellAtWorld(this.x, this.y)];
    if (this.largeExplosion) {
      dx = this.dx > 0 ? 1 : -1;
      dy = this.dy > 0 ? 1 : -1;
      cells.push(cells[0].neigh(dx, 0));
      cells.push(cells[0].neigh(0, dy));
      cells.push(cells[0].neigh(dx, dy));
      this.soundEffect(sounds.BIG_EXPLOSION);
    } else {
      this.soundEffect(sounds.MINE_EXPLOSION);
    }
    results = [];
    for (i = 0, len = cells.length; i < len; i++) {
      cell = cells[i];
      cell.takeExplosionHit();
      ref = this.world.tanks;
      for (j = 0, len1 = ref.length; j < len1; j++) {
        tank = ref[j];
        if (builder = tank.builder.$) {
          if ((ref1 = builder.order) !== builder.states.inTank && ref1 !== builder.states.parachuting) {
            if (builder.cell === cell) {
              builder.kill();
            }
          }
        }
      }
      ref2 = cell.getWorldCoordinates(), x = ref2[0], y = ref2[1];
      results.push(this.world.spawn(Explosion, x, y));
    }
    return results;
  };

  return Fireball;

})(BoloObject);

module.exports = Fireball;


},{"../constants":22,"../object":26,"../sounds":37,"./explosion":29}],31:[function(require,module,exports){
var BoloObject, FloodFill,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

BoloObject = require('../object');

FloodFill = (function(superClass) {
  extend(FloodFill, superClass);

  function FloodFill() {
    return FloodFill.__super__.constructor.apply(this, arguments);
  }

  FloodFill.prototype.styled = null;

  FloodFill.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    return p('B', 'lifespan');
  };

  FloodFill.prototype.spawn = function(cell) {
    var ref;
    ref = cell.getWorldCoordinates(), this.x = ref[0], this.y = ref[1];
    return this.lifespan = 16;
  };

  FloodFill.prototype.anySpawn = function() {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    return this.neighbours = [this.cell.neigh(1, 0), this.cell.neigh(0, 1), this.cell.neigh(-1, 0), this.cell.neigh(0, -1)];
  };

  FloodFill.prototype.update = function() {
    if (this.lifespan-- === 0) {
      this.flood();
      return this.world.destroy(this);
    }
  };

  FloodFill.prototype.canGetWet = function() {
    var i, len, n, ref, result;
    result = false;
    ref = this.neighbours;
    for (i = 0, len = ref.length; i < len; i++) {
      n = ref[i];
      if (!(n.base || n.pill) && n.isType(' ', '^', 'b')) {
        result = true;
        break;
      }
    }
    return result;
  };

  FloodFill.prototype.flood = function() {
    if (this.canGetWet()) {
      this.cell.setType(' ', false);
      return this.spread();
    }
  };

  FloodFill.prototype.spread = function() {
    var i, len, n, ref;
    ref = this.neighbours;
    for (i = 0, len = ref.length; i < len; i++) {
      n = ref[i];
      if (!(n.base || n.pill) && n.isType('%')) {
        this.world.spawn(FloodFill, n);
      }
    }
  };

  return FloodFill;

})(BoloObject);

module.exports = FloodFill;


},{"../object":26}],32:[function(require,module,exports){
var BoloObject, Explosion, MineExplosion, TILE_SIZE_WORLD, distance, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

distance = require('../helpers').distance;

BoloObject = require('../object');

sounds = require('../sounds');

Explosion = require('./explosion');

MineExplosion = (function(superClass) {
  extend(MineExplosion, superClass);

  function MineExplosion() {
    return MineExplosion.__super__.constructor.apply(this, arguments);
  }

  MineExplosion.prototype.styled = null;

  MineExplosion.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    return p('B', 'lifespan');
  };

  MineExplosion.prototype.spawn = function(cell) {
    var ref;
    ref = cell.getWorldCoordinates(), this.x = ref[0], this.y = ref[1];
    return this.lifespan = 10;
  };

  MineExplosion.prototype.anySpawn = function() {
    return this.cell = this.world.map.cellAtWorld(this.x, this.y);
  };

  MineExplosion.prototype.update = function() {
    if (this.lifespan-- === 0) {
      if (this.cell.mine) {
        this.asplode();
      }
      return this.world.destroy(this);
    }
  };

  MineExplosion.prototype.asplode = function() {
    var builder, i, len, ref, ref1, tank;
    this.cell.setType(null, false, 0);
    this.cell.takeExplosionHit();
    ref = this.world.tanks;
    for (i = 0, len = ref.length; i < len; i++) {
      tank = ref[i];
      if (tank.armour !== 255 && distance(this, tank) < 384) {
        tank.takeMineHit();
      }
      builder = tank.builder.$;
      if ((ref1 = builder.order) !== builder.states.inTank && ref1 !== builder.states.parachuting) {
        if (distance(this, builder) < (TILE_SIZE_WORLD / 2)) {
          builder.kill();
        }
      }
    }
    this.world.spawn(Explosion, this.x, this.y);
    this.soundEffect(sounds.MINE_EXPLOSION);
    return this.spread();
  };

  MineExplosion.prototype.spread = function() {
    var n;
    n = this.cell.neigh(1, 0);
    if (!n.isEdgeCell()) {
      this.world.spawn(MineExplosion, n);
    }
    n = this.cell.neigh(0, 1);
    if (!n.isEdgeCell()) {
      this.world.spawn(MineExplosion, n);
    }
    n = this.cell.neigh(-1, 0);
    if (!n.isEdgeCell()) {
      this.world.spawn(MineExplosion, n);
    }
    n = this.cell.neigh(0, -1);
    if (!n.isEdgeCell()) {
      return this.world.spawn(MineExplosion, n);
    }
  };

  return MineExplosion;

})(BoloObject);

module.exports = MineExplosion;


},{"../constants":22,"../helpers":23,"../object":26,"../sounds":37,"./explosion":29}],33:[function(require,module,exports){
var BoloObject, Destructable, Explosion, MineExplosion, PI, Shell, TILE_SIZE_WORLD, cos, distance, floor, round, sin,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

round = Math.round, floor = Math.floor, cos = Math.cos, sin = Math.sin, PI = Math.PI;

distance = require('../helpers').distance;

BoloObject = require('../object');

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

Explosion = require('./explosion');

MineExplosion = require('./mine_explosion');

Destructable = (function() {
  function Destructable() {}

  Destructable.prototype.takeShellHit = function(shell) {};

  return Destructable;

})();

Shell = (function(superClass) {
  extend(Shell, superClass);

  Shell.prototype.updatePriority = 20;

  Shell.prototype.styled = false;

  function Shell(world) {
    this.world = world;
    this.spawn = bind(this.spawn, this);
    this.on('netSync', (function(_this) {
      return function() {
        return _this.updateCell();
      };
    })(this));
  }

  Shell.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('B', 'direction');
      p('O', 'owner');
      p('O', 'attribution');
      p('f', 'onWater');
    }
    p('H', 'x');
    p('H', 'y');
    return p('B', 'lifespan');
  };

  Shell.prototype.updateCell = function() {
    return this.cell = this.world.map.cellAtWorld(this.x, this.y);
  };

  Shell.prototype.getDirection16th = function() {
    return round((this.direction - 1) / 16) % 16;
  };

  Shell.prototype.getTile = function() {
    var tx;
    tx = this.getDirection16th();
    return [tx, 4];
  };

  Shell.prototype.spawn = function(owner, options) {
    var ref;
    options || (options = {});
    this.ref('owner', owner);
    if (this.owner.$.hasOwnProperty('owner_idx')) {
      this.ref('attribution', (ref = this.owner.$.owner) != null ? ref.$ : void 0);
    } else {
      this.ref('attribution', this.owner.$);
    }
    this.direction = options.direction || this.owner.$.direction;
    this.lifespan = (options.range || 7) * TILE_SIZE_WORLD / 32 - 2;
    this.onWater = options.onWater || false;
    this.x = this.owner.$.x;
    this.y = this.owner.$.y;
    return this.move();
  };

  Shell.prototype.update = function() {
    var collision, mode, ref, ref1, sfx, victim, x, y;
    this.move();
    collision = this.collide();
    if (collision) {
      mode = collision[0], victim = collision[1];
      sfx = victim.takeShellHit(this);
      if (mode === 'cell') {
        ref = this.cell.getWorldCoordinates(), x = ref[0], y = ref[1];
        this.world.soundEffect(sfx, x, y);
      } else {
        ref1 = this, x = ref1.x, y = ref1.y;
        victim.soundEffect(sfx);
      }
      return this.asplode(x, y, mode);
    } else if (this.lifespan-- === 0) {
      return this.asplode(this.x, this.y, 'eol');
    }
  };

  Shell.prototype.move = function() {
    this.radians || (this.radians = (256 - this.direction) * 2 * PI / 256);
    this.x += round(cos(this.radians) * 32);
    this.y += round(sin(this.radians) * 32);
    return this.updateCell();
  };

  Shell.prototype.collide = function() {
    var base, i, len, pill, ref, ref1, ref2, ref3, ref4, ref5, ref6, tank, terrainCollision, x, y;
    if ((pill = this.cell.pill) && pill.armour > 0 && pill !== ((ref = this.owner) != null ? ref.$ : void 0)) {
      ref1 = this.cell.getWorldCoordinates(), x = ref1[0], y = ref1[1];
      if (distance(this, {
        x: x,
        y: y
      }) <= 127) {
        return ['cell', pill];
      }
    }
    ref2 = this.world.tanks;
    for (i = 0, len = ref2.length; i < len; i++) {
      tank = ref2[i];
      if (tank !== ((ref3 = this.owner) != null ? ref3.$ : void 0) && tank.armour !== 255) {
        if (distance(this, tank) <= 127) {
          return ['tank', tank];
        }
      }
    }
    if (((ref4 = this.attribution) != null ? ref4.$ : void 0) === ((ref5 = this.owner) != null ? ref5.$ : void 0) && (base = this.cell.base) && base.armour > 4) {
      if (this.onWater || (((base != null ? base.owner : void 0) != null) && !base.owner.$.isAlly((ref6 = this.attribution) != null ? ref6.$ : void 0))) {
        return ['cell', base];
      }
    }
    terrainCollision = this.onWater ? !this.cell.isType('^', ' ', '%') : this.cell.isType('|', '}', '#', 'b');
    if (terrainCollision) {
      return ['cell', this.cell];
    }
  };

  Shell.prototype.asplode = function(x, y, mode) {
    var builder, i, len, ref, ref1, tank;
    ref = this.world.tanks;
    for (i = 0, len = ref.length; i < len; i++) {
      tank = ref[i];
      if (builder = tank.builder.$) {
        if ((ref1 = builder.order) !== builder.states.inTank && ref1 !== builder.states.parachuting) {
          if (mode === 'cell') {
            if (builder.cell === this.cell) {
              builder.kill();
            }
          } else {
            if (distance(this, builder) < (TILE_SIZE_WORLD / 2)) {
              builder.kill();
            }
          }
        }
      }
    }
    this.world.spawn(Explosion, x, y);
    this.world.spawn(MineExplosion, this.cell);
    return this.world.destroy(this);
  };

  return Shell;

})(BoloObject);

module.exports = Shell;


},{"../constants":22,"../helpers":23,"../object":26,"./explosion":29,"./mine_explosion":32}],34:[function(require,module,exports){
var BoloObject, Builder, Explosion, Fireball, MineExplosion, PI, Shell, TILE_SIZE_WORLD, Tank, ceil, cos, distance, floor, max, min, round, sin, sounds, sqrt,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

round = Math.round, floor = Math.floor, ceil = Math.ceil, min = Math.min, sqrt = Math.sqrt, max = Math.max, sin = Math.sin, cos = Math.cos, PI = Math.PI;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

distance = require('../helpers').distance;

BoloObject = require('../object');

sounds = require('../sounds');

Explosion = require('./explosion');

MineExplosion = require('./mine_explosion');

Shell = require('./shell');

Fireball = require('./fireball');

Builder = require('./builder');

Tank = (function(superClass) {
  extend(Tank, superClass);

  Tank.prototype.styled = true;

  function Tank(world) {
    this.world = world;
    this.on('netUpdate', (function(_this) {
      return function(changes) {
        if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y') || changes.armour === 255) {
          return _this.updateCell();
        }
      };
    })(this));
  }

  Tank.prototype.anySpawn = function() {
    this.updateCell();
    this.world.addTank(this);
    return this.on('finalize', (function(_this) {
      return function() {
        return _this.world.removeTank(_this);
      };
    })(this));
  };

  Tank.prototype.updateCell = function() {
    return this.cell = (this.x != null) && (this.y != null) ? this.world.map.cellAtWorld(this.x, this.y) : null;
  };

  Tank.prototype.reset = function() {
    var ref, startingPos;
    startingPos = this.world.map.getRandomStart();
    ref = startingPos.cell.getWorldCoordinates(), this.x = ref[0], this.y = ref[1];
    this.direction = startingPos.direction * 16;
    this.updateCell();
    this.speed = 0.00;
    this.slideTicks = 0;
    this.slideDirection = 0;
    this.accelerating = false;
    this.braking = false;
    this.turningClockwise = false;
    this.turningCounterClockwise = false;
    this.turnSpeedup = 0;
    this.shells = 40;
    this.mines = 0;
    this.armour = 40;
    this.trees = 0;
    this.reload = 0;
    this.shooting = false;
    this.firingRange = 7;
    this.waterTimer = 0;
    return this.onBoat = true;
  };

  Tank.prototype.serialization = function(isCreate, p) {
    var ref;
    if (isCreate) {
      p('B', 'team');
      p('O', 'builder');
    }
    p('B', 'armour');
    if (this.armour === 255) {
      p('O', 'fireball');
      this.x = this.y = null;
      return;
    } else {
      if ((ref = this.fireball) != null) {
        ref.clear();
      }
    }
    p('H', 'x');
    p('H', 'y');
    p('B', 'direction');
    p('B', 'speed', {
      tx: function(v) {
        return v * 4;
      },
      rx: function(v) {
        return v / 4;
      }
    });
    p('B', 'slideTicks');
    p('B', 'slideDirection');
    p('B', 'turnSpeedup', {
      tx: function(v) {
        return v + 50;
      },
      rx: function(v) {
        return v - 50;
      }
    });
    p('B', 'shells');
    p('B', 'mines');
    p('B', 'trees');
    p('B', 'reload');
    p('B', 'firingRange', {
      tx: function(v) {
        return v * 2;
      },
      rx: function(v) {
        return v / 2;
      }
    });
    p('B', 'waterTimer');
    p('f', 'accelerating');
    p('f', 'braking');
    p('f', 'turningClockwise');
    p('f', 'turningCounterClockwise');
    p('f', 'shooting');
    return p('f', 'onBoat');
  };

  Tank.prototype.getDirection16th = function() {
    return round((this.direction - 1) / 16) % 16;
  };

  Tank.prototype.getSlideDirection16th = function() {
    return round((this.slideDirection - 1) / 16) % 16;
  };

  Tank.prototype.getCarryingPillboxes = function() {
    var i, len, pill, ref, ref1, results;
    ref = this.world.map.pills;
    results = [];
    for (i = 0, len = ref.length; i < len; i++) {
      pill = ref[i];
      if (pill.inTank && ((ref1 = pill.owner) != null ? ref1.$ : void 0) === this) {
        results.push(pill);
      }
    }
    return results;
  };

  Tank.prototype.getTile = function() {
    var tx, ty;
    tx = this.getDirection16th();
    ty = this.onBoat ? 1 : 0;
    return [tx, ty];
  };

  Tank.prototype.isAlly = function(other) {
    return other === this || (this.team !== 255 && other.team === this.team);
  };

  Tank.prototype.increaseRange = function() {
    return this.firingRange = min(7, this.firingRange + 0.5);
  };

  Tank.prototype.decreaseRange = function() {
    return this.firingRange = max(1, this.firingRange - 0.5);
  };

  Tank.prototype.takeShellHit = function(shell) {
    var largeExplosion;
    this.armour -= 5;
    if (this.armour < 0) {
      largeExplosion = this.shells + this.mines > 20;
      this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, shell.direction, largeExplosion));
      this.kill();
    } else {
      this.slideTicks = 8;
      this.slideDirection = shell.direction;
      if (this.onBoat) {
        this.onBoat = false;
        this.speed = 0;
        if (this.cell.isType('^')) {
          this.sink();
        }
      }
    }
    return sounds.HIT_TANK;
  };

  Tank.prototype.takeMineHit = function() {
    var largeExplosion;
    this.armour -= 10;
    if (this.armour < 0) {
      largeExplosion = this.shells + this.mines > 20;
      this.ref('fireball', this.world.spawn(Fireball, this.x, this.y, this.direction, largeExplosion));
      return this.kill();
    } else if (this.onBoat) {
      this.onBoat = false;
      this.speed = 0;
      if (this.cell.isType('^')) {
        return this.sink();
      }
    }
  };

  Tank.prototype.spawn = function(team) {
    this.team = team;
    this.reset();
    return this.ref('builder', this.world.spawn(Builder, this));
  };

  Tank.prototype.update = function() {
    if (this.death()) {
      return;
    }
    this.shootOrReload();
    this.turn();
    this.accelerate();
    this.fixPosition();
    return this.move();
  };

  Tank.prototype.destroy = function() {
    this.dropPillboxes();
    return this.world.destroy(this.builder.$);
  };

  Tank.prototype.death = function() {
    if (this.armour !== 255) {
      return false;
    }
    if (this.world.authority && --this.respawnTimer === 0) {
      delete this.respawnTimer;
      this.reset();
      return false;
    }
    return true;
  };

  Tank.prototype.shootOrReload = function() {
    if (this.reload > 0) {
      this.reload--;
    }
    if (!(this.shooting && this.reload === 0 && this.shells > 0)) {
      return;
    }
    this.shells--;
    this.reload = 13;
    this.world.spawn(Shell, this, {
      range: this.firingRange,
      onWater: this.onBoat
    });
    return this.soundEffect(sounds.SHOOTING);
  };

  Tank.prototype.turn = function() {
    var acceleration, maxTurn;
    maxTurn = this.cell.getTankTurn(this);
    if (this.turningClockwise === this.turningCounterClockwise) {
      this.turnSpeedup = 0;
      return;
    }
    if (this.turningCounterClockwise) {
      acceleration = maxTurn;
      if (this.turnSpeedup < 10) {
        acceleration /= 2;
      }
      if (this.turnSpeedup < 0) {
        this.turnSpeedup = 0;
      }
      this.turnSpeedup++;
    } else {
      acceleration = -maxTurn;
      if (this.turnSpeedup > -10) {
        acceleration /= 2;
      }
      if (this.turnSpeedup > 0) {
        this.turnSpeedup = 0;
      }
      this.turnSpeedup--;
    }
    this.direction += acceleration;
    while (this.direction < 0) {
      this.direction += 256;
    }
    if (this.direction >= 256) {
      return this.direction %= 256;
    }
  };

  Tank.prototype.accelerate = function() {
    var acceleration, maxSpeed;
    maxSpeed = this.cell.getTankSpeed(this);
    if (this.speed > maxSpeed) {
      acceleration = -0.25;
    } else if (this.accelerating === this.braking) {
      acceleration = 0.00;
    } else if (this.accelerating) {
      acceleration = 0.25;
    } else {
      acceleration = -0.25;
    }
    if (acceleration > 0.00 && this.speed < maxSpeed) {
      return this.speed = min(maxSpeed, this.speed + acceleration);
    } else if (acceleration < 0.00 && this.speed > 0.00) {
      return this.speed = max(0.00, this.speed + acceleration);
    }
  };

  Tank.prototype.fixPosition = function() {
    var halftile, i, len, other, ref, results;
    if (this.cell.getTankSpeed(this) === 0) {
      halftile = TILE_SIZE_WORLD / 2;
      if (this.x % TILE_SIZE_WORLD >= halftile) {
        this.x++;
      } else {
        this.x--;
      }
      if (this.y % TILE_SIZE_WORLD >= halftile) {
        this.y++;
      } else {
        this.y--;
      }
      this.speed = max(0.00, this.speed - 1);
    }
    ref = this.world.tanks;
    results = [];
    for (i = 0, len = ref.length; i < len; i++) {
      other = ref[i];
      if (other !== this && other.armour !== 255) {
        if (!(distance(this, other) > 255)) {
          if (other.x < this.x) {
            this.x++;
          } else {
            this.x--;
          }
          if (other.y < this.y) {
            results.push(this.y++);
          } else {
            results.push(this.y--);
          }
        } else {
          results.push(void 0);
        }
      }
    }
    return results;
  };

  Tank.prototype.move = function() {
    var ahead, dx, dy, newx, newy, oldcell, rad, slowDown;
    dx = dy = 0;
    if (this.speed > 0) {
      rad = (256 - this.getDirection16th() * 16) * 2 * PI / 256;
      dx += round(cos(rad) * ceil(this.speed));
      dy += round(sin(rad) * ceil(this.speed));
    }
    if (this.slideTicks > 0) {
      rad = (256 - this.getSlideDirection16th() * 16) * 2 * PI / 256;
      dx += round(cos(rad) * 16);
      dy += round(sin(rad) * 16);
      this.slideTicks--;
    }
    newx = this.x + dx;
    newy = this.y + dy;
    slowDown = true;
    if (dx !== 0) {
      ahead = dx > 0 ? newx + 64 : newx - 64;
      ahead = this.world.map.cellAtWorld(ahead, newy);
      if (ahead.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!(this.onBoat && !ahead.isType(' ', '^') && this.speed < 16)) {
          this.x = newx;
        }
      }
    }
    if (dy !== 0) {
      ahead = dy > 0 ? newy + 64 : newy - 64;
      ahead = this.world.map.cellAtWorld(newx, ahead);
      if (ahead.getTankSpeed(this) !== 0) {
        slowDown = false;
        if (!(this.onBoat && !ahead.isType(' ', '^') && this.speed < 16)) {
          this.y = newy;
        }
      }
    }
    if (!(dx === 0 && dy === 0)) {
      if (slowDown) {
        this.speed = max(0.00, this.speed - 1);
      }
      oldcell = this.cell;
      this.updateCell();
      if (oldcell !== this.cell) {
        this.checkNewCell(oldcell);
      }
    }
    if (!this.onBoat && this.speed <= 3 && this.cell.isType(' ')) {
      if (++this.waterTimer === 15) {
        if (this.shells !== 0 || this.mines !== 0) {
          this.soundEffect(sounds.BUBBLES);
        }
        this.shells = max(0, this.shells - 1);
        this.mines = max(0, this.mines - 1);
        return this.waterTimer = 0;
      }
    } else {
      return this.waterTimer = 0;
    }
  };

  Tank.prototype.checkNewCell = function(oldcell) {
    if (this.onBoat) {
      if (!this.cell.isType(' ', '^')) {
        this.leaveBoat(oldcell);
      }
    } else {
      if (this.cell.isType('^')) {
        return this.sink();
      }
      if (this.cell.isType('b')) {
        this.enterBoat();
      }
    }
    if (this.cell.mine) {
      return this.world.spawn(MineExplosion, this.cell);
    }
  };

  Tank.prototype.leaveBoat = function(oldcell) {
    var x, y;
    if (this.cell.isType('b')) {
      this.cell.setType(' ', false, 0);
      x = (this.cell.x + 0.5) * TILE_SIZE_WORLD;
      y = (this.cell.y + 0.5) * TILE_SIZE_WORLD;
      this.world.spawn(Explosion, x, y);
      return this.world.soundEffect(sounds.SHOT_BUILDING, x, y);
    } else {
      if (oldcell.isType(' ')) {
        oldcell.setType('b', false, 0);
      }
      return this.onBoat = false;
    }
  };

  Tank.prototype.enterBoat = function() {
    this.cell.setType(' ', false, 0);
    return this.onBoat = true;
  };

  Tank.prototype.sink = function() {
    this.world.soundEffect(sounds.TANK_SINKING, this.x, this.y);
    return this.kill();
  };

  Tank.prototype.kill = function() {
    this.dropPillboxes();
    this.x = this.y = null;
    this.armour = 255;
    return this.respawnTimer = 255;
  };

  Tank.prototype.dropPillboxes = function() {
    var cell, delta, ey, i, pill, pills, ref, ref1, sy, width, x, y;
    pills = this.getCarryingPillboxes();
    if (pills.length === 0) {
      return;
    }
    x = this.cell.x;
    sy = this.cell.y;
    width = sqrt(pills.length);
    delta = floor(width / 2);
    width = round(width);
    x -= delta;
    sy -= delta;
    ey = sy + width;
    while (pills.length !== 0) {
      for (y = i = ref = sy, ref1 = ey; ref <= ref1 ? i < ref1 : i > ref1; y = ref <= ref1 ? ++i : --i) {
        cell = this.world.map.cellAtTile(x, y);
        if ((cell.base != null) || (cell.pill != null) || cell.isType('|', '}', 'b')) {
          continue;
        }
        if (!(pill = pills.pop())) {
          return;
        }
        pill.placeAt(cell);
      }
      x += 1;
    }
  };

  return Tank;

})(BoloObject);

module.exports = Tank;


},{"../constants":22,"../helpers":23,"../object":26,"../sounds":37,"./builder":28,"./explosion":29,"./fireball":30,"./mine_explosion":32,"./shell":33}],35:[function(require,module,exports){
var BoloObject, TILE_SIZE_WORLD, WorldBase, distance, max, min, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

min = Math.min, max = Math.max;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

distance = require('../helpers').distance;

BoloObject = require('../object');

sounds = require('../sounds');

WorldBase = (function(superClass) {
  extend(WorldBase, superClass);

  function WorldBase(world_or_map, x, y, owner_idx, armour, shells, mines) {
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.shells = shells;
    this.mines = mines;
    if (arguments.length === 1) {
      this.world = world_or_map;
    } else {
      this.x = (x + 0.5) * TILE_SIZE_WORLD;
      this.y = (y + 0.5) * TILE_SIZE_WORLD;
      world_or_map.cellAtTile(x, y).setType('=', false, -1);
    }
    this.on('netUpdate', (function(_this) {
      return function(changes) {
        if (changes.hasOwnProperty('owner')) {
          return _this.updateOwner();
        }
      };
    })(this));
  }

  WorldBase.prototype.serialization = function(isCreate, p) {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }
    p('O', 'owner');
    p('O', 'refueling');
    if (this.refueling) {
      p('B', 'refuelCounter');
    }
    p('B', 'armour');
    p('B', 'shells');
    return p('B', 'mines');
  };

  WorldBase.prototype.updateOwner = function() {
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
    } else {
      this.owner_idx = this.team = 255;
    }
    return this.cell.retile();
  };

  WorldBase.prototype.anySpawn = function() {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    return this.cell.base = this;
  };

  WorldBase.prototype.update = function() {
    var amount;
    if (this.refueling && (this.refueling.$.cell !== this.cell || this.refueling.$.armour === 255)) {
      this.ref('refueling', null);
    }
    if (!this.refueling) {
      return this.findSubject();
    }
    if (--this.refuelCounter !== 0) {
      return;
    }
    if (this.armour > 0 && this.refueling.$.armour < 40) {
      amount = min(5, this.armour, 40 - this.refueling.$.armour);
      this.refueling.$.armour += amount;
      this.armour -= amount;
      return this.refuelCounter = 46;
    } else if (this.shells > 0 && this.refueling.$.shells < 40) {
      this.refueling.$.shells += 1;
      this.shells -= 1;
      return this.refuelCounter = 7;
    } else if (this.mines > 0 && this.refueling.$.mines < 40) {
      this.refueling.$.mines += 1;
      this.mines -= 1;
      return this.refuelCounter = 7;
    } else {
      return this.refuelCounter = 1;
    }
  };

  WorldBase.prototype.findSubject = function() {
    var canClaim, i, j, len, len1, other, ref, tank, tanks;
    tanks = (function() {
      var i, len, ref, results;
      ref = this.world.tanks;
      results = [];
      for (i = 0, len = ref.length; i < len; i++) {
        tank = ref[i];
        if (tank.armour !== 255 && tank.cell === this.cell) {
          results.push(tank);
        }
      }
      return results;
    }).call(this);
    for (i = 0, len = tanks.length; i < len; i++) {
      tank = tanks[i];
      if ((ref = this.owner) != null ? ref.$.isAlly(tank) : void 0) {
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        canClaim = true;
        for (j = 0, len1 = tanks.length; j < len1; j++) {
          other = tanks[j];
          if (other !== tank) {
            if (!tank.isAlly(other)) {
              canClaim = false;
            }
          }
        }
        if (canClaim) {
          this.ref('owner', tank);
          this.updateOwner();
          this.owner.on('destroy', (function(_this) {
            return function() {
              _this.ref('owner', null);
              return _this.updateOwner();
            };
          })(this));
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        }
      }
    }
  };

  WorldBase.prototype.takeShellHit = function(shell) {
    var i, len, pill, ref, ref1;
    if (this.owner) {
      ref = this.world.map.pills;
      for (i = 0, len = ref.length; i < len; i++) {
        pill = ref[i];
        if (!(pill.inTank || pill.carried) && pill.armour > 0) {
          if (((ref1 = pill.owner) != null ? ref1.$.isAlly(this.owner.$) : void 0) && distance(this, pill) <= 2304) {
            pill.aggravate();
          }
        }
      }
    }
    this.armour = max(0, this.armour - 5);
    return sounds.SHOT_BUILDING;
  };

  return WorldBase;

})(BoloObject);

module.exports = WorldBase;


},{"../constants":22,"../helpers":23,"../object":26,"../sounds":37}],36:[function(require,module,exports){
var BoloObject, PI, Shell, TILE_SIZE_WORLD, WorldPillbox, ceil, cos, distance, heading, max, min, ref, round, sin, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

min = Math.min, max = Math.max, round = Math.round, ceil = Math.ceil, PI = Math.PI, cos = Math.cos, sin = Math.sin;

TILE_SIZE_WORLD = require('../constants').TILE_SIZE_WORLD;

ref = require('../helpers'), distance = ref.distance, heading = ref.heading;

BoloObject = require('../object');

sounds = require('../sounds');

Shell = require('./shell');

WorldPillbox = (function(superClass) {
  extend(WorldPillbox, superClass);

  function WorldPillbox(world_or_map, x, y, owner_idx, armour, speed) {
    this.owner_idx = owner_idx;
    this.armour = armour;
    this.speed = speed;
    if (arguments.length === 1) {
      this.world = world_or_map;
    } else {
      this.x = (x + 0.5) * TILE_SIZE_WORLD;
      this.y = (y + 0.5) * TILE_SIZE_WORLD;
    }
    this.on('netUpdate', (function(_this) {
      return function(changes) {
        var ref1;
        if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
          _this.updateCell();
        }
        if (changes.hasOwnProperty('inTank') || changes.hasOwnProperty('carried')) {
          _this.updateCell();
        }
        if (changes.hasOwnProperty('owner')) {
          _this.updateOwner();
        }
        if (changes.hasOwnProperty('armour')) {
          return (ref1 = _this.cell) != null ? ref1.retile() : void 0;
        }
      };
    })(this));
  }

  WorldPillbox.prototype.updateCell = function() {
    if (this.cell != null) {
      delete this.cell.pill;
      this.cell.retile();
    }
    if (this.inTank || this.carried) {
      return this.cell = null;
    } else {
      this.cell = this.world.map.cellAtWorld(this.x, this.y);
      this.cell.pill = this;
      return this.cell.retile();
    }
  };

  WorldPillbox.prototype.updateOwner = function() {
    var ref1;
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
    } else {
      this.owner_idx = this.team = 255;
    }
    return (ref1 = this.cell) != null ? ref1.retile() : void 0;
  };

  WorldPillbox.prototype.serialization = function(isCreate, p) {
    p('O', 'owner');
    p('f', 'inTank');
    p('f', 'carried');
    p('f', 'haveTarget');
    if (!(this.inTank || this.carried)) {
      p('H', 'x');
      p('H', 'y');
    } else {
      this.x = this.y = null;
    }
    p('B', 'armour');
    p('B', 'speed');
    p('B', 'coolDown');
    return p('B', 'reload');
  };

  WorldPillbox.prototype.placeAt = function(cell) {
    var ref1;
    this.inTank = this.carried = false;
    ref1 = cell.getWorldCoordinates(), this.x = ref1[0], this.y = ref1[1];
    this.updateCell();
    return this.reset();
  };

  WorldPillbox.prototype.spawn = function() {
    return this.reset();
  };

  WorldPillbox.prototype.reset = function() {
    this.coolDown = 32;
    return this.reload = 0;
  };

  WorldPillbox.prototype.anySpawn = function() {
    return this.updateCell();
  };

  WorldPillbox.prototype.update = function() {
    var d, direction, i, j, len, len1, rad, ref1, ref2, ref3, tank, target, targetDistance, x, y;
    if (this.inTank || this.carried) {
      return;
    }
    if (this.armour === 0) {
      this.haveTarget = false;
      ref1 = this.world.tanks;
      for (i = 0, len = ref1.length; i < len; i++) {
        tank = ref1[i];
        if (tank.armour !== 255) {
          if (tank.cell === this.cell) {
            this.inTank = true;
            this.x = this.y = null;
            this.updateCell();
            this.ref('owner', tank);
            this.updateOwner();
            break;
          }
        }
      }
      return;
    }
    this.reload = min(this.speed, this.reload + 1);
    if (--this.coolDown === 0) {
      this.coolDown = 32;
      this.speed = min(100, this.speed + 1);
    }
    if (!(this.reload >= this.speed)) {
      return;
    }
    target = null;
    targetDistance = 2e308;
    ref2 = this.world.tanks;
    for (j = 0, len1 = ref2.length; j < len1; j++) {
      tank = ref2[j];
      if (!(tank.armour !== 255 && !((ref3 = this.owner) != null ? ref3.$.isAlly(tank) : void 0))) {
        continue;
      }
      d = distance(this, tank);
      if (d <= 2048 && d < targetDistance) {
        target = tank;
        targetDistance = d;
      }
    }
    if (!target) {
      return this.haveTarget = false;
    }
    if (this.haveTarget) {
      rad = (256 - target.getDirection16th() * 16) * 2 * PI / 256;
      x = target.x + targetDistance / 32 * round(cos(rad) * ceil(target.speed));
      y = target.y + targetDistance / 32 * round(sin(rad) * ceil(target.speed));
      direction = 256 - heading(this, {
        x: x,
        y: y
      }) * 256 / (2 * PI);
      this.world.spawn(Shell, this, {
        direction: direction
      });
      this.soundEffect(sounds.SHOOTING);
    }
    this.haveTarget = true;
    return this.reload = 0;
  };

  WorldPillbox.prototype.aggravate = function() {
    this.coolDown = 32;
    return this.speed = max(6, round(this.speed / 2));
  };

  WorldPillbox.prototype.takeShellHit = function(shell) {
    this.aggravate();
    this.armour = max(0, this.armour - 1);
    this.cell.retile();
    return sounds.SHOT_BUILDING;
  };

  WorldPillbox.prototype.takeExplosionHit = function() {
    this.armour = max(0, this.armour - 5);
    return this.cell.retile();
  };

  WorldPillbox.prototype.repair = function(trees) {
    var used;
    used = min(trees, ceil((15 - this.armour) / 4));
    this.armour = min(15, this.armour + used * 4);
    this.cell.retile();
    return used;
  };

  return WorldPillbox;

})(BoloObject);

module.exports = WorldPillbox;


},{"../constants":22,"../helpers":23,"../object":26,"../sounds":37,"./shell":33}],37:[function(require,module,exports){
exports.BIG_EXPLOSION = 0;

exports.BUBBLES = 1;

exports.FARMING_TREE = 2;

exports.HIT_TANK = 3;

exports.MAN_BUILDING = 4;

exports.MAN_DYING = 5;

exports.MAN_LAY_MINE = 6;

exports.MINE_EXPLOSION = 7;

exports.SHOOTING = 8;

exports.SHOT_BUILDING = 9;

exports.SHOT_TREE = 10;

exports.TANK_SINKING = 11;


},{}],38:[function(require,module,exports){
var buildPacker, buildUnpacker, fromUint16, fromUint32, fromUint8, pack, toUint16, toUint32, toUint8, unpack;

toUint8 = function(n) {
  return [n & 0xFF];
};

toUint16 = function(n) {
  return [(n & 0xFF00) >> 8, n & 0x00FF];
};

toUint32 = function(n) {
  return [(n & 0xFF000000) >> 24, (n & 0x00FF0000) >> 16, (n & 0x0000FF00) >> 8, n & 0x000000FF];
};

fromUint8 = function(d, o) {
  return d[o];
};

fromUint16 = function(d, o) {
  return (d[o] << 8) + d[o + 1];
};

fromUint32 = function(d, o) {
  return (d[o] << 24) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];
};

buildPacker = function() {
  var bitIndex, bits, data, flushBitFields, retval;
  data = [];
  bits = null;
  bitIndex = 0;
  flushBitFields = function() {
    if (bits === null) {
      return;
    }
    data.push(bits);
    return bits = null;
  };
  retval = function(type, value) {
    if (type === 'f') {
      if (bits === null) {
        bits = !!value ? 1 : 0;
        return bitIndex = 1;
      } else {
        if (!!value) {
          bits |= 1 << bitIndex;
        }
        bitIndex++;
        if (bitIndex === 8) {
          return flushBitFields();
        }
      }
    } else {
      flushBitFields();
      return data = data.concat((function() {
        switch (type) {
          case 'B':
            return toUint8(value);
          case 'H':
            return toUint16(value);
          case 'I':
            return toUint32(value);
          default:
            throw new Error("Unknown format character " + type);
        }
      })());
    }
  };
  retval.finish = function() {
    flushBitFields();
    return data;
  };
  return retval;
};

buildUnpacker = function(data, offset) {
  var bitIndex, idx, retval;
  offset || (offset = 0);
  idx = offset;
  bitIndex = 0;
  retval = function(type) {
    var bit, bytes, ref, value;
    if (type === 'f') {
      bit = (1 << bitIndex) & data[idx];
      value = bit > 0;
      bitIndex++;
      if (bitIndex === 8) {
        idx++;
        bitIndex = 0;
      }
    } else {
      if (bitIndex !== 0) {
        idx++;
        bitIndex = 0;
      }
      ref = (function() {
        switch (type) {
          case 'B':
            return [fromUint8(data, idx), 1];
          case 'H':
            return [fromUint16(data, idx), 2];
          case 'I':
            return [fromUint32(data, idx), 4];
          default:
            throw new Error("Unknown format character " + type);
        }
      })(), value = ref[0], bytes = ref[1];
      idx += bytes;
    }
    return value;
  };
  retval.finish = function() {
    if (bitIndex !== 0) {
      idx++;
    }
    return idx - offset;
  };
  return retval;
};

pack = function(fmt) {
  var i, j, len, packer, type, value;
  packer = buildPacker();
  for (i = j = 0, len = fmt.length; j < len; i = ++j) {
    type = fmt[i];
    value = arguments[i + 1];
    packer(type, value);
  }
  return packer.finish();
};

unpack = function(fmt, data, offset) {
  var type, unpacker, values;
  unpacker = buildUnpacker(data, offset);
  values = (function() {
    var j, len, results;
    results = [];
    for (j = 0, len = fmt.length; j < len; j++) {
      type = fmt[j];
      results.push(unpacker(type));
    }
    return results;
  })();
  return [values, unpacker.finish()];
};

exports.buildPacker = buildPacker;

exports.buildUnpacker = buildUnpacker;

exports.pack = pack;

exports.unpack = unpack;


},{}],39:[function(require,module,exports){
var TEAM_COLORS;

TEAM_COLORS = [
  {
    r: 255,
    g: 0,
    b: 0,
    name: 'red'
  }, {
    r: 0,
    g: 0,
    b: 255,
    name: 'blue'
  }, {
    r: 0,
    g: 255,
    b: 0,
    name: 'green'
  }, {
    r: 0,
    g: 255,
    b: 255,
    name: 'cyan'
  }, {
    r: 255,
    g: 255,
    b: 0,
    name: 'yellow'
  }, {
    r: 255,
    g: 0,
    b: 255,
    name: 'magenta'
  }
];

module.exports = TEAM_COLORS;


},{}],40:[function(require,module,exports){
var FloodFill, Map, TERRAIN_TYPES, TERRAIN_TYPE_ATTRIBUTES, TILE_SIZE_PIXELS, TILE_SIZE_WORLD, WorldBase, WorldMap, WorldMapCell, WorldPillbox, extendTerrainMap, floor, net, random, ref, ref1, round, sounds,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

round = Math.round, random = Math.random, floor = Math.floor;

ref = require('./constants'), TILE_SIZE_WORLD = ref.TILE_SIZE_WORLD, TILE_SIZE_PIXELS = ref.TILE_SIZE_PIXELS;

ref1 = require('./map'), Map = ref1.Map, TERRAIN_TYPES = ref1.TERRAIN_TYPES;

net = require('./net');

sounds = require('./sounds');

WorldPillbox = require('./objects/world_pillbox');

WorldBase = require('./objects/world_base');

FloodFill = require('./objects/flood_fill');

TERRAIN_TYPE_ATTRIBUTES = {
  '|': {
    tankSpeed: 0,
    tankTurn: 0.00,
    manSpeed: 0
  },
  ' ': {
    tankSpeed: 3,
    tankTurn: 0.25,
    manSpeed: 0
  },
  '~': {
    tankSpeed: 3,
    tankTurn: 0.25,
    manSpeed: 4
  },
  '%': {
    tankSpeed: 3,
    tankTurn: 0.25,
    manSpeed: 4
  },
  '=': {
    tankSpeed: 16,
    tankTurn: 1.00,
    manSpeed: 16
  },
  '#': {
    tankSpeed: 6,
    tankTurn: 0.50,
    manSpeed: 8
  },
  ':': {
    tankSpeed: 3,
    tankTurn: 0.25,
    manSpeed: 4
  },
  '.': {
    tankSpeed: 12,
    tankTurn: 1.00,
    manSpeed: 16
  },
  '}': {
    tankSpeed: 0,
    tankTurn: 0.00,
    manSpeed: 0
  },
  'b': {
    tankSpeed: 16,
    tankTurn: 1.00,
    manSpeed: 16
  },
  '^': {
    tankSpeed: 3,
    tankTurn: 0.50,
    manSpeed: 0
  }
};

extendTerrainMap = function() {
  var ascii, attributes, key, results, type, value;
  results = [];
  for (ascii in TERRAIN_TYPE_ATTRIBUTES) {
    attributes = TERRAIN_TYPE_ATTRIBUTES[ascii];
    type = TERRAIN_TYPES[ascii];
    results.push((function() {
      var results1;
      results1 = [];
      for (key in attributes) {
        value = attributes[key];
        results1.push(type[key] = value);
      }
      return results1;
    })());
  }
  return results;
};

extendTerrainMap();

WorldMapCell = (function(superClass) {
  extend(WorldMapCell, superClass);

  function WorldMapCell(map, x, y) {
    WorldMapCell.__super__.constructor.apply(this, arguments);
    this.life = 0;
  }

  WorldMapCell.prototype.isObstacle = function() {
    var ref2;
    return ((ref2 = this.pill) != null ? ref2.armour : void 0) > 0 || this.type.tankSpeed === 0;
  };

  WorldMapCell.prototype.hasTankOnBoat = function() {
    var i, len, ref2, tank;
    ref2 = this.map.world.tanks;
    for (i = 0, len = ref2.length; i < len; i++) {
      tank = ref2[i];
      if (tank.armour !== 255 && tank.cell === this) {
        if (tank.onBoat) {
          return true;
        }
      }
    }
    return false;
  };

  WorldMapCell.prototype.getTankSpeed = function(tank) {
    var ref2, ref3;
    if (((ref2 = this.pill) != null ? ref2.armour : void 0) > 0) {
      return 0;
    }
    if ((ref3 = this.base) != null ? ref3.owner : void 0) {
      if (!(this.base.owner.$.isAlly(tank) || this.base.armour <= 9)) {
        return 0;
      }
    }
    if (tank.onBoat && this.isType('^', ' ')) {
      return 16;
    }
    return this.type.tankSpeed;
  };

  WorldMapCell.prototype.getTankTurn = function(tank) {
    var ref2, ref3;
    if (((ref2 = this.pill) != null ? ref2.armour : void 0) > 0) {
      return 0.00;
    }
    if ((ref3 = this.base) != null ? ref3.owner : void 0) {
      if (!(this.base.owner.$.isAlly(tank) || this.base.armour <= 9)) {
        return 0.00;
      }
    }
    if (tank.onBoat && this.isType('^', ' ')) {
      return 1.00;
    }
    return this.type.tankTurn;
  };

  WorldMapCell.prototype.getManSpeed = function(man) {
    var ref2, ref3, tank;
    tank = man.owner.$;
    if (((ref2 = this.pill) != null ? ref2.armour : void 0) > 0) {
      return 0;
    }
    if (((ref3 = this.base) != null ? ref3.owner : void 0) != null) {
      if (!(this.base.owner.$.isAlly(tank) || this.base.armour <= 9)) {
        return 0;
      }
    }
    return this.type.manSpeed;
  };

  WorldMapCell.prototype.getPixelCoordinates = function() {
    return [(this.x + 0.5) * TILE_SIZE_PIXELS, (this.y + 0.5) * TILE_SIZE_PIXELS];
  };

  WorldMapCell.prototype.getWorldCoordinates = function() {
    return [(this.x + 0.5) * TILE_SIZE_WORLD, (this.y + 0.5) * TILE_SIZE_WORLD];
  };

  WorldMapCell.prototype.setType = function(newType, mine, retileRadius) {
    var hadMine, oldLife, oldType, ref2, ref3;
    ref2 = [this.type, this.mine, this.life], oldType = ref2[0], hadMine = ref2[1], oldLife = ref2[2];
    WorldMapCell.__super__.setType.apply(this, arguments);
    this.life = (function() {
      switch (this.type.ascii) {
        case '.':
          return 5;
        case '}':
          return 5;
        case ':':
          return 5;
        case '~':
          return 4;
        default:
          return 0;
      }
    }).call(this);
    return (ref3 = this.map.world) != null ? ref3.mapChanged(this, oldType, hadMine, oldLife) : void 0;
  };

  WorldMapCell.prototype.takeShellHit = function(shell) {
    var neigh, nextType, ref2, ref3, sfx;
    sfx = sounds.SHOT_BUILDING;
    if (this.isType('.', '}', ':', '~')) {
      if (--this.life === 0) {
        nextType = (function() {
          switch (this.type.ascii) {
            case '.':
              return '~';
            case '}':
              return ':';
            case ':':
              return ' ';
            case '~':
              return ' ';
          }
        }).call(this);
        this.setType(nextType);
      } else {
        if ((ref2 = this.map.world) != null) {
          ref2.mapChanged(this, this.type, this.mine);
        }
      }
    } else if (this.isType('#')) {
      this.setType('.');
      sfx = sounds.SHOT_TREE;
    } else if (this.isType('=')) {
      neigh = shell.direction >= 224 || shell.direction < 32 ? this.neigh(1, 0) : shell.direction >= 32 && shell.direction < 96 ? this.neigh(0, -1) : shell.direction >= 96 && shell.direction < 160 ? this.neigh(-1, 0) : this.neigh(0, 1);
      if (neigh.isType(' ', '^')) {
        this.setType(' ');
      }
    } else {
      nextType = (function() {
        switch (this.type.ascii) {
          case '|':
            return '}';
          case 'b':
            return ' ';
        }
      }).call(this);
      this.setType(nextType);
    }
    if (this.isType(' ')) {
      if ((ref3 = this.map.world) != null) {
        ref3.spawn(FloodFill, this);
      }
    }
    return sfx;
  };

  WorldMapCell.prototype.takeExplosionHit = function() {
    var ref2;
    if (this.pill != null) {
      return this.pill.takeExplosionHit();
    }
    if (this.isType('b')) {
      this.setType(' ');
    } else if (!this.isType(' ', '^', 'b')) {
      this.setType('%');
    } else {
      return;
    }
    return (ref2 = this.map.world) != null ? ref2.spawn(FloodFill, this) : void 0;
  };

  return WorldMapCell;

})(Map.prototype.CellClass);

WorldMap = (function(superClass) {
  extend(WorldMap, superClass);

  function WorldMap() {
    return WorldMap.__super__.constructor.apply(this, arguments);
  }

  WorldMap.prototype.CellClass = WorldMapCell;

  WorldMap.prototype.PillboxClass = WorldPillbox;

  WorldMap.prototype.BaseClass = WorldBase;

  WorldMap.prototype.cellAtPixel = function(x, y) {
    return this.cellAtTile(floor(x / TILE_SIZE_PIXELS), floor(y / TILE_SIZE_PIXELS));
  };

  WorldMap.prototype.cellAtWorld = function(x, y) {
    return this.cellAtTile(floor(x / TILE_SIZE_WORLD), floor(y / TILE_SIZE_WORLD));
  };

  WorldMap.prototype.getRandomStart = function() {
    return this.starts[round(random() * (this.starts.length - 1))];
  };

  return WorldMap;

})(Map);

module.exports = WorldMap;


},{"./constants":22,"./map":24,"./net":25,"./objects/flood_fill":31,"./objects/world_base":35,"./objects/world_pillbox":36,"./sounds":37}],41:[function(require,module,exports){
var BoloWorldMixin;

BoloWorldMixin = {
  boloInit: function() {
    return this.tanks = [];
  },
  addTank: function(tank) {
    tank.tank_idx = this.tanks.length;
    this.tanks.push(tank);
    if (this.authority) {
      return this.resolveMapObjectOwners();
    }
  },
  removeTank: function(tank) {
    var i, j, ref, ref1;
    this.tanks.splice(tank.tank_idx, 1);
    for (i = j = ref = tank.tank_idx, ref1 = this.tanks.length; ref <= ref1 ? j < ref1 : j > ref1; i = ref <= ref1 ? ++j : --j) {
      this.tanks[i].tank_idx = i;
    }
    if (this.authority) {
      return this.resolveMapObjectOwners();
    }
  },
  getAllMapObjects: function() {
    return this.map.pills.concat(this.map.bases);
  },
  spawnMapObjects: function() {
    var j, len, obj, ref;
    ref = this.getAllMapObjects();
    for (j = 0, len = ref.length; j < len; j++) {
      obj = ref[j];
      obj.world = this;
      this.insert(obj);
      obj.spawn();
      obj.anySpawn();
    }
  },
  resolveMapObjectOwners: function() {
    var j, len, obj, ref, ref1;
    ref = this.getAllMapObjects();
    for (j = 0, len = ref.length; j < len; j++) {
      obj = ref[j];
      obj.ref('owner', this.tanks[obj.owner_idx]);
      if ((ref1 = obj.cell) != null) {
        ref1.retile();
      }
    }
  }
};

module.exports = BoloWorldMixin;


},{}]},{},[12]);
