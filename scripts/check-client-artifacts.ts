import path from 'node:path';
import { assertClientBuildSafe } from '../src/server/services/clientBuildBoundary';

try {
  assertClientBuildSafe(path.resolve('dist'));
  console.log('Client build contains no server bundles, source maps or private input directories.');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
