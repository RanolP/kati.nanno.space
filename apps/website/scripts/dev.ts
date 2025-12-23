import fs from 'node:fs/promises';
import { Hono } from 'hono';
import { generateHydrationScript } from 'solid-js/web';
import { serve } from '@hono/node-server';
import { IncomingMessage, ServerResponse } from 'node:http';

// Constants
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 5173;
const base = process.env.BASE || '/';

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : '';

// Create Vite server for development
const { createServer } = await import('vite');
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  base,
});

// Create http server
const app = new Hono<{
  Bindings: {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };
}>();

// Use Vite's dev middleware in development
app.use('*', async (c, next) => {
  return new Promise((resolve) => {
    vite.middlewares(c.env.incoming, c.env.outgoing, () => {
      resolve(next());
    });
  });
});

// Serve HTML
app.all('*', async (c) => {
  try {
    const url = c.req.path.replace(base, '');

    /** @type {string} */
    let template;
    /** @type {import('./src/entry-server.js').render} */
    // Always read fresh template in development
    template = await fs.readFile('./index.html', 'utf-8');
    template = await vite.transformIndexHtml(url, template);
    const render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render;

    const rendered = await render(url);

    const head = (rendered.head ?? '') + generateHydrationScript();

    const html = template
      .replace(`<!--app-head-->`, head)
      .replace(`<!--app-html-->`, rendered.html ?? '');

    return c.html(html, 200);
  } catch (e) {
    vite?.ssrFixStacktrace(e);
    console.log(e.stack);
    return c.text(e.stack, 500);
  }
});

serve({ fetch: app.fetch, port: Number(port) }, () => {
  console.log(`Server started at http://localhost:${port}`);
});
