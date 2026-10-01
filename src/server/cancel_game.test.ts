// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { Application } from './application';

// Hidden admin endpoint: DELETE /api/games/<gid> with a bearer token.

const TOKEN = 'test-admin-token';
let app: Application;
let base: string;

async function waitFor(cond: () => boolean, ms = 10_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise(r => setTimeout(r, 20));
  }
}

async function createGame(): Promise<string> {
  const res = await fetch(`${base}/api/games`, {
    method: 'POST',
    body: JSON.stringify({ mapName: 'Everard Island' }),
  });
  expect(res.status).toBe(200);
  return (await res.json()).gid;
}

function cancel(gid: string, auth?: string): Promise<Response> {
  return fetch(`${base}/api/games/${gid}`, {
    method: 'DELETE',
    headers: auth ? { Authorization: auth } : {},
  });
}

beforeAll(async () => {
  app = new Application({
    general: { base: '', maxgames: 20 },
    web: { port: 0, log: false },
  } as any);
  app.listen(0);
  await new Promise(r => app.httpServer.once('listening', r));
  base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
  await waitFor(() => !!app.demo);  // map index + demo load are async
});

afterAll(() => {
  app.loop.stop();
  app.httpServer.close();
});

beforeEach(() => { process.env.BOLO_ADMIN_TOKEN = TOKEN; });

describe('DELETE /api/games/<gid>', () => {
  it('is invisible (404) when no admin token is configured', async () => {
    const gid = await createGame();
    delete process.env.BOLO_ADMIN_TOKEN;
    expect((await cancel(gid, `Bearer ${TOKEN}`)).status).toBe(404);
    expect(app.games[gid]).toBeDefined();
  });

  it('is invisible (404) without a token or with a wrong one', async () => {
    const gid = await createGame();
    expect((await cancel(gid)).status).toBe(404);
    expect((await cancel(gid, 'Bearer nope')).status).toBe(404);
    expect((await cancel(gid, TOKEN)).status).toBe(404);  // missing "Bearer "
    expect(app.games[gid]).toBeDefined();
  });

  it('404s an unknown game', async () => {
    expect((await cancel('abcdefghijabcdefghij', `Bearer ${TOKEN}`)).status).toBe(404);
  });

  it('refuses the demo game', async () => {
    const res = await cancel(app.demo.gid, `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
    expect(app.games[app.demo.gid]).toBe(app.demo);
  });

  it('closes a game with a connected client and drops it from the list', async () => {
    const gid = await createGame();
    const ws = new WebSocket(`${base.replace('http', 'ws')}/match/${gid}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    await waitFor(() => app.games[gid].clients.length === 1);
    const closed = new Promise<[number, string]>(r =>
      ws.once('close', (code, reason) => r([code, reason.toString()])));

    const res = await cancel(gid, `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, gid });

    expect(await closed).toEqual([4001, 'Game closed by admin']);
    const list = await (await fetch(`${base}/api/games`)).json();
    expect(list.some((g: any) => g.gid === gid)).toBe(false);
    expect(app.games[gid]).toBeUndefined();
  });
});
