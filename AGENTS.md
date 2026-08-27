# AGENTS.md — octava-backend

Shared instructions for every AI tool that touches this repository:
Claude Code, Antigravity, Gemini CLI, Aider, Cursor, and anything added later.

---

## Read this first

**[AI-NOTES.md](./AI-NOTES.md) is the single source of truth for this project.**

Do not start work until you have read it. It carries the architecture map, the
UI conventions, the decision log with reasoning, and the known traps. This file
is a pointer and a rulebook; the knowledge lives there.

---

## Non-negotiable rules

### Git
- **Never `git add` and never commit on your own.** Mirnes reviews every diff in
  the VS Code Source Control panel first. Staged or committed work disappears
  from that panel and stops being reviewable.
- **Never `git push` without explicit approval, every single time.** Previous
  approval covers that one push only — never later pushes in the same session.
- Same rule for anything outward-facing: force push, tags, remote branch
  deletion, opening or merging pull requests.
- Never `git stash`, `git checkout -- <file>`, or `git restore` to tidy up.
  Those erase reviewable work too.

### Documentation — leave permanent traces
Work that is not written down is lost at the next context reset. Before you
finish a task of any significance:

1. Log the decision and **the reasoning behind it** in AI-NOTES.md §5.
2. Log any trap you hit in AI-NOTES.md §6.
3. Update AI-NOTES.md §4 if you set or changed a UI convention.
4. Update AI-NOTES.md §7 with what is still open.
5. Leave an anchor comment at the code site.

### End of session — recap
When Mirnes says **"do a recap"**, sweep the whole session and write everything
worth keeping into this repo's `AI-NOTES.md` plus anchor comments at the code
sites: decisions and their reasoning, traps, failed approaches, UI conventions,
open threads, setup facts. Leave it unstaged.

### Anchor comments
| Tag | Use for |
|---|---|
| `AI-NOTE:` | Context a reader needs to not break this code |
| `AI-DECISION:` | Why it was built this way — cite the AI-NOTES section |
| `AI-TRAP:` | A footgun; what breaks if you "fix" it naively |
| `AI-TODO:` | Deliberate incomplete work, and what is missing |

```bash
rg 'AI-(NOTE|DECISION|TRAP|TODO):'
```

### UI consistency
Staying visually consistent across sessions is the hardest part of this
workflow. Before writing any UI:

1. Read AI-NOTES.md §4 in full.
2. Open the exemplar files it names and copy their structure.
3. Use the project's tokens and utility classes — never hardcoded values.
4. If you invent a new pattern, document it in §4 in the same change.

---

## Model routing

| Task | Model |
|---|---|
| High-level planning, architecture | **Fable** — only when Mirnes explicitly asks for it |
| Logic, structure, bugs, debugging | **Opus 5** |
| **UI** — borders, spacing, colors, layout, visual bugs, regressions | **Opus 5, fast mode** |
| Research, docs lookup, summarizing | **Gemini** — `ask-gemini "..."` (optional, quota-limited) |
| Everyday non-work chat | Sonnet / Haiku |

Never invoke Fable on your own initiative.

**UI is Opus 5 work, in fast mode** (`/fast` — Opus 5 with faster output, not a
smaller model). Gemini was trialled for UI and dropped: Google cut the Gemini
CLI off from individual accounts, leaving a free-tier key at ~20 requests/day,
which one agentic UI edit nearly exhausts. Do UI yourself, following the UI
conventions in AI-NOTES.md §4 — fast mode does not lower that bar.

Whenever a prompt IS passed to the Gemini CLI, say so in bold:
**PASSED TO GEMINI 3.7 FLASH MODEL (HIGH)** — and never present its output as
your own.

---

## Working agreement

- Do the task that was asked. Do not silently widen or narrow the scope.
- If something is ambiguous and the readings lead to different work, ask.
- Report honestly: if tests fail, say so with the output; if you skipped a step,
  say that.
- Verify before claiming done — run the lint / build / test the project uses.
