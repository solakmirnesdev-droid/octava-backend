import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 4000;

// Connect before listening, so the first request never races the database.
try {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✓ Octava backend running on http://localhost:${PORT}`);
  });
} catch (err) {
  console.error('Failed to start:', err.message);
  process.exit(1);
}
