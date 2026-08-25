/**
 * Moves editorial accounts out of the User collection into Staff.
 *
 *   node scripts/migrateStaff.js
 *
 * Roles used to live on User. They now live in a separate collection, so any
 * account that previously carried worker or admin needs a Staff record. The
 * existing password hash is copied across rather than reset, so the same
 * password keeps working; no plaintext is ever involved.
 *
 * Safe to re-run: accounts already present in Staff are skipped.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Staff from '../src/models/Staff.js';

try {
  await connectDB();

  // Read User documents directly: the model no longer declares `role`, so
  // Mongoose would strip the very field this migration needs to read.
  const users = mongoose.connection.collection('users');
  const legacy = await users.find({ role: { $in: ['worker', 'admin'] } }).toArray();

  if (!legacy.length) {
    console.log('No legacy editorial accounts found. Nothing to migrate.');
  }

  let moved = 0;
  let skipped = 0;

  for (const doc of legacy) {
    if (await Staff.exists({ email: doc.email })) {
      console.log('  already in Staff, skipping: ' + doc.email);
      skipped++;
      continue;
    }

    await Staff.create({
      email: doc.email,
      name: doc.username || doc.email.split('@')[0],
      passwordHash: doc.passwordHash,
      role: doc.role,
      active: true
    });

    console.log('  moved: ' + doc.email + ' (' + doc.role + ')');
    moved++;
  }

  // The public account keeps existing; it simply loses the role that no
  // longer means anything there.
  const cleared = await users.updateMany(
    { role: { $exists: true } },
    { $unset: { role: '' } }
  );

  console.log('');
  console.log('Moved: ' + moved + ', skipped: ' + skipped);
  console.log('Roles cleared from ' + cleared.modifiedCount + ' user document(s).');
  console.log('Staff accounts now: ' + (await Staff.countDocuments()));
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
