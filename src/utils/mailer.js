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
/**
 * Configuration is read when a message is sent, not when this module loads.
 *
 * ES module imports are hoisted above the statements around them, so
 * server.js loads the whole application graph before dotenv.config() runs.
 * Reading process.env at load time froze this on 'console' regardless of what
 * the environment actually said — the flow reported success and delivered
 * nothing, which is the worst way for a mailer to fail.
 */
const config = () => ({
  provider: process.env.MAIL_PROVIDER || 'console',
  apiKey: process.env.MAIL_API_KEY || '',
  from: process.env.MAIL_FROM || 'Octava <onboarding@resend.dev>'
});

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
    const { apiKey, from } = config();

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, text, html })
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend odbio poruku (${res.status}): ${detail.slice(0, 200)}`);
    }
    return { delivered: true, transport: 'resend' };
  }
};

export async function sendMail(message) {
  const { provider, apiKey } = config();
  const transport = TRANSPORTS[provider] || TRANSPORTS.console;

  // A provider named but not configured would fail on every send; fall back
  // loudly rather than losing mail silently.
  if (provider !== 'console' && !apiKey) {
    console.warn(`MAIL_PROVIDER=${provider} bez MAIL_API_KEY — vracam se na konzolu.`);
    return TRANSPORTS.console(message);
  }

  const result = await transport(message);
  if (result.delivered) console.log(`Email poslan (${result.transport}) na ${message.to}`);
  return result;
}

export function mailerMode() {
  const { provider, apiKey } = config();
  return provider === 'console' || !apiKey ? 'console' : provider;
}
