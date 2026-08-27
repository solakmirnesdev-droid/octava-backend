import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { readPaging, pageMeta } from '../utils/pagination.js';

/**
 * The trail, newest first, narrowed by whatever the reader is asking about.
 *
 * Read-only by design: there is no endpoint that edits or deletes an entry,
 * because a log somebody can quietly correct answers no question worth asking.
 */
export async function list(req, res, next) {
  try {
    const paging = readPaging(req.query);
    const filter = {};

    if (req.query.entity) filter.entity = String(req.query.entity);
    if (req.query.action) filter.action = String(req.query.action);
    if (mongoose.isValidObjectId(req.query.entityId)) filter.entityId = req.query.entityId;
    if (mongoose.isValidObjectId(req.query.actor)) filter.actor = req.query.actor;

    const [entries, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.limit),
      AuditLog.countDocuments(filter)
    ]);

    res.json({ entries, meta: pageMeta(total, paging) });
  } catch (err) {
    next(err);
  }
}

/** The distinct actions and entities present, so the filters can be built. */
export async function facets(_req, res, next) {
  try {
    const [actions, entities] = await Promise.all([
      AuditLog.distinct('action'),
      AuditLog.distinct('entity')
    ]);

    res.json({ actions: actions.sort(), entities: entities.sort() });
  } catch (err) {
    next(err);
  }
}
