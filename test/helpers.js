/**
 * Test harness.
 *
 * Every run points at its own database and drops it afterwards, so a test can
 * never read or destroy development data. The name is deliberately distinct
 * from anything a person would type by hand.
 */
/**
 * A database per test file.
 *
 * The runner executes files in parallel, and every suite wipes collections
 * before each test — so a single shared database means the suites destroy each
 * other's fixtures. Each file passing individually while the set fails together
 * is the worst outcome: it teaches people to ignore red.
 */
const suite = (process.argv[1] || 'unknown')
  .split('/').pop()
  .replace(/\.test\.js$/, '')
  .replace(/[^a-z0-9]/gi, '_');

/*
 * The real credentials, pointed at a throwaway database.
 *
 * AI-TRAP: this used to be a hard-coded `mongodb://127.0.0.1:27017/...` with no
 * user in it, which worked only because the server accepted anyone. With
 * authorization enabled that string fails to connect and every one of the 221
 * tests errors at `before`. The credentials come from .env; only the database
 * name is swapped, so a test run still cannot touch real data.
 */
const ENV = new URL('../.env', import.meta.url).pathname;
const base = (await import('node:fs')).readFileSync(ENV, 'utf8')
  .split('\n').find((line) => line.startsWith('MONGODB_URI='))?.slice('MONGODB_URI='.length).trim();

if (!base) throw new Error('MONGODB_URI nije u .env — testovi ne znaju kako da se poveze.');

const uri = new URL(base);
uri.pathname = `/octava_test_${suite}`;
process.env.MONGODB_URI = uri.toString();
process.env.JWT_SECRET = 'test-secret-not-used-anywhere-else-0123456789';
process.env.NODE_ENV = 'test';

const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../src/app.js');

let server;
let baseUrl;

export async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  // Port 0 asks the OS for a free one, so tests never collide with the dev
  // server or with each other.
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  return baseUrl;
}

export async function stop() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await new Promise((resolve) => server.close(resolve));
}

export async function reset() {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
}

/** Thin fetch wrapper returning both status and parsed body. */
export async function api(path, { method = 'GET', body, token, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(baseUrl + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  return {
    status: res.status,
    body: await res.json().catch(() => ({})),
    setCookie: res.headers.getSetCookie?.() || []
  };
}

export { mongoose };
