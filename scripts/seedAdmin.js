import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import Staff from '../src/models/Staff.js';

try {
  await connectDB();
  const email = 'admin@octava.local';
  let admin = await Staff.findOne({ email });
  if (!admin) {
    admin = await Staff.create({
      email,
      name: 'Administrator',
      role: 'admin',
      passwordHash: await Staff.hashPassword('admin12345')
    });
    console.log('Created admin:', email, 'with password: admin12345');
  } else {
    console.log('Admin already exists:', email);
  }
} catch (e) {
  console.error(e);
} finally {
  await mongoose.disconnect();
}
