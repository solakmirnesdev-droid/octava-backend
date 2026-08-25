import User from '../models/User.js';
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
        savedCount: u.favorites?.length || 0
      })),
      stats: stats[0] || { total: 0, everSignedIn: 0, activeThisMonth: 0 },
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
    res.json({ staff: { _id: target._id, role: target.role, active: target.active } });
  } catch (err) {
    next(err);
  }
}
