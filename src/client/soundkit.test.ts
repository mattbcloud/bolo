import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SoundKit } from './soundkit';

/**
 * Each sound is downloaded and decoded once, then played from memory. It used to be fetched
 * from the server again on every play (a new Audio element each time).
 */

class FakeSource {
  buffer: any = null;
  started = 0;
  connect() {}
  start() { this.started++; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' = 'running';
  destination = {};
  sources: FakeSource[] = [];
  decodeFails = false;
  constructor() { FakeAudioContext.instances.push(this); }
  decodeAudioData(data: ArrayBuffer) {
    return this.decodeFails ? Promise.reject(new Error('EncodingError')) : Promise.resolve({ decoded: data });
  }
  createBufferSource() { const s = new FakeSource(); this.sources.push(s); return s; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  fetchMock = vi.fn(async (url: string) =>
    url.includes('missing')
      ? new Response(null, { status: 404 })
      : new Response(new ArrayBuffer(8), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** load() and wait for its callback. */
function load(kit: SoundKit, name: string, url: string): Promise<void> {
  return new Promise((resolve) => kit.load(name, url, resolve));
}

describe('SoundKit', () => {
  it('downloads a sound once, however often it plays', async () => {
    const kit = new SoundKit();
    await load(kit, 'shootingSelf', 'sounds/shooting_self.ogg');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) (kit as any).shootingSelf();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.sources.length).toBe(10);
    expect(ctx.sources.every((s) => s.started === 1 && s.buffer)).toBe(true);
  });

  it('plays overlapping copies of one sound, each on its own source', async () => {
    const kit = new SoundKit();
    await load(kit, 'hitTankSelf', 'sounds/hit_tank_self.ogg');

    const a = kit.play('hitTankSelf') as any;
    const b = kit.play('hitTankSelf') as any;

    expect(a && b).toBeTruthy();
    expect(a === b).toBe(false);
    expect(a.started).toBe(1);
    expect(b.started).toBe(1);        // the first wasn't stopped or reused
    expect(a.buffer === b.buffer).toBe(true);
  });

  it('shares one audio context between sounds', async () => {
    const kit = new SoundKit();
    await load(kit, 'a', 'sounds/a.ogg');
    await load(kit, 'b', 'sounds/b.ogg');
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('a missing file still reports progress and leaves only that sound silent', async () => {
    const kit = new SoundKit();
    await load(kit, 'gone', 'sounds/missing.ogg');
    await load(kit, 'here', 'sounds/here.ogg');

    expect(kit.play('gone')).toBeUndefined();
    expect(kit.play('here')).toBeDefined();
    expect(kit.isSupported).toBe(true);
  });

  it('a file the browser can\'t decode still reports progress, and turns sound off', async () => {
    const kit = new SoundKit();
    const loading = load(kit, 'odd', 'sounds/odd.ogg');
    FakeAudioContext.instances[0].decodeFails = true;
    await loading;

    expect(kit.isSupported).toBe(false);
    expect(kit.play('odd')).toBeUndefined();
  });

  it('while the context is suspended, play() resumes it instead of queuing the sound', async () => {
    const kit = new SoundKit();
    await load(kit, 'boom', 'sounds/boom.ogg');
    const ctx = FakeAudioContext.instances[0];
    ctx.state = 'suspended';

    expect(kit.play('boom')).toBeUndefined();
    expect(ctx.sources.length).toBe(0);
    expect(ctx.state).toBe('running');
    expect(kit.play('boom')).toBeDefined();
  });

  it('the first key press resumes a suspended context', async () => {
    const kit = new SoundKit();
    await load(kit, 'boom', 'sounds/boom.ogg');
    const ctx = FakeAudioContext.instances[0];
    ctx.state = 'suspended';

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

    expect(ctx.state).toBe('running');
  });

  it('without Web Audio, it isn\'t supported, still reports progress, and plays nothing', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const kit = new SoundKit();
    expect(kit.isSupported).toBe(false);
    await load(kit, 'x', 'sounds/x.ogg');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(kit.play('x')).toBeUndefined();
  });
});
