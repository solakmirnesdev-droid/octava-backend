import { runQuadrantWorker } from './lib/quadrant_runner.js';
runQuadrantWorker({
  name: 'Quadrant-4-BottomUp',
  quadrantIndex: 3,
  totalQuadrants: 4,
  direction: 'desc',
  color: '\x1b[35m'
});
