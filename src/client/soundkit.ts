/**
 * Soundkit
 *
 * A thin audio layer. Each effect is downloaded and decoded once, in load(), and every play()
 * starts a new source on that decoded buffer: overlapping plays work, and playing makes no
 * network request. (It used to create a new Audio element per play, which fetched the file
 * from the server again every time a sound played.)
 */

export class SoundKit {
  private sounds: Record<string, string> = {};
  private buffers: Record<string, AudioBuffer> = {};
  private context: AudioContext | null = null;
  public isSupported: boolean = false;

  constructor() {
    this.isSupported = typeof AudioContext !== 'undefined';
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
   * Download and decode the given effect, then register it. `cb` is called once either way,
   * so a sound that fails to load can't hold up the loading screen: a missing or unreachable
   * file leaves just that sound silent, and a file the browser can't decode turns sound off.
   */
  load(name: string, url: string, cb?: () => void): void {
    this.register(name, url);
    if (!this.isSupported) {
      cb?.();
      return;
    }

    const context = this.getContext();
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(
        (data) => context.decodeAudioData(data).then(
          (buffer) => { this.buffers[name] = buffer; },
          (err) => {
            this.isSupported = false;
            console.warn(`[SOUND] can't decode ${url}; sound is off:`, err);
          },
        ),
        (err) => console.warn(`[SOUND] couldn't load ${url}:`, err),
      )
      .finally(() => cb?.());
  }

  /**
   * Play the effect called `name`.
   */
  play(name: string): AudioBufferSourceNode | undefined {
    if (!this.isSupported || !this.context) return;
    const buffer = this.buffers[name];
    if (!buffer) return;
    // Until the page has had a click or a key press the browser keeps the context suspended.
    // Don't queue sounds up to all play at once when it starts.
    if (this.context.state !== 'running') {
      this.context.resume().catch(() => {});
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.start();
    return source;
  }

  /**
   * The one audio context, created on first use. Browsers start it suspended until the page
   * has had a user gesture, and some only allow resume() inside one, so resume it on the first
   * click or key press.
   */
  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      if (typeof window !== 'undefined') {
        const unlock = () => {
          this.context?.resume().then(() => {
            window.removeEventListener('pointerdown', unlock, true);
            window.removeEventListener('keydown', unlock, true);
          }, () => {});
        };
        window.addEventListener('pointerdown', unlock, true);
        window.addEventListener('keydown', unlock, true);
      }
    }
    return this.context;
  }
}

export default SoundKit;
