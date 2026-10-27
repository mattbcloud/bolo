import { describe, it, expect, vi, beforeEach } from 'vitest';

// The real keyboard set-up runs in commonInitialization(), alongside the renderer, the overview
// map and the game loop. Those three are stand-ins here; the key handling is the real code.
vi.mock('./renderer/offscreen_2d', () => ({
  default: class { canvas = document.body.appendChild(document.createElement('canvas')); },
}));
vi.mock('./overview', () => ({
  OverviewMap: class { isOpen = false; trackVision() {} render() {} },
}));
vi.mock('../villain/loop', () => ({ createLoop: () => ({}) }));

import * as net from '../net';
import { BoloClientWorld } from './world/client';
import { BoloClientWorldMixin } from './world/mixin';

/**
 * A held key's auto-repeat keydowns (`e.repeat`) do nothing: the first keydown starts the
 * action and the keyup stops it, as before. The browser's own action for the key is still
 * blocked on every repeat (a held Tab must not move focus off the game).
 */

/** A networked client with its real key handlers, recording what it sends. */
function client() {
  const world: any = Object.create(BoloClientWorld.prototype);
  world.map = { setView() {} };
  world.boloInit = () => {};
  world.toggleOverview = vi.fn();
  world.toggleBrainControl = vi.fn();
  BoloClientWorldMixin.commonInitialization.call(world);
  const sent: string[] = [];
  world.ws = { readyState: WebSocket.OPEN, send: (m: string) => sent.push(m) };
  world.player = {};
  world.brainEnabled = false;
  return { world, sent, input: world.input as HTMLInputElement };
}

function key(target: HTMLElement, type: 'keydown' | 'keyup', code: string, repeat = false) {
  const e = new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.cookie = 'keyBindings=; max-age=0';
});

describe('held keys', () => {
  it('a repeated keydown sends nothing; the first keydown and the keyup still do', () => {
    const { sent, input } = client();
    key(input, 'keydown', 'KeyW');
    for (let i = 0; i < 30; i++) key(input, 'keydown', 'KeyW', true);
    key(input, 'keyup', 'KeyW');
    // Releasing accelerate also starts braking: Auto Slowdown is on by default.
    expect(sent).toEqual([net.START_ACCELERATING, net.STOP_ACCELERATING, net.START_BRAKING]);
  });

  it('holds for every driving key: turn, brake, shoot, lay mine', () => {
    const { sent, input } = client();
    for (const [code, start] of [
      ['KeyA', net.START_TURNING_CCW], ['KeyD', net.START_TURNING_CW], ['KeyS', net.START_BRAKING],
      ['Space', net.START_SHOOTING], ['Tab', net.START_LAY_MINE],
    ] as const) {
      sent.length = 0;
      key(input, 'keydown', code);
      key(input, 'keydown', code, true);
      key(input, 'keydown', code, true);
      expect([code, sent]).toEqual([code, [start]]);
      key(input, 'keyup', code);
    }
  });

  it('a repeated keydown is still kept from the browser', () => {
    const { input } = client();
    key(input, 'keydown', 'Tab');
    const repeat = key(input, 'keydown', 'Tab', true);
    expect(repeat.defaultPrevented).toBe(true);
  });

  it('a held overview key opens the map once, and a held brain key toggles once', () => {
    const { world, input } = client();
    key(input, 'keydown', 'KeyO');
    for (let i = 0; i < 10; i++) key(input, 'keydown', 'KeyO', true);
    expect(world.toggleOverview).toHaveBeenCalledTimes(1);

    key(input, 'keydown', 'KeyB');
    for (let i = 0; i < 10; i++) key(input, 'keydown', 'KeyB', true);
    expect(world.toggleBrainControl).toHaveBeenCalledTimes(1);
  });
});
