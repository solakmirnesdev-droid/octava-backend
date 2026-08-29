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
 * What the wall actually asks for: 'account' or 'subscription'.
 *
 * AI-DECISION: a setting rather than an edit, because the answer is known to be
 * temporary. Payments are not designed yet, so for now signing in is enough and
 * the wall exists to make people register. When there is something to sell, this
 * becomes `subscription` in the environment — no code change, and the
 * subscription path below stays covered by tests in the meantime so it cannot
 * rot while it is switched off.
 */
export const paywallRequires = () =>
  (process.env.PAYWALL_REQUIRES === 'subscription' ? 'subscription' : 'account');

/**
 * May this request read paid content?
 *
 * Staff always may: an editor checking a song they are about to publish is not
 * a customer, and making them buy the catalogue they maintain is absurd.
 */
export function mayReadPaid(req) {
  if (!paywallOn()) return true;
  if (req.staff) return true;
  if (!req.user) return false;
  if (paywallRequires() === 'account') return true;
  return Boolean(req.user.subscriptionActive?.());
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
  /*
   * 402 only when payment is genuinely what is missing. While the wall asks for
   * an account, a signed-out visitor is one sign-in away and nothing is for
   * sale — answering "this is part of a subscription" would name a price that
   * does not exist.
   */
  const needsPayment = req.user && paywallRequires() === 'subscription';
  return res.status(needsPayment ? 402 : 401).json({
    message: needsPayment
      ? 'Ovaj sadržaj je dio pretplate.'
      : 'Prijavi se da vidiš akorde.',
    reason: needsPayment ? 'subscription_required' : 'login_required'
  });
}
