import User from '../models/User.js';
import AuditLog, { diff } from '../models/AuditLog.js';
import Staff from '../models/Staff.js';
import { ROLE_RANK } from '../middleware/auth.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

/**
 * Account administration, restricted to superadmin.
 *
 * Password hashes, reset tokens and TOTP secrets carry select:false on their
 * models, so they cannot reach this response even by accident — the protection
 * lives at the schema rather than in a field list somebody has to remember to
 * keep in step.
 */

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listUsers(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = {};

    if (req.query.q) {
      const pattern = new RegExp(escapeRegex(req.query.q.trim()), 'i');
      filter.$or = [{ email: pattern }, { username: pattern }];
    }

    // Never signed in is a different state from signed in long ago, and the
    // two need telling apart when deciding whether an account is dormant.
    if (req.query.filter === 'never') filter.lastLoginAt = { $exists: false };
    if (req.query.filter === 'active') {
      filter.lastLoginAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }
    /*
     * Paying, by the only definition that matters: the period they bought has
     * not run out. Status alone would list somebody who cancelled months ago
     * and miss somebody whose renewal failed this morning.
     */
    if (req.query.filter === 'subscribed') {
      filter['subscription.expiresAt'] = { $gt: new Date() };
      filter['subscription.status'] = { $in: ['active', 'cancelled'] };
    }

    const sort = req.query.sort === 'lastLogin'
      ? { lastLoginAt: -1 }
      : { createdAt: -1 };

    const [users, total, stats] = await Promise.all([
      User.find(filter).sort(sort).skip(paging.skip).limit(paging.limit),
      User.countDocuments(filter),
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            everSignedIn: { $sum: { $cond: [{ $ifNull: ['$lastLoginAt', false] }, 1, 0] } },
            activeThisMonth: {
              $sum: {
                $cond: [
                  { $gte: ['$lastLoginAt', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                  1, 0
                ]
              }
            },
            // The number a paid product is actually run on. Expiry is the test, not
            // status: a cancelled subscription is still paid for until its period
            // ends, and an "active" one whose date has passed is not.
            subscribed: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gt: ['$subscription.expiresAt', new Date()] },
                    { $in: ['$subscription.status', ['active', 'cancelled']] }
                  ] },
                  1, 0
                ]
              }
            },
            // Counted apart, because somebody inside a period they already cancelled
            // is leaving — and that is worth seeing before they are gone.
            cancelling: {
              $sum: {
                $cond: [
                  { $and: [
                    { $gt: ['$subscription.expiresAt', new Date()] },
                    { $eq: ['$subscription.status', 'cancelled'] }
                  ] },
                  1, 0
                ]
              }
            }
            }
          }
      ])
    ]);

    res.json({
      users: users.map((u) => ({
        _id: u._id,
        email: u.email,
        username: u.username,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt || null,
        savedCount: u.favorites?.length || 0,
        /*
         * Read through the model method, not off the raw fields. A cancelled
         * subscription is still valid until its date passes, and an active one
         * whose date has gone is not — a dashboard showing `status` alone would
         * disagree with what the reader actually experiences.
         */
        subscription: {
          status: u.subscription?.status || 'none',
          plan: u.subscription?.plan || null,
          expiresAt: u.subscription?.expiresAt || null,
          active: u.subscriptionActive()
        }
      })),
      stats: stats[0] || { total: 0, everSignedIn: 0, activeThisMonth: 0, subscribed: 0, cancelling: 0 },
      meta: pageMeta(total, paging)
    });
  } catch (err) {
    next(err);
  }
}

export async function listStaff(req, res, next) {
  try {
    const staff = await Staff.find().sort({ role: -1, name: 1 });

    res.json({
      staff: staff.map((s) => ({
        _id: s._id,
        email: s.email,
        name: s.name,
        role: s.role,
        active: s.active,
        totpEnabled: s.totpEnabled,
        createdAt: s.createdAt,
        lastLoginAt: s.lastLoginAt || null,
        // The caller cannot act on their own account; the UI greys it out.
        isSelf: s._id.equals(req.staff._id)
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function updateStaff(req, res, next) {
  try {
    const { role, active } = req.body;
    const target = await Staff.findById(req.params.id);
    if (!target) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    const before = { role: target.role, active: target.active };

    // Removing your own powers, or switching yourself off, locks you out of
    // the screen you would need to undo it.
    if (target._id.equals(req.staff._id)) {
      return res.status(400).json({ message: 'Ne možeš mijenjati vlastiti nalog.' });
    }

    if (role !== undefined) {
      if (!ROLE_RANK[role]) return res.status(400).json({ message: 'Nepoznata uloga.' });
      target.role = role;
    }
    if (active !== undefined) target.active = Boolean(active);

    // One superadmin has to remain, or nobody can reach this endpoint again.
    if (target.role !== 'superadmin' || target.active === false) {
      const remaining = await Staff.countDocuments({
        role: 'superadmin', active: true, _id: { $ne: target._id }
      });
      if (remaining === 0) {
        return res.status(400).json({ message: 'Mora ostati barem jedan aktivan superadmin.' });
      }
    }

    await target.save();

    // Changing somebody's rank is the single most consequential thing on the
    // desk, and it used to leave no trace at all.
    const changes = diff(before, { role: target.role, active: target.active }, ['role', 'active']);
    if (changes.length) {
      await AuditLog.record({
        req, action: 'update', entity: 'staff',
        entityId: target._id, entityLabel: target.email, changes
      });
    }

    res.json({ staff: { _id: target._id, role: target.role, active: target.active } });
  } catch (err) {
    next(err);
  }
}

/**
 * Gives a reader a subscription by hand.
 *
 * AI-DECISION: this exists for the support case that always turns up — money
 * left somebody's account and never reached ours, and they are sitting in front
 * of a paywall holding a receipt. Without it the only remedy is editing the
 * database directly, which is the one kind of change the audit log cannot see.
 *
 * AI-TRAP: it is written to the audit log deliberately and by name. An endpoint
 * that hands out paid access is exactly the endpoint somebody will one day be
 * asked to explain, and "an admin did it, at this time, for this account, for
 * this long" is the difference between an answer and a shrug.
 *
 * Extends rather than replaces, for the same reason a renewal does: nobody
 * should lose days they already have because somebody helped them.
 */
export async function grantSubscription(req, res, next) {
  try {
    const days = Number(req.body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 400) {
      return res.status(400).json({ message: 'Broj dana mora biti između 1 i 400.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Nalog nije pronađen.' });

    const from = user.subscriptionActive() ? user.subscription.expiresAt : new Date();
    user.subscription = {
      status: 'active',
      plan: user.subscription?.plan || 'monthly',
      startedAt: user.subscription?.startedAt || new Date(),
      expiresAt: new Date(from.getTime() + days * 24 * 60 * 60 * 1000),
      cancelledAt: null,
      source: 'staff'
    };
    await user.save();

    await AuditLog.record({
      req, action: 'update', entity: 'user',
      entityId: user._id, entityLabel: user.email,
      changes: [{ field: 'subscription', from: 'ručno dodano', to: `+${days} dana` }]
    });

    res.json({ subscription: user.toPublic().subscription });
  } catch (err) { next(err); }
}
