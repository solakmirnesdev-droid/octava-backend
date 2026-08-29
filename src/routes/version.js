import { Router } from 'express';

/**
 * What this server is, and what it expects of its clients.
 *
 * AI-DECISION: shipped with v1 rather than added later, for the same reason the
 * version prefix is. An installed app can only be told "you are too old" if it
 * was already asking — a client released without this call has no way to learn
 * anything, ever, and the only remaining lever is the app store's own update
 * prompt, which people ignore.
 *
 * MINIMUM_CLIENT is read from the environment so a release can be blocked
 * without deploying code: set it, and older builds see the notice on their next
 * launch.
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    api: 'v1',
    // Optional and deliberately loose: "1.4.0" style, compared by the client.
    minimumClient: process.env.MINIMUM_CLIENT || null,
    // Somewhere to put "back at 21:00" during planned downtime.
    notice: process.env.SERVICE_NOTICE || null,
    time: new Date().toISOString()
  });
});

export default router;
