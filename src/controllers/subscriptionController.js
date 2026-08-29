import User from '../models/User.js';
import { paywallOn, paymentsMode } from '../middleware/subscription.js';

/**
 * Subscriptions, with no payment provider behind them yet.
 *
 * AI-DECISION: the plans are defined here rather than in the page, so the price
 * a reader is shown and the period they are granted come from one place. When a
 * provider is wired in, its product ids attach to these entries and nothing else
 * moves.
 */
export const PLANS = {
  monthly: { key: 'monthly', price: 5, currency: 'BAM', days: 31 },
  yearly: { key: 'yearly', price: 45, currency: 'BAM', days: 366 }
};

export function listPlans(_req, res) {
  res.json({
    plans: Object.values(PLANS),
    // The page needs to know both, and for different reasons: whether to show
    // prices at all, and whether the button can actually do anything.
    paywall: paywallOn(),
    mode: paymentsMode()
  });
}

export function mySubscription(req, res) {
  res.json({ subscription: req.user.toPublic().subscription, paywall: paywallOn() });
}

/**
 * Grants a subscription without taking any money.
 *
 * AI-TRAP: this is an endpoint that hands out paid access to whoever calls it.
 * It is refused unless PAYMENTS_MODE is 'simulated', and env.js refuses to boot
 * production in that mode at all — two locks, because one of them is a string in
 * a file somebody could copy into the wrong environment.
 */
export async function simulateSubscribe(req, res, next) {
  try {
    if (paymentsMode() !== 'simulated') {
      return res.status(409).json({ message: 'Plaćanje nije podešeno.' });
    }

    const plan = PLANS[req.body?.plan];
    if (!plan) return res.status(400).json({ message: 'Nepoznat plan.' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    /*
     * Renewing adds to what is left rather than replacing it. Somebody who pays
     * again on the last day of a period should not lose that day, and somebody
     * who pays early should not be punished for it.
     */
    const from = user.subscriptionActive() ? user.subscription.expiresAt : new Date();
    const expires = new Date(from.getTime() + plan.days * 24 * 60 * 60 * 1000);

    user.subscription = {
      status: 'active',
      plan: plan.key,
      startedAt: user.subscription?.startedAt || new Date(),
      expiresAt: expires,
      cancelledAt: null,
      source: 'simulated'
    };
    await user.save();

    res.json({ subscription: user.toPublic().subscription });
  } catch (err) { next(err); }
}

/**
 * Stops the renewal; does not take away what is already paid for.
 *
 * The status becomes 'cancelled' and the date stays put — subscriptionActive()
 * reads them together, so access runs out on its own.
 */
export async function cancelSubscription(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user?.subscriptionActive()) {
      return res.status(409).json({ message: 'Nema aktivne pretplate.' });
    }

    user.subscription.status = 'cancelled';
    user.subscription.cancelledAt = new Date();
    await user.save();

    res.json({ subscription: user.toPublic().subscription });
  } catch (err) { next(err); }
}
