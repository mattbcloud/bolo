/**
 * Soundkit
 *
 * A thin audio layer.
 */

export class SoundKit {
  private sounds: Record<string, string> = {};
  public isSupported: boolean = false;

  constructor() {
    // FIXME: Probably want to switch to has.js at some point.
    if (typeof Audio !== 'undefined') {
      const dummy = new Audio();
      this.isSupported = typeof dummy.canPlayType === 'function';
    }
  }

  /**
   * Register the effect at the given url with the given name, and build a helper method
   * on this instance to play the sound effect.
   */
  register(name: string, url: string): void {
    this.sounds[name] = url;
    (this as any)[name] = () => this.play(name);
  }

  /**
   * Wait for the given effect to be loaded, then register it.
   */
  load(name: string, url: string, cb?: () => void): void {
    this.register(name, url);
    if (!this.isSupported) {
      cb?.();
      return;
    }

    const loader = new Audio();

    if (cb) {
      loader.addEventListener('canplaythrough', cb, { once: true });
    }

    loader.addEventListener(
      'error',
      (e: Event) => {
        const mediaError = (e.target as HTMLAudioElement).error;
        // FIXME: support more error codes.
        if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
          this.isSupported = false;
          cb?.();
        }
      },
      { once: true }
    );

    loader.src = url;
    loader.load();
  }

  /**
   * Play the effect called `name`.
   */
  play(name: string): HTMLAudioElement | undefined {
    if (!this.isSupported) return;

    const effect = new Audio();
    effect.src = this.sounds[name];
    effect.play();
    return effect;
  }
}

export default SoundKit;
