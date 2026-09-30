import path from 'node:path';
import {
  assertClientBuildSafe,
  assertServiceWorkerNavigation,
} from '../src/server/services/clientBuildBoundary';

try {
  assertClientBuildSafe(path.resolve('dist'));
  console.log('Client build contains no server bundles, source maps or private input directories.');
  assertServiceWorkerNavigation(path.resolve('dist'));
  console.log('Service worker leaves /api/ and /uploads/ navigations to the network.');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
