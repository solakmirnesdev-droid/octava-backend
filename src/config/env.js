/**
 * Loads and validates the environment, once, before anything else runs.
 *
 * AI-TRAP: this must be the FIRST import of the entry point, not a call in its
 * body. ESM evaluates every import before the module body, so the old
 * `dotenv.config()` on line two actually ran after the whole application graph
 * had already been imported — which is why the mailer, Turnstile and Google
 * clients each had to re-read process.env at call time instead of reading it
 * once. Importing this module first makes that unnecessary.
 *
 * Which file is read depends on NODE_ENV: .env.prod in production, .env.dev
 * otherwise, with plain .env as a fallback so an existing setup keeps working.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mode = process.env.NODE_ENV || 'development';

const candidates = mode === 'production'
  ? ['.env.prod', '.env']
  : mode === 'test'
    ? ['.env.test', '.env.dev', '.env']
    : ['.env.dev', '.env'];

const loaded = candidates.find((name) => fs.existsSync(path.join(root, name)));
if (loaded) dotenv.config({ path: path.join(root, loaded) });

/**
 * Everything the application reads, declared in one place.
 *
 * Optional entries are genuinely optional — the site runs without Google
 * sign-in or a CAPTCHA. Required ones stop the process rather than surfacing
 * as a confusing failure at the first login.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI je obavezan'),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET je obavezan'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Comma-separated in the file, a list everywhere else.
  CORS_ORIGIN: z.string().optional(),
  APP_URL: z.string().url().optional(),

  /*
   * How a subscription is paid for.
   *
   * 'simulated' hands out access on request, with no money involved — usable
   * while a provider is being chosen, and refused in production below.
   */
  PAYMENTS_MODE: z.enum(['simulated', 'disabled']).default('simulated'),
  /** With the gate off, every song reads as it always did. */
  PAYWALL_ENABLED: z.enum(['true', 'false']).default('false'),

  MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  MAIL_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),

  BACKUP_DIR: z.string().optional(),
  BACKUP_KEY: z.string().optional(),
  BACKUP_KEEP_DAYS: z.coerce.number().int().positive().default(14),

  // Opt-in switch the rate-limit suite uses; off elsewhere under test.
  RATE_LIMIT: z.enum(['on', 'off']).optional()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  console.error(`Neispravno okruženje (${loaded || 'bez .env fajla'}):\n${lines.join('\n')}`);
  process.exit(1);
}

const value = parsed.data;

// Production-only rules. A short secret is fine while developing and is not
// fine facing the internet.
if (value.NODE_ENV === 'production') {
  const fatal = [];
  if (value.JWT_SECRET.length < 32) fatal.push('JWT_SECRET mora imati bar 32 znaka u produkciji.');
  if (!value.CORS_ORIGIN) fatal.push('CORS_ORIGIN mora biti postavljen u produkciji.');
  if (value.MAIL_PROVIDER === 'console') fatal.push('MAIL_PROVIDER=console u produkciji ne šalje poštu.');
  /*
   * AI-TRAP: this one is not a warning. PAYMENTS_MODE=simulated exposes an
   * endpoint that grants a paid subscription to anybody who asks for it — left
   * on in production it is not a misconfiguration, it is a way in.
   */
  if (value.PAYMENTS_MODE === 'simulated') {
    fatal.push('PAYMENTS_MODE=simulated u produkciji poklanja pretplatu svakome ko je zatraži.');
  }
  if (fatal.length) { console.error(fatal.map((f) => `  ${f}`).join('\n')); process.exit(1); }

  // Warnings, not failures: the site works without these, just with less.
  if (!value.GOOGLE_CLIENT_ID) console.warn('[env] GOOGLE_CLIENT_ID nije postavljen — Google prijava je nedostupna.');
  if (!value.TURNSTILE_SECRET_KEY) console.warn('[env] TURNSTILE_SECRET_KEY nije postavljen — CAPTCHA je isključena.');
  if (!value.BACKUP_KEY) console.warn('[env] BACKUP_KEY nije postavljen — sigurnosne kopije se ne šifruju.');
}

export const env = Object.freeze({
  ...value,
  corsOrigins: value.CORS_ORIGIN
    ? value.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:8000'],
  isProduction: value.NODE_ENV === 'production',
  isTest: value.NODE_ENV === 'test',
  envFile: loaded || null
});

export default env;
