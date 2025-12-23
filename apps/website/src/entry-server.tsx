import { Router } from '@solidjs/router';
import { renderToString } from 'solid-js/web';
import { GeneratedRoutes } from './shared/routes/definition';

export function render(url: string) {
  const html = renderToString(() => (
    <Router url={url}>{GeneratedRoutes}</Router>
  ));
  return { html };
}
