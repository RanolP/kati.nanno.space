/* @refresh reload */

import { Router } from '@solidjs/router';
import { hydrate } from 'solid-js/web';
import { GeneratedRoutes } from './shared/routes/definition';

hydrate(
  () => <Router url="">{GeneratedRoutes}</Router>,
  document.getElementById('root')!,
);
