/* @refresh reload */
import { render } from 'solid-js/web';
import './index.css';
import { Router } from '@solidjs/router';
import { GeneratedRoutes } from './shared/routes/definition.ts';

const root = document.getElementById('root');

render(() => <Router>{GeneratedRoutes}</Router>, root!);
