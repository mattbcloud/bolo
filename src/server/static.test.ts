// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { fileURLToPath } from 'url';
import { Application } from './application';

// Static files: cache lifetimes for the sounds, images and hashed client assets, and nothing
// else from the project folder (it used to be served whole). The real server, real project folder.

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
let app: Application;
let base: string;

const get = (p: string) => fetch(`${base}${p}`);
const maxAge = (res: Response) => {
  const m = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
  return m ? Number(m[1]) : null;
};

beforeAll(async () => {
  app = new Application({ general: { base: '', maxgames: 5 }, web: { port: 0, log: false } } as any);
  app.listen(0);
  await new Promise(r => app.httpServer.once('listening', r));
  base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
});

afterAll(() => {
  app.loop.stop();
  app.httpServer.close();
});

describe('static files', () => {
  it('sounds are cached for a day', async () => {
    const res = await get('/sounds/shooting_self.ogg');
    expect(res.status).toBe(200);
    expect(maxAge(res)).toBe(86400);
  });

  it('images are cached for a day', async () => {
    const res = await get('/images/base.png');
    expect(res.status).toBe(200);
    expect(maxAge(res)).toBe(86400);
  });

  it('hashed client assets are cached for a year and immutable', async () => {
    const asset = fs.readdirSync(path.join(root, 'dist/client/assets')).find(f => f.endsWith('.js'))!;
    const res = await get(`/assets/${asset}`);
    expect(res.status).toBe(200);
    expect(maxAge(res)).toBe(31536000);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('index.html is not cached, at / and by name', async () => {
    for (const p of ['/', '/index.html']) {
      const res = await get(p);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('<html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(maxAge(res)).toBeNull();
    }
  });

  it('serves nothing else from the project folder', async () => {
    const paths = [
      '/config.json', '/config.railway.json', '/package.json', '/README.md',
      '/src/server/application.ts', '/maps/', '/css/bolo.css', '/test.html',
      '/sounds/', '/images/',
    ];
    // A Firebase service-account key may sit in the project folder on a dev machine.
    for (const f of fs.readdirSync(root)) if (f.includes('firebase-adminsdk')) paths.push(`/${f}`);
    for (const p of paths) {
      expect([p, (await get(p)).status]).toEqual([p, 404]);
    }
  });
});
