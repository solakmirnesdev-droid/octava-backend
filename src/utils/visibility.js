/**
 * What a given caller is allowed to see.
 *
 * AI-DECISION: shared rather than repeated. This is one line, which is exactly
 * why it was tempting to write it twice — and it decides whether unpublished
 * drafts reach the public API. Two copies of a rule like that stay identical
 * only until somebody changes one of them.
 */
export function visibilityFilter(staff) {
  return staff ? {} : { status: 'published' };
}
