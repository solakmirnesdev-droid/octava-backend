/**
 * Outbound email.
 *
 * Two transports behind one interface. Without a provider key configured, mail
 * is printed to the console with the link spelled out — the whole flow is then
 * exercisable in development without an account anywhere. Adding the key
 * switches to real delivery with no code change, so the untested path is never
 * the one that runs in production.
 *
 * Delivery goes over the provider's HTTP API rather than SMTP, which keeps this
 * to fetch and no dependency.
 */
const PROVIDER = process.env.MAIL_PROVIDER || 'console';
const API_KEY = process.env.MAIL_API_KEY || '';
const FROM = process.env.MAIL_FROM || 'Octava <onboarding@resend.dev>';

const TRANSPORTS = {
  /** Prints the message. The link is on its own line so it can be clicked. */
  console: async ({ to, subject, text }) => {
    console.log('\n' + '─'.repeat(64));
    console.log('EMAIL (nije poslan — MAIL_PROVIDER nije podesen)');
    console.log('  za:    ' + to);
    console.log('  tema:  ' + subject);
    console.log('─'.repeat(64));
    console.log(text);
    console.log('─'.repeat(64) + '\n');
    return { delivered: false, transport: 'console' };
  },

  resend: async ({ to, subject, text, html }) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, html })
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend odbio poruku (${res.status}): ${detail.slice(0, 200)}`);
    }
    return { delivered: true, transport: 'resend' };
  }
};

export async function sendMail(message) {
  const transport = TRANSPORTS[PROVIDER] || TRANSPORTS.console;

  // A provider named but not configured would fail on every send; fall back
  // loudly rather than losing mail silently.
  if (PROVIDER !== 'console' && !API_KEY) {
    console.warn(`MAIL_PROVIDER=${PROVIDER} bez MAIL_API_KEY — vracam se na konzolu.`);
    return TRANSPORTS.console(message);
  }

  return transport(message);
}

export const mailerMode = () => (PROVIDER === 'console' || !API_KEY ? 'console' : PROVIDER);
