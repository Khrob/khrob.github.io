/**
 * Lightweight event emitter for MagicMat modules.
 * Provides on/off/once/emit pub/sub pattern.
 */
export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  off(event, fn) {
    const list = this._listeners[event];
    if (!list) return this;
    if (fn) {
      this._listeners[event] = list.filter(f => f !== fn && f._wrapped !== fn);
    } else {
      delete this._listeners[event];
    }
    return this;
  }

  once(event, fn) {
    const wrapped = (...args) => { this.off(event, wrapped); fn(...args); };
    wrapped._wrapped = fn;
    return this.on(event, wrapped);
  }

  emit(event, ...args) {
    const list = this._listeners[event];
    if (!list) return;
    for (const fn of [...list]) fn(...args);
  }

  removeAllListeners() {
    this._listeners = {};
    return this;
  }
}
