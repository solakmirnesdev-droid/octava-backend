/**
 * Creates the first editorial admin, or promotes an existing Staff account.
 *
 * Editorial accounts live in the Staff collection, separate from public site
 * accounts. Creating one here can never touch a reader's account.
 *
 *   node scripts/createAdmin.js
 *
 * The password is read from a hidden prompt rather than an argument or an
 * environment variable, so it never reaches shell history or the process list.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import { connectDB } from '../src/config/db.js';
import Staff from '../src/models/Staff.js';

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE = [String.fromCharCode(127), String.fromCharCode(8)];
const ENTER = [String.fromCharCode(13), String.fromCharCode(10)];

/** Reads a line from stdin without echoing it back to the terminal. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);

    if (!stdin.isTTY) {
      // Piped input cannot be masked; read it as an ordinary line.
      stdin.once('data', (chunk) => resolve(chunk.toString().trim()));
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    let value = '';

    const onData = (chunk) => {
      const char = chunk.toString('utf8');

      if (ENTER.includes(char) || char === CTRL_D) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write(String.fromCharCode(10));
        resolve(value);
      } else if (char === CTRL_C) {
        process.stdout.write(String.fromCharCode(10));
        process.exit(130);
      } else if (BACKSPACE.includes(char)) {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

try {
  await connectDB();

  const email = (await rl.question('Email: ')).toLowerCase().trim();
  const existing = await Staff.findOne({ email });

  if (existing) {
    const confirm = await rl.question(
      existing.email + ' already exists with role "' + existing.role + '". Promote to admin? (y/N) '
    );
    if (confirm.toLowerCase() !== 'y') {
      console.log('Cancelled.');
    } else {
      existing.role = 'admin';
      await existing.save();
      console.log('Done. ' + email + ' is now an admin.');
    }
    rl.close();
  } else {
    const username = (await rl.question('Ime: ')).trim();
    rl.close();

    const password = await askHidden('Password (min 8 chars, hidden): ');
    if (password.length < 8) {
      console.error('Password must be at least 8 characters.');
      process.exit(1);
    }

    await Staff.create({
      email,
      name: username,
      role: 'admin',
      passwordHash: await Staff.hashPassword(password)
    });
    console.log('Done. Admin created: ' + email);
  }
} catch (err) {
  console.error('Failed:', err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
