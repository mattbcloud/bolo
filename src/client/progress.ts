/**
 * Progress tracking
 *
 * A generic progress tracking mechanism. Typical usage is as follows:
 *
 *  * Add a number of tasks using calls to `add`.
 *  * Install listeners for `progress` and `complete`.
 *  * Call `wrapUp` to signal all tasks have been started.
 *  * Wait for the `complete` signal, and continue as normal.
 *
 * Typically, you specify an amount of tasks that are running, but it could just as well be a
 * remaining byte count or a percentage. The `amount` parameters are arbitrary numbers.
 *
 * An instance of `Progress` implements the `ProgressEvent` interface in the Progress Events
 * specification published by W3C. The `Progress` object itself is passed on `progress` events,
 * thus it should work for any loose implementation of a progress events consumer.
 */

import { EventEmitter } from '../villain/event-emitter';

export class Progress extends EventEmitter {
  lengthComputable: boolean = true;
  loaded: number = 0;
  total: number = 0;
  wrappingUp: boolean = false;

  constructor(initialAmount?: number) {
    super();
    this.total = initialAmount !== undefined ? initialAmount : 0;
  }

  /**
   * Add the given amount to the total. `amount` is optional, and defaults to 1. The return value is
   * a function that is a shortcut for `step(amount)`, and can be used as a callback for an event
   * listener. If given, the returned function will call `cb` as well, allowing for chaining.
   */
  add(amount?: number, cb?: () => void): () => void;
  add(cb?: () => void): () => void;
  add(...args: any[]): () => void {
    let amount = 1;
    let cb: (() => void) | null = null;

    if (typeof args[0] === 'number') {
      amount = args.shift();
    }
    if (typeof args[0] === 'function') {
      cb = args.shift();
    }

    this.total += amount;
    this.emit('progress', this);

    return () => {
      this.step(amount);
      cb?.();
    };
  }

  /**
   * Mark the given amount as loaded. `amount` is optional, and defaults to 1.
   */
  step(amount: number = 1): void {
    this.loaded += amount;
    this.emit('progress', this);
    this.checkComplete();
  }

  /**
   * Reset the both `total` and `loaded` counters.
   */
  set(total: number, loaded: number): void {
    this.total = total;
    this.loaded = loaded;
    this.emit('progress', this);
    this.checkComplete();
  }

  /**
   * Signal that all tasks are running, and no further `add` calls will be made. From this point on,
   * a `complete` event may be emitted. (Note: it may also be emitted from *within* this method.)
   */
  wrapUp(): void {
    this.wrappingUp = true;
    this.checkComplete();
  }

  /**
   * An internal helper that emits the 'complete' signal when appropriate.
   */
  private checkComplete(): void {
    if (!this.wrappingUp || this.loaded < this.total) return;
    this.emit('complete');
  }
}

export default Progress;
