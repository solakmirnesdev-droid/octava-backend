import { runQuadrantWorker } from './lib/quadrant_runner.js';
runQuadrantWorker({
  name: 'Quadrant-1-TopDown',
  quadrantIndex: 0,
  totalQuadrants: 4,
  direction: 'asc',
  color: '\x1b[32m'
});
