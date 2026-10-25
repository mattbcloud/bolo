/**
 * Static files: the built client, and the images and sounds the client loads at start-up.
 *
 * Only those are served. The project folder itself used to be served whole, which exposed the
 * source, the configs and, on a dev machine, the Firebase service-account key.
 */

import path from 'path';
import serveStatic from 'serve-static';

const ONE_DAY = '1d';
const ONE_YEAR = '1y';

/** The project-folder directories the client loads from (soundkit, images). Nothing else. */
const ASSET_DIRS = ['images', 'sounds'];

/**
 * Mount the static-file handlers on a connect app.
 *
 * - dist/client/assets/: content-hashed by Vite, so cached for a year and marked immutable.
 * - dist/client/index.html (and anything else there): `no-cache`, so a new build is picked up
 *   at once; the browser still revalidates with its ETag rather than downloading every time.
 * - images/ and sounds/: cached for a day.
 */
export function mountStatic(app: any, webroot: string): void {
  app.use('/assets', serveStatic(path.join(webroot, 'dist/client/assets'), {
    maxAge: ONE_YEAR,
    immutable: true,
    index: false,
  }));
  app.use('/', serveStatic(path.join(webroot, 'dist/client'), {
    setHeaders: (res: any) => res.setHeader('Cache-Control', 'no-cache'),
  }));
  for (const dir of ASSET_DIRS) {
    app.use(`/${dir}`, serveStatic(path.join(webroot, dir), { maxAge: ONE_DAY, index: false }));
  }
}
