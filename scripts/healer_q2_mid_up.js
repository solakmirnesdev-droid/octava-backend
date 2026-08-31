import { runQuadrantWorker } from './lib/quadrant_runner.js';
runQuadrantWorker({
  name: 'Quadrant-2-MidUp',
  quadrantIndex: 1,
  totalQuadrants: 4,
  direction: 'desc',
  color: '\x1b[36m'
});
