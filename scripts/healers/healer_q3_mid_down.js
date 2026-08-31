import { runQuadrantWorker } from '../lib/quadrant_runner.js';
runQuadrantWorker({
  name: 'Quadrant-3-MidDown',
  quadrantIndex: 2,
  totalQuadrants: 4,
  direction: 'asc',
  color: '\x1b[33m'
});
