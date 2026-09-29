/**
 * Every web test starts with monitoring routed nowhere (TASK-0054). Route tests stub `fetch` and
 * count the worker calls they expect; a stray event post would be one they did not. Tests about
 * monitoring install their own collector with `routeEvents`.
 */

import { routeEvents } from './lib/telemetry';

routeEvents(() => undefined);
