import { describe, it, expect, vi, afterEach } from 'vitest';
import { BoloClientWorld } from './world/client';

/**
 * The lobby's Hidden Mines checkbox: a system.css checkbox under the Game Mode dropdown, off by
 * default, whose value goes to the server with the new game.
 */

/** The lobby, rendered by the real showLobby() on a bare object (no game, no network). */
function lobby(): any {
  const world: any = Object.create(BoloClientWorld.prototype);
  world.loadGames = () => {};
  world.loadMaps = () => {};
  world.connectToGame = vi.fn();
  world.showLobby();
  return world;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Hidden Mines in the lobby', () => {
  it('is an unchecked checkbox in a row like Select Map and Game Mode, right below them', () => {
    const world = lobby();
    clearInterval(world.lobbyRefreshInterval);
    const box = document.getElementById('hidden-mines') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);

    // The text on the left, styled like the other two rows' text; the control on the right.
    const rows = ['map-select', 'mode-select', 'hidden-mines'].map(id => document.getElementById(id)!.parentElement!);
    const text = rows.map(row => row.querySelector('label')!);
    expect(text.map(l => l.textContent)).toEqual(['Select Map:', 'Game Mode:', 'Hidden Mines:']);
    expect(new Set(text.map(l => l.getAttribute('style'))).size).toBe(1);
    expect(text[2].nextElementSibling).toBe(box);
    expect(rows[1].nextElementSibling).toBe(rows[2]);

    // system.css draws the box on the label that follows the input.
    const drawn = box.nextElementSibling as HTMLLabelElement;
    expect(drawn.tagName).toBe('LABEL');
    expect(drawn.htmlFor).toBe('hidden-mines');
  });

  it('sends hiddenMines with the new game', async () => {
    const world = lobby();
    clearInterval(world.lobbyRefreshInterval);
    const select = document.getElementById('map-select') as HTMLSelectElement;
    select.innerHTML = '<option value="Everard Island">Everard Island</option>';
    select.value = 'Everard Island';

    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ gid: 'g' }) };
    }));

    await world.createGame();
    (document.getElementById('hidden-mines') as HTMLInputElement).checked = true;
    await world.createGame();

    expect(bodies.map(b => b.hiddenMines)).toEqual([false, true]);
  });
});
