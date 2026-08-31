/**
 * A gate in front of scripts that destroy data before they rebuild it.
 *
 * AI-DECISION: the restore scripts drop whole collections before writing a
 * backup back in. That is correct for a restore and catastrophic for anything
 * else, and nothing in the repository calls them — so the only way they ever
 * run is somebody, or some agent, typing the filename. This gate makes that
 * require a sentence you cannot type by accident. It does not make the scripts
 * safe; it makes them deliberate. See AGENTS.md, "Rad s katalogom".
 */
export function potvrdi(sta) {
  const dozvola = process.env.OCTAVA_DOZVOLI_RUSENJE;
  if (dozvola === 'DA') return;

  console.error(`
  ┌────────────────────────────────────────────────────────────┐
  │  ZAUSTAVLJENO                                              │
  └────────────────────────────────────────────────────────────┘

  Ova skripta TRAJNO BRIŠE PODATKE:

      ${sta}

  Ako baza nije pokvarena, ovo NIJE skripta koju tražiš.
  Za svakodnevni rad na katalogu koristi:

      npm run katalog

  Ako stvarno vraćaš bazu iz backupa, pokreni ponovo ovako:

      OCTAVA_DOZVOLI_RUSENJE=DA node ${process.argv[1]?.split('/').slice(-3).join('/')}
`);
  process.exit(1);
}
