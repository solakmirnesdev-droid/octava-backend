/**
 * A gate in front of scripts that destroy data before they rebuild it.
 *
 * AI-DECISION: the restore scripts drop whole collections before writing a
 * backup back in. That is correct for a restore and catastrophic for anything
 * else, and nothing in the repository calls them — so the only way they ever
 * run is somebody, or some agent, typing the filename. This gate makes that
 * require a sentence you cannot type by accident. It does not make the scripts
 * safe; it makes them deliberate. See AGENTS.md, "Rad s katalogom".
 *
 * AI-TRAP: the environment variable is the whole mechanism. It was renamed
 * from OCTAVA_DOZVOLI_RUSENJE=DA on 2026-09-02, so any older note, shell
 * history entry or agent transcript carrying the previous incantation will now
 * be ignored and the script will stop instead of running. That is the safe
 * direction to fail, but it is why the old name must not be quietly re-added.
 */
export function confirmDestructive(what) {
  const allowed = process.env.OCTAVA_ALLOW_DESTRUCTIVE;
  if (allowed === 'YES') return;

  console.error(`
  ┌────────────────────────────────────────────────────────────┐
  │  STOPPED                                                   │
  └────────────────────────────────────────────────────────────┘

  This script PERMANENTLY DESTROYS DATA:

      ${what}

  If the database is not broken, this is NOT the script you want.
  For everyday work on the catalogue use:

      npm run katalog

  If you really are restoring the database from a backup, run it again
  like this:

      OCTAVA_ALLOW_DESTRUCTIVE=YES node ${process.argv[1]?.split('/').slice(-3).join('/')}
`);
  process.exit(1);
}
