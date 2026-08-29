/**
 * Paid access, checked on the server.
 *
 * AI-DECISION: the gate lives here and nowhere else. A paywall enforced in the
 * page is decoration — the content has already been sent, and anybody who opens
 * the network tab has it. Whatever the reader is not entitled to must never
 * leave this process.
 */

/*
 * Read at call time, not at import.
 *
 * AI-DECISION: the same reason utils/mailer.js gives. config/env.js parses once
 * and freezes the result, so a module that captures a value on load can never
 * see it change — which makes the gate untestable and makes a deployment that
 * flips the flag require a restart to be believed.
 */
export const paywallOn = () => process.env.PAYWALL_ENABLED === 'true';

/** How a subscription may be paid for right now. */
export const paymentsMode = () => process.env.PAYMENTS_MODE || 'simulated';

/**
 * May this request read paid content?
 *
 * Staff always may: an editor checking a song they are about to publish is not
 * a customer, and making them buy the catalogue they maintain is absurd.
 */
export function mayReadPaid(req) {
  if (!paywallOn()) return true;
  if (req.staff) return true;
  return Boolean(req.user?.subscriptionActive?.());
}

/**
 * Hard gate for routes that have nothing to offer without a subscription.
 *
 * 402 rather than 403: the request is understood and the account is known, and
 * what is missing is payment. The client uses the difference to decide between
 * showing a sign-in prompt and showing the price.
 */
export function requireSubscription(req, res, next) {
  if (mayReadPaid(req)) return next();
  return res.status(402).json({
    message: 'Ovaj sadržaj je dio pretplate.',
    reason: req.user ? 'subscription_required' : 'login_required'
  });
}
