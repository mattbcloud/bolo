import { describe, it, expect, beforeAll } from 'vitest';

/**
 * The aim telemetry is a MEASURING INSTRUMENT for a bug that only exists live, so it gets tested
 * like one. Twice this session a probe reported a proxy and produced a confident wrong diagnosis
 * (wall-bulldozing shells scored as "misses"; a base-under-pill hypothesis built on a probe that
 * never checked coverage). An uninstrumented instrument is how that happens.
 *
 * What it has to get right, driven here through a hand-scripted hull:
 *   cmdLatency        ticks from asking for a turn to the hull actually moving. ~0-1 when the brain
 *                     writes the tank's flags in-process (the offline harness, authority=true);
 *                     a round trip when it sends START/STOP to the server (live, authority=false).
 *                     This is the number the harness fundamentally cannot produce.
 *   cmdRev / hullRev  how often the turn reverses — the visible left-right jerk.
 *   fireWhileTurning  share of trigger pulls taken mid-swing. Measured offline, those land 51.6%
 *                     against 79.9% for shots taken settled, so this number IS the accuracy.
 */
describe('live aim telemetry counts what it claims to count', () => {
  let proto: any;

  beforeAll(async () => {
    (globalThis as any).document = {
      createElement: () => ({ style: { cssText: '' }, remove() {} }),
      body: { appendChild() {} }, getElementById: () => null,
    };
    (globalThis as any).WebSocket = class {};
    const M: any = await import('./client');
    proto = (M.BoloClientWorld ?? M.default).prototype;
  });

  /** Mirrors the `_aim` class field. If that shape changes this fails loudly, which is the point. */
  const freshAim = () => ({
    ticks: 0,
    turnCmdTicks: 0, turnCmdReversals: 0,
    hullTurnTicks: 0, hullReversals: 0,
    fireCmds: 0, fireWhileTurning: 0,
    aimErrSum: 0, aimErrN: 0,
    latSum: 0, latN: 0,
    _prevCmdDir: 0, _prevHullDir: 0,
    _prevFacing: null as number | null,
    _turnCmdAtTick: -1,
  });

  /** Drive the sampler over a script of [facing, turnCmd, shooting] and flush. */
  function run(script: Array<[number, 'cw' | 'ccw' | null, boolean]>) {
    const self: any = {
      player: { direction: 0, x: 0, y: 0 },
      _brainPrev: { shooting: false } as any,
      _aim: freshAim(),
    };
    const a4: any = { tickCounter: 0, pillToGetTarget: null, tankToKillTarget: null };
    script.forEach(([facing, cmd, shooting], i) => {
      a4.tickCounter = i;
      self.player.direction = facing;
      const next = {
        turningClockwise: cmd === 'cw',
        turningCounterClockwise: cmd === 'ccw',
        shooting,
      };
      // Real call order: sample BEFORE the prev snapshot, so the false->true trigger edge is visible.
      proto._aimSample.call(self, a4, next);
      self._brainPrev.shooting = shooting;
    });
    return proto._aimFlush.call(self);
  }

  it('measures command-to-motion latency, reversals, and mid-swing fire', () => {
    const s = run([
      [0, 'ccw', false],   // t0 turn asked for, hull static -> stopwatch starts
      [0, 'ccw', false],   // t1 still static
      [0, 'ccw', false],   // t2 still static
      [2, 'ccw', false],   // t3 hull finally moves -> latency 3
      [4, 'ccw', false],   // t4 still going CCW
      [3, 'cw',  false],   // t5 command AND hull reverse
      [3, null,  true],    // t6 fire with the hull settled
      [5, 'ccw', true],    // t7 hull reverses back (no new trigger edge)
      [7, 'ccw', false],
      [9, 'ccw', true],    // t9 fire mid-swing
    ]);

    expect(s.ticks).toBe(10);
    expect(s.cmdLatency, 'ticks from turn command to hull motion').toBe(3);
    expect(s.latN).toBe(1);

    // 9 of 10 ticks commanded a turn; only t5 flips a non-zero command to the opposite sign
    // (t7 follows a no-command tick, which deliberately does not count as a reversal).
    expect(s.turnCmd).toBe(90);
    expect(s.cmdReversals).toBe(Math.round((1000 * 1) / 9) / 10);

    // Hull moved on t3,t4,t5,t7,t8,t9; it reversed at t5 and again at t7.
    expect(s.hullReversals).toBe(Math.round((1000 * 2) / 6) / 10);

    // Two trigger pulls (t6, t9); one of them mid-swing.
    expect(s.fires).toBe(2);
    expect(s.fireWhileTurning).toBe(50);

    // No target supplied, so no aim-error samples — reported as null, never as a misleading 0.
    expect(s.aimErrAvg).toBeNull();
  });

  it('reports a settled, zero-latency hull as clean — the offline signature', () => {
    const s = run([
      [0, 'ccw', false],
      [2, 'ccw', false],   // moves the very next tick -> latency 1
      [4, 'ccw', false],
      [4, null,  true],    // fires settled
      [4, null,  true],
    ]);
    expect(s.cmdLatency).toBe(1);
    expect(s.hullReversals).toBe(0);
    expect(s.fires).toBe(1);
    expect(s.fireWhileTurning).toBe(0);
  });

  it('flushing resets the window, so the console line and the POST cannot double-count', () => {
    const self: any = {
      player: { direction: 0, x: 0, y: 0 },
      _brainPrev: { shooting: false } as any,
      _aim: freshAim(),
    };
    const a4: any = { tickCounter: 0, pillToGetTarget: null, tankToKillTarget: null };
    proto._aimSample.call(self, a4, { turningClockwise: false, turningCounterClockwise: true, shooting: false });
    expect(proto._aimFlush.call(self).ticks).toBe(1);
    expect(proto._aimFlush.call(self).ticks).toBe(0);
  });
});
