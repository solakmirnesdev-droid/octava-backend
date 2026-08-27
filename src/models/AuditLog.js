import mongoose from 'mongoose';

/**
 * Who changed what, and what it looked like before.
 *
 * AI-DECISION: the actor's name and the subject's title are copied in rather
 * than referenced. An audit trail whose rows turn into "unknown edited unknown"
 * the moment an account is closed or a song is purged is not an audit trail —
 * and those are exactly the rows somebody comes looking for. The ids stay
 * alongside for anything still resolvable. See AI-NOTES.md §5.
 *
 * Song.history is a different thing and stays: it keeps the last twenty bodies
 * of the chord sheet so an editor can undo a bad paste. This records the fact
 * of a change across every entity, not the text.
 */
const auditSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
    actorName: { type: String, default: 'sistem' },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: '' },

    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    entityLabel: { type: String, default: '' },

    /** Field-level before and after. Empty for creates and deletes. */
    changes: [
      {
        _id: false,
        field: String,
        from: mongoose.Schema.Types.Mixed,
        to: mongoose.Schema.Types.Mixed
      }
    ],

    /** Anything action-specific: how many rows a bulk edit touched, a reason. */
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: { type: String, default: '' }
  },
  { timestamps: true }
);

// The two questions anyone actually asks: what happened lately, and what
// happened to this one record.
auditSchema.index({ createdAt: -1 });
auditSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

/** Values worth diffing, flattened so a comparison is a string comparison. */
function normalise(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => String(v?._id ?? v)).sort();
  if (value instanceof Date) return value.toISOString();
  if (mongoose.isValidObjectId(value) && typeof value !== 'string') return String(value);
  if (typeof value === 'object') return String(value._id ?? JSON.stringify(value));
  return value;
}

/**
 * Field-level differences between two states.
 *
 * Only the named fields are compared: a whole-document diff drowns the real
 * change in timestamps, counters and mongoose internals.
 */
export function diff(before, after, fields) {
  const changes = [];

  for (const field of fields) {
    const from = normalise(before?.[field]);
    const to = normalise(after?.[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }

  return changes;
}

/**
 * Writes one entry.
 *
 * AI-TRAP: this must never throw. It is called after the work has already been
 * done and committed, so letting a logging failure escape would turn a
 * successful edit into a 500 and invite the editor to make it twice.
 */
auditSchema.statics.record = async function record({
  req, action, entity, entityId, entityLabel = '', changes = [], meta
}) {
  try {
    const staff = req?.staff;

    await this.create({
      actor: staff?._id,
      actorName: staff?.name || 'sistem',
      actorEmail: staff?.email || '',
      actorRole: staff?.role || '',
      action,
      entity,
      entityId,
      entityLabel,
      changes,
      meta,
      ip: req?.ip || ''
    });
  } catch (err) {
    console.error('[audit] zapis nije spremljen:', err.message);
  }
};

export default mongoose.model('AuditLog', auditSchema);
